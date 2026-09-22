import { ILlmService, getDefaultLlmService } from "./llm.service";
import { IWebFetcher, SafeWebFetcher } from "./crawler/web-fetcher";
import { IInterviewSearchProvider, getDefaultInterviewSearchProvider } from "./crawler/interview-search";
import { extractRequirementsFromJD } from "./requirement-extraction.service";
import { extractRoleDetails } from "./role-extraction.service";
import { conductCompanyResearch } from "./crawler/company-research.service";
import { generateQuestionBank } from "./question-generation.service";
import { calculateKitCoverage } from "./coverage.service";
import { generateFlashcardsWithFallback } from "./flashcard-generation.service";
import { allocateStudySchedule } from "./scheduling.service";
import { InternalKitData, toAppendixAKitDto, AppendixAKit } from "../../evaluator/dto";

export interface PipelineCaseInput {
  id: string;
  jd: string;
  company_url: string;
  days: number;
}

export interface PipelineOptions {
  llmService?: ILlmService;
  webFetcher?: IWebFetcher;
  searchProvider?: IInterviewSearchProvider;
  allowLocalAddresses?: boolean;
}

export class PipelineError extends Error {
  code: string;
  constructor(message: string, code = "PIPELINE_ERROR") {
    super(message);
    this.name = "PipelineError";
    this.code = code;
  }
}

/**
 * Shared, database-independent kit generation pipeline.
 * Coordinates requirement extraction, honest company research, Pass 1 questions,
 * targeted Pass 2 gap closure, deterministic scheduling, and flashcard generation.
 */
