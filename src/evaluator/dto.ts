import { calculateQuestionDifficulty } from "../server/services/scheduling.service";
import { IRequirement, IQuestion } from "../shared/types";
import { ExtractedRoleDetails } from "../server/services/role-extraction.service";
import { AppendixASchedule } from "../server/services/scheduling.service";
import { AppendixAFlashcard } from "../server/services/flashcard-generation.service";

export interface AppendixASource {
  company: string;
  company_url: string;
  role: string;
  location: string;
  jd_chars: number;
  researched_at: string;
  pages_used: string[];
}

export interface AppendixACompanyBrief {
  summary: string;
  what_they_do: string;
  sources: string[];
}

export interface AppendixARoleRequirement {
  id: string;
  text: string;
  kind: string;
  priority: string;
}

export interface AppendixARole {
  title: string;
  seniority: string;
  responsibilities: string[];
  requirements: AppendixARoleRequirement[];
}

export interface AppendixAQuestion {
  id: string;
  requirement_ids: string[];
  category: string;
  prompt: string;
  answer_outline: string;
  difficulty: number;
}

export interface AppendixACoverage {
  uncovered_requirement_ids: string[];
  passes: number;
}

export interface AppendixAKit {
  source: AppendixASource;
  company_brief: AppendixACompanyBrief;
  role: AppendixARole;
  questions: AppendixAQuestion[];
  flashcards: AppendixAFlashcard[];
  schedule: AppendixASchedule;
  coverage: AppendixACoverage;
}

export interface AppendixBCaseResult {
  id: string;
  status: "ok" | "failed";
  kit: AppendixAKit | null;
  error: {
    code: string;
    message: string;
  } | null;
}

export interface AppendixBOutput {
  version: string;
  generated_at: string;
  kits: AppendixBCaseResult[];
}

export interface InternalKitData {
  caseId: string;
  jd: string;
  companyUrl: string;
  daysAvailable: number;
  roleDetails: ExtractedRoleDetails;
  verifiedCompanyName: string;
  researchedAt: string;
  pagesUsed: string[];
  companyBrief: {
    summary: string;
    whatTheyDo: string;
    sources: string[];
  };
  requirements: IRequirement[];
  questions: IQuestion[];
  flashcards: AppendixAFlashcard[];
  schedule: AppendixASchedule;
  uncoveredRequirementIds: string[];
  passes: number;
}

/**
 * Normalizes an internal ID (e.g. "REQ-001" -> "r1", "Q-001" -> "q1").
 */
export function normalizeToContractId(id: string, prefix: "r" | "q" | "f"): string {
  const match = id.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    return `${prefix}${num}`;
  }
  return id.toLowerCase();
}

/**
 * Serializes internal pipeline data to the exact external Appendix A DTO structure.
 * Guaranteed: No internal fields leak into output; no undocumented fields emitted.
 */
export function toAppendixAKitDto(data: InternalKitData): AppendixAKit {
  // 1. Map Source
  const source: AppendixASource = {
    company: data.verifiedCompanyName || "",
    company_url: data.companyUrl,
    role: data.roleDetails.title,
    location: data.roleDetails.location,
    jd_chars: data.jd.length,
    researched_at: data.researchedAt,
    pages_used: data.pagesUsed,
  };

  // 2. Map Company Brief
  const company_brief: AppendixACompanyBrief = {
    summary: data.companyBrief.summary || "",
    what_they_do: data.companyBrief.whatTheyDo || "",
    sources: data.companyBrief.sources,
  };

  // Build ID mapping from original requirement IDs to contract IDs ("REQ-001" -> "r1")
  const reqIdMap = new Map<string, string>();
  data.requirements.forEach((req, idx) => {
    reqIdMap.set(req.id.toUpperCase(), `r${idx + 1}`);
  });

  // 3. Map Role
  const role: AppendixARole = {
    title: data.roleDetails.title,
    seniority: data.roleDetails.seniority,
    responsibilities: data.roleDetails.responsibilities,
    requirements: data.requirements.map((r, idx) => ({
      id: reqIdMap.get(r.id.toUpperCase()) || `r${idx + 1}`,
      text: r.text,
      kind: r.kind,
      priority: r.priority,
    })),
  };

  // Build ID mapping from original question IDs to contract IDs ("Q-001" -> "q1")
  const qIdMap = new Map<string, string>();
  data.questions.forEach((q, idx) => {
    qIdMap.set(q.id.toUpperCase(), `q${idx + 1}`);
  });

  // 4. Map Questions
  const questions: AppendixAQuestion[] = data.questions.map((q, idx) => {
    const mappedReqIds = (q.requirementIds || [])
      .map((rid) => reqIdMap.get(rid.toUpperCase()) || rid.toLowerCase())
      .filter(Boolean);

    const difficulty = calculateQuestionDifficulty(
      {
        id: q.id,
        category: q.category,
        requirementIds: q.requirementIds,
      },
      data.requirements
    );

    return {
      id: qIdMap.get(q.id.toUpperCase()) || `q${idx + 1}`,
      requirement_ids: mappedReqIds,
      category: q.category,
      prompt: q.question,
      answer_outline: q.answerOutline,
      difficulty,
    };
  });

  // 5. Map Flashcards
  const flashcards: AppendixAFlashcard[] = data.flashcards.map((fc, idx) => {
    const mappedReqIds = fc.requirement_ids.map(
      (rid) => reqIdMap.get(rid.toUpperCase()) || rid.toLowerCase()
    );

    return {
      id: `f${idx + 1}`,
      front: fc.front,
      back: fc.back,
      requirement_ids: mappedReqIds,
    };
  });

  // 6. Map Schedule (using mapped question IDs)
  const schedule: AppendixASchedule = {
    days_available: data.schedule.days_available,
    days: data.schedule.days.map((day) => ({
      day: day.day,
      focus: day.focus,
      question_ids: day.question_ids.map((qid) => qIdMap.get(qid.toUpperCase()) || qid.toLowerCase()),
      minutes: day.minutes,
    })),
  };

  // 7. Map Coverage
  const coverage: AppendixACoverage = {
    uncovered_requirement_ids: data.uncoveredRequirementIds.map(
      (rid) => reqIdMap.get(rid.toUpperCase()) || rid.toLowerCase()
    ),
    passes: data.passes,
  };

  return {
    source,
    company_brief,
    role,
    questions,
    flashcards,
    schedule,
    coverage,
  };
}
