/**
 * Deterministic Study Schedule Allocation Service
 * Implements Section 8 and Appendix A deterministic scheduling constraints.
 */

export interface ScheduleQuestionInput {
  id: string;
  category: string;
  question?: string;
  prompt?: string;
  answerOutline?: string;
  answer_outline?: string;
  requirementIds?: string[];
  requirement_ids?: string[];
}

export interface ScheduleRequirementInput {
  id: string;
  text?: string;
  kind?: string;
  priority?: string;
}

export interface ScheduleAllocationInput {
  questions: ScheduleQuestionInput[];
  requirements: ScheduleRequirementInput[];
  daysAvailable: number;
}

export interface AppendixAScheduleDay {
  day: number;
  focus: string;
  question_ids: string[];
  minutes: number;
}

export interface AppendixASchedule {
  days_available: number;
  days: AppendixAScheduleDay[];
}

/**
 * Calculates deterministic difficulty (integer 1-3) for a question based on its linked requirements.
 * Requirement 4: "The maximum difficulty implied by any linked requirement."
 */
export function calculateQuestionDifficulty(
  question: ScheduleQuestionInput,
  requirements: ScheduleRequirementInput[]
): number {
  const rawReqIds = question.requirementIds || question.requirement_ids || [];
  if (rawReqIds.length === 0) {
    return 1; // Default difficulty for unlinked or company-only questions
  }

  const reqMap = new Map<string, ScheduleRequirementInput>();
  for (const r of requirements) {
    reqMap.set(r.id.trim().toUpperCase(), r);
  }

  const difficulties = rawReqIds.map((reqId) => {
    const req = reqMap.get(reqId.trim().toUpperCase());
    if (!req) return 1;

    const priority = (req.priority || "").toLowerCase();
    const kind = (req.kind || "").toLowerCase();

    // Must-have technical or domain
    if (priority === "must" && (kind === "technical" || kind === "domain")) {
      return 3;
    }
    // Nice-to-have technical or must-have behavioral
    if (
      (priority === "nice" && kind === "technical") ||
      (priority === "must" && kind === "behavioral")
    ) {
      return 2;
    }
    // Nice-to-have behavioral or domain, or standard
    return 1;
  });

  return Math.max(...difficulties, 1);
}

/**
 * Determines whether a question is linked to any must-have requirement.
 */
function isMustHaveQuestion(
  question: ScheduleQuestionInput,
  requirements: ScheduleRequirementInput[]
): boolean {
  const rawReqIds = question.requirementIds || question.requirement_ids || [];
  if (rawReqIds.length === 0) return false;

  const reqMap = new Map<string, ScheduleRequirementInput>();
  for (const r of requirements) {
    reqMap.set(r.id.trim().toUpperCase(), r);
  }

  return rawReqIds.some((reqId) => {
    const r = reqMap.get(reqId.trim().toUpperCase());
    return r && (r.priority || "").toLowerCase() === "must";
  });
}

/**
 * Derives a deterministic daily focus topic based on question categories.
 */
function deriveDayFocus(
  dayQuestions: ScheduleQuestionInput[],
  dayNumber: number,
  totalDays: number,
  isReview = false
): string {
  if (isReview) {
    return "Spaced Retrieval & Mock Drill: Key Competencies";
  }

  const categories = new Set(dayQuestions.map((q) => q.category.toLowerCase()));

  if (categories.has("technical") && categories.size === 1) {
    return "Core Technical Competencies & Deep Dives";
  }
  if (categories.has("roleSpecific") || (categories.has("technical") && categories.has("roleSpecific"))) {
    return "Technical Architecture & Domain Systems";
  }
  if (categories.has("behavioral")) {
    return "Behavioral Leadership & Situational Scenarios";
  }
  if (categories.has("company") || dayNumber === totalDays) {
    return "Company Culture, Alignment & Final Review";
  }

  return "Comprehensive Technical Interview Preparation";
}

/**
 * Allocates questions deterministically across exactly `daysAvailable` days.
 */
