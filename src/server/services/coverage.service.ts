import {
  IRequirement,
  IQuestion,
  ICoverageReport,
  IRequirementCoverage,
  ICoverageSummary,
} from "../../shared/types";

export interface CalculateCoverageInput {
  requirements: IRequirement[];
  questionBank?: IQuestion[];
}

/**
 * Pure, deterministic service function to calculate requirement coverage
 * and detect gaps against an existing question bank.
 *
 * Constraints satisfied:
 * 1. Deduplicates linkedQuestionIds so the same question ID cannot appear multiple times.
 * 2. Uses trim().toUpperCase() ONLY for matching/lookup; preserves original requirement IDs intact.
 * 3. byKind and byPriority calculate totals and covered counts using persisted requirements in each category.
 * 4. Company questions (which have no requirementIds) do not count toward requirement coverage or gaps.
 * 5. Zero external dependencies, zero database writes, zero LLM calls.
 */
export function calculateKitCoverage(
  input: CalculateCoverageInput
): ICoverageReport {
  const requirements = input.requirements || [];
  const questionBank = input.questionBank || [];

  // 1. Build lookup map: normalized requirement ID -> Set of unique question IDs
  const questionMap = new Map<string, Set<string>>();

  for (const q of questionBank) {
    if (!q.requirementIds || !Array.isArray(q.requirementIds)) continue;

    for (const reqId of q.requirementIds) {
      if (!reqId || typeof reqId !== "string") continue;
      const normalized = reqId.trim().toUpperCase();

      let qIdSet = questionMap.get(normalized);
      if (!qIdSet) {
        qIdSet = new Set<string>();
        questionMap.set(normalized, qIdSet);
      }
      qIdSet.add(q.id);
    }
  }

  // 2. Classify each persisted requirement as covered or gap
  const covered: IRequirementCoverage[] = [];
  const gaps: IRequirementCoverage[] = [];

  for (const req of requirements) {
    const normalizedId = (req.id || "").trim().toUpperCase();
    const linkedSet = questionMap.get(normalizedId);
    const linkedQuestionIds = linkedSet ? Array.from(linkedSet) : [];

    const isCovered = linkedQuestionIds.length > 0;
    const coverageItem: IRequirementCoverage = {
      requirement: req, // Original requirement object preserved untouched
      isCovered,
      linkedQuestionIds,
    };

    if (isCovered) {
      covered.push(coverageItem);
    } else {
      gaps.push(coverageItem);
    }
  }

  // 3. Compute category breakdowns (byKind and byPriority)
  const byKind = {
    technical: { total: 0, covered: 0 },
    behavioral: { total: 0, covered: 0 },
    domain: { total: 0, covered: 0 },
  };

  const byPriority = {
    must: { total: 0, covered: 0 },
    nice: { total: 0, covered: 0 },
  };

  for (const req of requirements) {
    const normalizedId = (req.id || "").trim().toUpperCase();
    const isCovered = (questionMap.get(normalizedId)?.size ?? 0) > 0;

    // Kind breakdown
    if (req.kind === "technical" || req.kind === "behavioral" || req.kind === "domain") {
      byKind[req.kind].total += 1;
      if (isCovered) {
        byKind[req.kind].covered += 1;
      }
    }

    // Priority breakdown
    if (req.priority === "must" || req.priority === "nice") {
      byPriority[req.priority].total += 1;
      if (isCovered) {
        byPriority[req.priority].covered += 1;
      }
    }
  }

  // 4. Compute overall summary metrics
  const totalRequirements = requirements.length;
  const coveredCount = covered.length;
  const uncoveredCount = gaps.length;
  const coveragePercentage =
    totalRequirements === 0
      ? 0
      : Math.round((coveredCount / totalRequirements) * 100);

  const summary: ICoverageSummary = {
    totalRequirements,
    coveredCount,
    uncoveredCount,
    coveragePercentage,
    byKind,
    byPriority,
  };

  return {
    summary,
    covered,
    gaps,
  };
}
