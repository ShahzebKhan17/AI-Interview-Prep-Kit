import { z } from "zod";

const httpUrlRegex = /^https?:\/\/.+/i;

export const createKitSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title cannot exceed 200 characters"),
  jobDescription: z.string().trim().min(1, "Job description is required"),
  companyUrl: z
    .string()
    .trim()
    .regex(httpUrlRegex, "Company URL must be a valid HTTP or HTTPS URL"),
  daysAvailable: z
    .number()
    .int("Days available must be an integer")
    .min(1, "Days available must be at least 1 day"),
});

export const extractRequirementsSchema = z.object({
  jobDescription: z.string().trim().min(1, "Job description is required"),
});

export const researchKitSchema = z.object({
  companyUrl: z
    .string()
    .trim()
    .regex(httpUrlRegex, "Company URL must be a valid HTTP or HTTPS URL")
    .optional(),
});

export const requirementSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, "Requirement ID is required")
    .regex(/^REQ-\d{3,}$/i, "Requirement ID must follow format REQ-001"),
  kitId: z.string().optional(),
  text: z.string().trim().min(1, "Requirement text is required"),
  kind: z.enum(["technical", "behavioral", "domain"]).default("technical"),
  priority: z.enum(["must", "nice"]),
});

export const sourceSchema = z.object({
  url: z.string().trim().min(1, "Source URL is required"),
  title: z.string().trim().min(1, "Source title is required"),
  sourceType: z.string().trim().min(1, "Source type is required"),
});

export const companyBriefSchema = z.object({
  summary: z.string().default(""),
  productsOrServices: z.array(z.string()).default([]),
  industry: z.string().default(""),
  hiringProcess: z.string().nullable().default(null),
  sources: z.array(sourceSchema).default([]),
});

export const roleBreakdownSchema = z.object({
  summary: z.string().default(""),
  responsibilities: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
});

export const questionSchema = z.object({
  id: z.string().trim().min(1, "Question ID is required"),
  category: z.enum(["technical", "behavioral", "company", "roleSpecific"]),
  question: z.string().trim().min(1, "Question text is required"),
  answerOutline: z.string().default(""),
  requirementIds: z.array(z.string()).default([]),
  durationMinutes: z
    .number()
    .int("Duration must be an integer")
    .min(1, "Duration must be at least 1 minute"),
  state: z.enum(["generated", "edited", "pinned"]).default("generated"),
});

export const flashcardSchema = z.object({
  id: z.string().trim().min(1, "Flashcard ID is required"),
  front: z.string().trim().min(1, "Front text is required"),
  back: z.string().trim().min(1, "Back text is required"),
  state: z.enum(["generated", "edited", "pinned"]).default("generated"),
});

export const studyDaySchema = z.object({
  day: z
    .number()
    .int("Day must be an integer")
    .min(1, "Day must be at least 1"),
  topic: z.string().trim().min(1, "Topic is required"),
  questionIds: z.array(z.string()).default([]),
  durationMinutes: z
    .number()
    .int("Duration must be an integer")
    .min(1, "Duration must be at least 1 minute"),
});

export const updateKitSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  jobDescription: z.string().trim().min(1).optional(),
  companyUrl: z
    .string()
    .trim()
    .regex(httpUrlRegex, "Company URL must be a valid HTTP or HTTPS URL")
    .optional(),
  daysAvailable: z
    .number()
    .int("Days available must be an integer")
    .min(1, "Days available must be at least 1")
    .optional(),
  status: z
    .enum(["draft", "generating", "ready", "failed", "partial"])
    .optional(),
  requirements: z.array(requirementSchema).optional(),
  companyBrief: companyBriefSchema.optional(),
  roleBreakdown: roleBreakdownSchema.optional(),
  questionBank: z.array(questionSchema).optional(),
  flashcards: z.array(flashcardSchema).optional(),
  studySchedule: z.array(studyDaySchema).optional(),
});

/**
 * Validates relational invariants within a kit before persistence:
 * 1. Requirements have unique IDs
 * 2. Questions have unique IDs
 * 3. Question requirementIds refer to existing requirements
 * 4. Flashcards have unique IDs
 * 5. Study schedule questionIds refer to existing questions
 */
export function validateKitInvariants(kitData: {
  requirements?: Array<{ id: string }>;
  questionBank?: Array<{ id: string; requirementIds?: string[] }>;
  flashcards?: Array<{ id: string }>;
  studySchedule?: Array<{ day?: number; questionIds?: string[] }>;
}): string | null {
  // 1. Requirements uniqueness
  if (kitData.requirements) {
    const reqIds = new Set<string>();
    for (const req of kitData.requirements) {
      const normalizedId = req.id.toUpperCase();
      if (reqIds.has(normalizedId)) {
        return `Duplicate requirement ID '${req.id}' found.`;
      }
      reqIds.add(normalizedId);
    }
  }

  // 2. Questions uniqueness
  if (kitData.questionBank) {
    const qIds = new Set<string>();
    for (const q of kitData.questionBank) {
      if (qIds.has(q.id)) {
        return `Duplicate question ID '${q.id}' found.`;
      }
      qIds.add(q.id);
    }
  }

  // 3. Question -> Requirement relationship check
  if (kitData.questionBank && kitData.requirements) {
    const validReqIds = new Set(
      kitData.requirements.map((r) => r.id.toUpperCase())
    );
    for (const q of kitData.questionBank) {
      if (q.requirementIds) {
        for (const reqId of q.requirementIds) {
          if (!validReqIds.has(reqId.toUpperCase())) {
            return `Question '${q.id}' references non-existent requirement ID '${reqId}'.`;
          }
        }
      }
    }
  }

  // 4. Flashcards uniqueness
  if (kitData.flashcards) {
    const fcIds = new Set<string>();
    for (const fc of kitData.flashcards) {
      if (fcIds.has(fc.id)) {
        return `Duplicate flashcard ID '${fc.id}' found.`;
      }
      fcIds.add(fc.id);
    }
  }

  // 5. Schedule -> Question relationship check
  if (kitData.studySchedule && kitData.questionBank) {
    const validQIds = new Set(kitData.questionBank.map((q) => q.id));
    for (const day of kitData.studySchedule) {
      if (day.questionIds) {
        for (const qId of day.questionIds) {
          if (!validQIds.has(qId)) {
            return `Study schedule for day ${day.day ?? ""} references non-existent question ID '${qId}'.`;
          }
        }
      }
    }
  }

  return null;
}
