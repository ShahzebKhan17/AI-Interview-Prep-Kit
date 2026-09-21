/**
 * Shared TypeScript types across client and server.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface HealthCheckResponse {
  status: "ok" | "degraded" | "down";
  timestamp: string;
  database: "connected" | "disconnected" | "connecting";
  uptime: number;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthResponse {
  success: boolean;
  user?: AuthUser;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

// Stage 3: Interview Kit Types

export type KitStatus = "draft" | "generating" | "ready" | "failed" | "partial";

export type RequirementPriority = "must" | "nice";

export type RequirementKind = "technical" | "behavioral" | "domain";

export interface IRequirement {
  id: string; // e.g. "REQ-001"
  kitId?: string;
  text: string;
  kind: RequirementKind;
  priority: RequirementPriority;
}

export interface ExtractionResult {
  requirements: IRequirement[];
}

export type QuestionCategory =
  | "technical"
  | "behavioral"
  | "company"
  | "roleSpecific";

export type ContentState = "generated" | "edited" | "pinned";

export interface IQuestion {
  id: string;
  category: QuestionCategory;
  question: string;
  answerOutline: string;
  requirementIds: string[];
  durationMinutes: number;
  state: ContentState;
}

export interface IFlashcard {
  id: string;
  front: string;
  back: string;
  state: ContentState;
}

export interface ISource {
  url: string;
  title: string;
  sourceType: string;
}

export interface ICompanyBrief {
  summary: string;
  productsOrServices: string[];
  industry: string;
  hiringProcess: string | null;
  sources: ISource[];
}

export interface IRoleBreakdown {
  summary: string;
  responsibilities: string[];
  skills: string[];
}

export interface IStudyDay {
  day: number;
  topic: string;
  questionIds: string[];
  durationMinutes: number;
}

export interface IKit {
  id: string;
  userId: string;
  title: string;
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
  status: KitStatus;
  requirements: IRequirement[];
  companyBrief: ICompanyBrief;
  roleBreakdown: IRoleBreakdown;
  questionBank: IQuestion[];
  flashcards: IFlashcard[];
  studySchedule: IStudyDay[];
  createdAt: string;
  updatedAt: string;
}

export interface KitResponse {
  success: boolean;
  kit?: IKit;
  kits?: IKit[];
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}