export function allocateStudySchedule(input: ScheduleAllocationInput): AppendixASchedule {
  const daysAvailable = Math.max(1, Math.floor(input.daysAvailable));
  const questions = input.questions || [];
  const requirements = input.requirements || [];

  if (questions.length === 0) {
    // Edge case fallback if question bank is completely empty
    const days: AppendixAScheduleDay[] = [];
    for (let d = 1; d <= daysAvailable; d++) {
      days.push({
        day: d,
        focus: "General Role and Requirement Review",
        question_ids: [],
        minutes: 15,
      });
    }
    return {
      days_available: daysAvailable,
      days,
    };
  }

  // 1. Sort questions deterministically:
  // - Higher difficulty first (3 before 2, 2 before 1)
  // - Must-have questions before nice-to-have
  // - Stable tie-breaker: lexicographical sort by question ID
  const scoredQuestions = questions.map((q) => ({
    question: q,
    difficulty: calculateQuestionDifficulty(q, requirements),
    isMust: isMustHaveQuestion(q, requirements),
  }));

  scoredQuestions.sort((a, b) => {
    if (b.difficulty !== a.difficulty) {
      return b.difficulty - a.difficulty;
    }
    if (b.isMust !== a.isMust) {
      return b.isMust ? 1 : -1;
    }
    return a.question.id.localeCompare(b.question.id);
  });

  const sortedQuestions = scoredQuestions.map((sq) => sq.question);
  const mustHaveQuestions = sortedQuestions.filter((q) => isMustHaveQuestion(q, requirements));

  // 2. Identify pool for review days when daysAvailable > questions.length
  // Required behavior:
  // IF must-have questions exist: reuse highest-priority must-have questions
  // ELSE: reuse highest-ranked available questions
  // Never modulo against empty array
  const reviewPool = mustHaveQuestions.length > 0 ? mustHaveQuestions : sortedQuestions;

  // 3. Partition questions across daysAvailable days
  const dayBuckets: ScheduleQuestionInput[][] = Array.from({ length: daysAvailable }, () => []);

  if (sortedQuestions.length >= daysAvailable) {
    // Distribute sorted questions across the days in chunks
    // Ensures harder / must-have questions are scheduled on Day 1, Day 2...
    const baseCount = Math.floor(sortedQuestions.length / daysAvailable);
    const remainder = sortedQuestions.length % daysAvailable;
    let currentIdx = 0;

    for (let d = 0; d < daysAvailable; d++) {
      const count = d < remainder ? baseCount + 1 : baseCount;
      for (let c = 0; c < count; c++) {
        dayBuckets[d].push(sortedQuestions[currentIdx++]);
      }
    }
  } else {
    // daysAvailable > sortedQuestions.length (e.g. 5 questions / 7 days, or 1 question / 60 days)
    // Step A: Assign the N available questions to Day 1 through Day N
    for (let i = 0; i < sortedQuestions.length; i++) {
      dayBuckets[i].push(sortedQuestions[i]);
    }

    // Step B: For remaining days (sortedQuestions.length to daysAvailable - 1),
    // assign review questions deterministically from reviewPool without inventing new questions
    for (let d = sortedQuestions.length; d < daysAvailable; d++) {
      const reviewIdx = (d - sortedQuestions.length) % reviewPool.length;
      dayBuckets[d].push(reviewPool[reviewIdx]);
    }
  }

  // 4. Construct final Appendix A schedule objects
  const days: AppendixAScheduleDay[] = dayBuckets.map((bucket, index) => {
    const dayNumber = index + 1;
    const isReview = sortedQuestions.length < daysAvailable && index >= sortedQuestions.length;
    const focus = deriveDayFocus(bucket, dayNumber, daysAvailable, isReview);
    const questionIds = bucket.map((q) => q.id);
    const minutes = Math.max(15, questionIds.length * 15);

    return {
      day: dayNumber,
      focus,
      question_ids: questionIds,
      minutes,
    };
  });

  return {
    days_available: daysAvailable,
    days,
  };
}