export async function generateFullKitPipeline(
  caseInput: PipelineCaseInput,
  options: PipelineOptions = {}
): Promise<AppendixAKit> {
  const llm = options.llmService || getDefaultLlmService();
  const allowLocal = options.allowLocalAddresses ?? false;
  const webFetcher =
    options.webFetcher || new SafeWebFetcher({ allowLocalAddresses: allowLocal });
  const searchProvider = options.searchProvider || getDefaultInterviewSearchProvider();

  // Validate input parameters
  if (!caseInput.id || typeof caseInput.id !== "string" || !caseInput.id.trim()) {
    throw new PipelineError("Case ID is required and must be a non-empty string.", "INVALID_INPUT");
  }
  if (!caseInput.jd || typeof caseInput.jd !== "string" || !caseInput.jd.trim()) {
    throw new PipelineError("Job description (jd) is required and must be non-empty.", "INVALID_INPUT");
  }
  if (!caseInput.company_url || typeof caseInput.company_url !== "string" || !/^https?:\/\/.+/i.test(caseInput.company_url)) {
    throw new PipelineError("company_url must be a valid HTTP or HTTPS URL.", "INVALID_INPUT");
  }
  if (typeof caseInput.days !== "number" || !Number.isInteger(caseInput.days) || caseInput.days < 1) {
    throw new PipelineError("days must be an integer greater than or equal to 1.", "INVALID_INPUT");
  }

  // 1. Extract Role Details & Structured Requirements from JD
  const roleDetails = extractRoleDetails(caseInput.jd);
  let extractionResult;
  try {
    extractionResult = await extractRequirementsFromJD(caseInput.jd, { llmService: llm });
  } catch (err) {
    throw new PipelineError(
      `Requirement extraction failed: ${(err as Error).message}`,
      "EXTRACTION_FAILED"
    );
  }

  const requirements = extractionResult.requirements;
  if (!requirements || requirements.length === 0) {
    throw new PipelineError("No requirements could be extracted from the job description.", "EXTRACTION_FAILED");
  }

  // 2. Conduct Honest Company Research
  const researchedAt = new Date().toISOString();
  let companyBrief;
  try {
    companyBrief = await conductCompanyResearch({
      companyUrl: caseInput.company_url,
      jobTitle: roleDetails.title,
      jobDescription: caseInput.jd,
      webFetcher,
      searchProvider,
      llmService: llm,
    });
  } catch {
    // Honest fallback on research failure
    companyBrief = {
      summary: "Company information could not be verified from external web sources.",
      productsOrServices: [],
      industry: "",
      hiringProcess: null,
      sources: [],
    };
  }

  // Company Name Rule:
  // Use company name only when verified through company research/source data.
  // If not reliably established, use empty string "".
  // Never manufacture company name from URL path, domain name, job slug, or generic page titles.
  let verifiedCompanyName = "";
  if (companyBrief.sources && companyBrief.sources.length > 0) {
    const verifiedSource = companyBrief.sources.find(
      (s) =>
        s.sourceType === "company_website" &&
        s.title &&
        s.title !== "Company Official Website" &&
        !s.title.includes("localhost")
    );
    if (verifiedSource && verifiedSource.title) {
      const title = verifiedSource.title.trim();

      // Pattern 1: "Company Name - Careers / Jobs / About Us / Home"
      const prefixMatch = title.match(
        /^(.+?)\s*[-|–•]\s*(?:careers?|jobs?|about(?:\s+us)?|home|official(?:\s+site)?|hiring|openings)\b/i
      );

      // Pattern 2: "Careers / Jobs at Company Name"
      const atMatch = title.match(/(?:careers?|jobs?|working|roles?)\s+at\s+([A-Z0-9][a-zA-Z0-9\s&.,'-]+)/i);

      // Pattern 3: "Careers / Jobs - Company Name"
      const suffixMatch = title.match(
        /^(?:careers?|jobs?|about(?:\s+us)?|home|openings)\s*[-|–•]\s*([A-Z0-9][a-zA-Z0-9\s&.,'-]+)$/i
      );

      let candidate = "";
      if (prefixMatch) {
        candidate = prefixMatch[1].trim();
      } else if (atMatch) {
        candidate = atMatch[1].trim();
      } else if (suffixMatch) {
        candidate = suffixMatch[1].trim();
      }

      // Ensure candidate is not a generic term
      if (
        candidate &&
        candidate.length > 1 &&
        candidate.length < 60 &&
        !/^(job\s*postings?|careers?|about(?:\s+us)?|welcome|home|current\s*openings?|job\s*board)$/i.test(candidate)
      ) {
        verifiedCompanyName = candidate;
      }
    }
  }

  const pagesUsed = (companyBrief.sources || []).map((s) => s.url);
  const whatTheyDo =
    companyBrief.productsOrServices && companyBrief.productsOrServices.length > 0
      ? companyBrief.productsOrServices.join(", ")
      : companyBrief.summary || "";

  // 3. Pass 1 Question Generation
  let pass1Questions;
  try {
    pass1Questions = await generateQuestionBank(
      {
        kitId: caseInput.id,
        jobTitle: roleDetails.title,
        jobDescription: caseInput.jd,
        requirements,
        companyBrief,
      },
      {
        llmService: llm,
        startIndex: 1,
      }
    );
  } catch (err) {
    throw new PipelineError(
      `Question generation failed: ${(err as Error).message}`,
      "GENERATION_FAILED"
    );
  }

  // 4. Pass 1 Deterministic Coverage Calculation
  const pass1Coverage = calculateKitCoverage({
    requirements,
    questionBank: pass1Questions,
  });

  // 5. Targeted Pass 2 Gap Generation
  let allQuestions = [...pass1Questions];
  let passesCount = 1;

  if (pass1Coverage.gaps.length > 0) {
    passesCount = 2;
    const gapRequirementIds = new Set(pass1Coverage.gaps.map((g) => g.requirement.id.toUpperCase()));
    const targetedRequirements = requirements.filter((r) => gapRequirementIds.has(r.id.toUpperCase()));

    if (targetedRequirements.length > 0) {
      try {
        const pass2Questions = await generateQuestionBank(
          {
            kitId: caseInput.id,
            jobTitle: roleDetails.title,
            jobDescription: caseInput.jd,
            requirements: targetedRequirements,
            companyBrief: undefined, // Do not generate duplicate company question on Pass 2
          },
          {
            llmService: llm,
            startIndex: pass1Questions.length + 1,
          }
        );

        allQuestions = [...pass1Questions, ...pass2Questions];
      } catch (err) {
        console.warn(`[Pipeline] Pass 2 targeted gap generation warning: ${(err as Error).message}`);
      }
    }
  }

  // 6. Final Coverage Recalculation & Must-Have Verification
  const finalCoverage = calculateKitCoverage({
    requirements,
    questionBank: allQuestions,
  });

  const uncoveredMustHaves = finalCoverage.gaps.filter(
    (g) => (g.requirement.priority || "").toLowerCase() === "must"
  );

  if (uncoveredMustHaves.length > 0) {
    throw new PipelineError(
      `Failed to achieve 100% coverage for must-have requirements after 2 generation passes. Uncovered: [${uncoveredMustHaves
        .map((g) => g.requirement.id)
        .join(", ")}]`,
      "COVERAGE_DEFICIT"
    );
  }

  const uncoveredRequirementIds = finalCoverage.gaps.map((g) => g.requirement.id);

  // 7. Flashcard Generation with Deterministic Fallback
  const flashcards = await generateFlashcardsWithFallback(
    {
      requirements,
      questions: allQuestions,
    },
    { llmService: llm }
  );

  // 8. Deterministic Schedule Allocation
  const schedule = allocateStudySchedule({
    questions: allQuestions,
    requirements,
    daysAvailable: caseInput.days,
  });

  // 9. Assemble Internal State
  const internalData: InternalKitData = {
    caseId: caseInput.id,
    jd: caseInput.jd,
    companyUrl: caseInput.company_url,
    daysAvailable: caseInput.days,
    roleDetails,
    verifiedCompanyName,
    researchedAt,
    pagesUsed,
    companyBrief: {
      summary: companyBrief.summary || "",
      whatTheyDo,
      sources: pagesUsed,
    },
    requirements,
    questions: allQuestions,
    flashcards,
    schedule,
    uncoveredRequirementIds,
    passes: passesCount,
  };

  // 10. Transform to exact Appendix A DTO
  return toAppendixAKitDto(internalData);
}
