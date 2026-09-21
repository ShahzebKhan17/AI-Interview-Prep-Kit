import { z } from "zod";
import {
  IRequirement,
  RequirementKind,
  RequirementPriority,
  ExtractionResult,
} from "../../shared/types";
import { formatRequirementId } from "../../shared/utils/requirement";
import { ILlmService, getDefaultLlmService } from "./llm.service";

/**
 * System prompt instructing the LLM on requirement extraction rules.
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are an expert technical recruiter and job specification analyzer.
Your task is to extract structured job requirements from a Job Description.

Guidelines:
1. Extract explicit job requirements from the Job Description.
2. Include technical skills, behavioral requirements, and domain knowledge.
3. Categorize each requirement into one of three kinds:
   - "technical": Programming languages, frameworks, libraries, databases, developer tools, system architecture, engineering practices, certifications.
   - "behavioral": Communication, leadership, teamwork, problem-solving, collaboration, ownership, soft skills.
   - "domain": Industry knowledge, business domain expertise (e.g. fintech, healthcare, e-commerce, banking), regulatory compliance.
4. Distinguish mandatory requirements from preferred/nice-to-have requirements:
   - "must": Mandatory, required, or core qualifications.
   - "nice": Preferred, bonus, nice-to-have, or optional qualifications.
5. Do NOT invent requirements that are not supported by the Job Description.
6. Do NOT turn company descriptions, benefits, perks, salary information, location, work arrangements, or generic marketing language into requirements.
7. Preserve important qualifications such as years of experience, degree requirements, certifications, tools, and technologies.
8. Keep each requirement atomic and concise where practical.
9. Avoid duplicate requirements.
10. Do NOT generate requirement IDs. Only provide "text", "kind", and "priority".
11. Return structured JSON output only matching this schema:
{
  "requirements": [
    {
      "text": "string",
      "kind": "technical" | "behavioral" | "domain",
      "priority": "must" | "nice"
    }
  ]
}`;

/**
 * Builds the user prompt given a Job Description.
 */
export function buildExtractionUserPrompt(jobDescription: string): string {
  return `Job Description:
"""
${jobDescription.trim()}
"""

Extract all structured requirements from this Job Description following the guidelines. Return a JSON object with a "requirements" array only.`;
}

/**
 * Zod schema to validate raw LLM requirement items with resilient normalization.
 */
export const rawLlmRequirementSchema = z.object({
  text: z.string().trim().min(1, "Requirement text cannot be empty"),
  kind: z
    .string()
    .transform((val) => {
      const lower = val.trim().toLowerCase();
      if (
        lower === "behavioral" ||
        lower === "soft skill" ||
        lower === "soft-skill" ||
        lower === "interpersonal"
      ) {
        return "behavioral" as const;
      }
      if (
        lower === "domain" ||
        lower === "industry" ||
        lower === "business"
      ) {
        return "domain" as const;
      }
      return "technical" as const;
    })
    .pipe(z.enum(["technical", "behavioral", "domain"])),
  priority: z
    .string()
    .transform((val) => {
      const lower = val.trim().toLowerCase();
      if (
        lower === "nice" ||
        lower === "nice-to-have" ||
        lower === "nice to have" ||
        lower === "preferred" ||
        lower === "optional" ||
        lower === "bonus" ||
        lower === "plus"
      ) {
        return "nice" as const;
      }
      return "must" as const;
    })
    .pipe(z.enum(["must", "nice"])),
});

/**
 * Zod schema to validate the overall LLM JSON output.
 */
export const rawLlmExtractionSchema = z.object({
  requirements: z.array(rawLlmRequirementSchema),
});

export type RawLlmRequirement = z.infer<typeof rawLlmRequirementSchema>;

/**
 * Normalizes extracted requirements, deduplicates them, removes empty ones,
 * and deterministically assigns application-level requirement IDs (REQ-001, REQ-002, ...).
 */
export function normalizeAndAssignRequirementIds(
  rawRequirements: Array<{
    text: string;
    kind: RequirementKind;
    priority: RequirementPriority;
  }>
): IRequirement[] {
  const result: IRequirement[] = [];
  const seenTexts = new Set<string>();

  for (const raw of rawRequirements) {
    const trimmedText = raw.text.trim();

    // 1. Reject empty requirement text
    if (!trimmedText) {
      continue;
    }

    // 2. Exact duplicate elimination (case-insensitive)
    const normalizedKey = trimmedText.toLowerCase();
    if (seenTexts.has(normalizedKey)) {
      continue;
    }
    seenTexts.add(normalizedKey);

    // 3. Assign deterministic application-level ID using formatRequirementId(index)
    const id = formatRequirementId(result.length + 1);

    result.push({
      id,
      text: trimmedText,
      kind: raw.kind,
      priority: raw.priority,
    });
  }

  return result;
}

export interface ExtractRequirementsOptions {
  llmService?: ILlmService;
}

/**
 * Extracts structured job requirements from a Job Description.
 *
 * Steps:
 * 1. Validate JD input.
 * 2. Send prompt to LLM expecting structured JSON.
 * 3. Validate LLM response using Zod schema.
 * 4. Normalize and trim text.
 * 5. Reject empty requirements and remove duplicates.
 * 6. Assign deterministic IDs (REQ-001, REQ-002, ...).
 * 7. Return final ExtractionResult with IRequirement[]-compatible structure.
 */
export async function extractRequirementsFromJD(
  jobDescription: string,
  options?: ExtractRequirementsOptions
): Promise<ExtractionResult> {
  if (!jobDescription || typeof jobDescription !== "string") {
    throw new Error("Job description is required and must be a non-empty string.");
  }

  const trimmedJD = jobDescription.trim();
  if (!trimmedJD) {
    throw new Error("Job description cannot be empty or solely whitespace.");
  }

  const llm = options?.llmService || getDefaultLlmService();

  const completion = await llm.generateCompletion({
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userPrompt: buildExtractionUserPrompt(trimmedJD),
    responseFormat: "json_object",
    temperature: 0.1,
  });

  // Parse JSON response
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(completion);
  } catch {
    // Handle potential markdown backticks (e.g. ```json ... ```)
    const match = completion.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        parsedJson = JSON.parse(match[1]);
      } catch {
        throw new Error(
          "LLM returned an invalid JSON structure that could not be parsed."
        );
      }
    } else {
      throw new Error(
        "LLM returned an invalid JSON structure that could not be parsed."
      );
    }
  }

  // Validate structured LLM response with Zod
  const validation = rawLlmExtractionSchema.safeParse(parsedJson);
  if (!validation.success) {
    const errorMsg =
      validation.error.issues[0]?.message || "Schema validation failed";
    throw new Error(`LLM extraction output failed validation: ${errorMsg}`);
  }

  // Normalize, deduplicate, and assign deterministic IDs (REQ-001, REQ-002, ...)
  const requirements = normalizeAndAssignRequirementIds(
    validation.data.requirements
  );

  return {
    requirements,
  };
}

/**
 * Object-oriented service wrapper for callers that prefer dependency-injected classes.
 */
export class RequirementExtractionService {
  constructor(private llmService?: ILlmService) {}

  async extract(jobDescription: string): Promise<ExtractionResult> {
    return extractRequirementsFromJD(jobDescription, {
      llmService: this.llmService,
    });
  }
}
