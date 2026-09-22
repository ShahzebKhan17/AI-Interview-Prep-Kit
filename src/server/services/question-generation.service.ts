import { z } from "zod";
import { IQuestion, IRequirement, ICompanyBrief } from "../../shared/types";
import { ILlmService, getDefaultLlmService } from "./llm.service";

export interface QuestionGenerationInput {
  kitId: string;
  jobTitle: string;
  jobDescription: string;
  requirements: IRequirement[];
  companyBrief?: ICompanyBrief;
}

export interface QuestionGenerationServiceOptions {
  llmService?: ILlmService;
  startIndex?: number;
}

/**
 * Zod schema to validate raw LLM question output before application fields are assigned.
 */
export const rawLlmQuestionItemSchema = z.object({
  category: z.enum(["technical", "behavioral", "company", "roleSpecific"]),
  question: z.string().trim().min(5, "Question text must be at least 5 characters"),
  answerOutline: z.string().trim().min(10, "Answer outline must be at least 10 characters"),
  requirementIds: z.array(z.string().trim().toUpperCase()).default([]),
});

export const rawLlmResponseSchema = z.object({
  questions: z.array(rawLlmQuestionItemSchema),
});

export type RawLlmQuestionItem = z.infer<typeof rawLlmQuestionItemSchema>;

/**
 * Builds the system prompt enforcing deterministic mapping, zero hallucination,
 * and exact requirement traceability.
 */
export function buildQuestionGenerationSystemPrompt(): string {
  return `You are an expert technical interviewer and recruitment specialist.
Your task is to generate a comprehensive, tailored interview question bank based STRICTLY on the provided job requirements and company context.

Guidelines:
1. Generate EXACTLY ONE question for each requirement provided in <requirements>, in the exact order given.
2. If <company_context> contains usable company information (summary, products, mission), generate EXACTLY ONE additional company-specific question at the end. If <company_context> is empty or states "None available", do NOT generate any company question.
3. Category Mapping (STRICT DETERMINISTIC RULE):
   - For each "technical" requirement: category MUST be "technical", and "requirementIds" MUST contain that exact requirement ID (e.g. ["REQ-001"]).
   - For each "behavioral" requirement: category MUST be "behavioral", and "requirementIds" MUST contain that exact requirement ID (e.g. ["REQ-002"]). Outline should use a STAR-based framework.
   - For each "domain" requirement: category MUST be "roleSpecific", and "requirementIds" MUST contain that exact requirement ID (e.g. ["REQ-003"]).
   - For the company question (if applicable): category MUST be "company", and "requirementIds" MUST be an empty array [].
4. Grounding:
   - Every requirement question must directly evaluate the specific skill, tool, or behavioral competency in that requirement.
   - Company questions must be grounded ONLY in the facts provided in <company_context>. Do NOT invent company facts.
   - Do NOT invent requirement IDs. Only use the IDs provided in <requirements>.
5. Answer Outline:
   - Provide a concise, actionable answer outline with key concepts, trade-offs, expected depth, and red flags.
6. Return a valid JSON object matching this schema:
{
  "questions": [
    {
      "category": "technical" | "behavioral" | "company" | "roleSpecific",
      "question": "string",
      "answerOutline": "string",
      "requirementIds": ["string"]
    }
  ]
}`;
}

/**
 * Builds the user prompt incorporating job context, requirements with IDs, and company context.
 */
export function buildQuestionGenerationUserPrompt(input: QuestionGenerationInput): string {
  const reqList = input.requirements
    .map((r) => `[${r.id}] (Kind: ${r.kind}, Priority: ${r.priority}): ${r.text}`)
    .join("\n");

  const hasCompanyContext = Boolean(input.companyBrief && input.companyBrief.summary?.trim().length);
  let companySection = "None available.";
  if (hasCompanyContext && input.companyBrief) {
    companySection = `Summary: ${input.companyBrief.summary}
Industry: ${input.companyBrief.industry || "Not specified"}
Products/Services: ${input.companyBrief.productsOrServices?.join(", ") || "Not specified"}
Hiring Process: ${input.companyBrief.hiringProcess || "Not specified"}`;
  }

  return `<job_context>
Role Title: ${input.jobTitle}
Job Description Overview:
"""
${input.jobDescription.slice(0, 3000)}
"""
</job_context>

<requirements>
${reqList}
</requirements>

<company_context>
${companySection}
</company_context>

Generate the interview question bank following all guidelines. Output JSON only.`;
}

/**
 * Validates the raw LLM response against all structural, count, and semantic mapping invariants.
 * Returns an error message if invalid, or null if completely valid.
 */
export function validateGenerationInvariants(
  questions: RawLlmQuestionItem[],
  requirements: IRequirement[],
  hasCompanyContext: boolean
): string | null {
  const expectedCount = requirements.length + (hasCompanyContext ? 1 : 0);
  if (questions.length !== expectedCount) {
    return `Expected exactly ${expectedCount} questions (${requirements.length} requirement-driven + ${
      hasCompanyContext ? 1 : 0
    } company-driven), but received ${questions.length}.`;
  }

  const reqMap = new Map<string, IRequirement>();
  for (const r of requirements) {
    reqMap.set(r.id.toUpperCase(), r);
  }

  // Validate requirement-driven questions (first N questions corresponding to requirements)
  for (let i = 0; i < requirements.length; i++) {
    const q = questions[i];
    const expectedReq = requirements[i];

    if (!q.requirementIds || q.requirementIds.length === 0) {
      return `Question at index ${i} is missing required requirementIds. Must link to '${expectedReq.id}'.`;
    }

    for (const reqId of q.requirementIds) {
      const targetReq = reqMap.get(reqId.toUpperCase());
      if (!targetReq) {
        return `Question at index ${i} references non-existent requirement ID '${reqId}'. Valid IDs: [${requirements
          .map((r) => r.id)
          .join(", ")}].`;
      }

      // Check category mapping
      if (targetReq.kind === "technical" && q.category !== "technical") {
        return `Question for technical requirement '${reqId}' must have category 'technical', got '${q.category}'.`;
      }
      if (targetReq.kind === "behavioral" && q.category !== "behavioral") {
        return `Question for behavioral requirement '${reqId}' must have category 'behavioral', got '${q.category}'.`;
      }
      if (targetReq.kind === "domain" && q.category !== "roleSpecific") {
        return `Question for domain requirement '${reqId}' must have category 'roleSpecific', got '${q.category}'.`;
      }
    }
  }

  // Validate company question if applicable
  if (hasCompanyContext) {
    const companyQ = questions[requirements.length];
    if (companyQ.category !== "company") {
      return `Expected final question to have category 'company', but got '${companyQ.category}'.`;
    }
    if (companyQ.requirementIds && companyQ.requirementIds.length > 0) {
      return `Company question must have requirementIds: [], but received: [${companyQ.requirementIds.join(", ")}].`;
    }
  }

  return null;
}

/**
 * Parses raw completion text as JSON with markdown fence unwrapping.
 */
function parseLlmJson(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) {
      return JSON.parse(match[1]);
    }
    throw new Error("LLM output is not valid JSON.");
  }
}

/**
 * Generates and validates an interview question bank from persisted Stage 5 requirements
 * and optional Stage 6 company context.
 *
 * Enforces:
 * - Deterministic mapping
 * - Exactly one controlled retry on correctable validation failures
 * - Complete in-memory validation before persistence
 * - Application-assigned sequential IDs: Q-001, Q-002, ...
 * - Default durationMinutes = 10, state = "generated"
 */
export async function generateQuestionBank(
  input: QuestionGenerationInput,
  options: QuestionGenerationServiceOptions = {}
): Promise<IQuestion[]> {
  const llm = options.llmService || getDefaultLlmService();
  const hasCompanyContext = Boolean(input.companyBrief && input.companyBrief.summary?.trim().length);

  const systemPrompt = buildQuestionGenerationSystemPrompt();
  const userPrompt = buildQuestionGenerationUserPrompt(input);

  let rawOutput: unknown;
  let parsedQuestions: RawLlmQuestionItem[] | null = null;
  let lastValidationError: string | null = null;

  // --- Attempt 1 ---
  try {
    const completion1 = await llm.generateCompletion({
      systemPrompt,
      userPrompt,
      responseFormat: "json_object",
      temperature: 0.2,
    });

    rawOutput = parseLlmJson(completion1);
    const parseResult1 = rawLlmResponseSchema.safeParse(rawOutput);

    if (parseResult1.success) {
      const invariantError = validateGenerationInvariants(
        parseResult1.data.questions,
        input.requirements,
        hasCompanyContext
      );
      if (!invariantError) {
        parsedQuestions = parseResult1.data.questions;
      } else {
        lastValidationError = invariantError;
      }
    } else {
      lastValidationError = `Structural validation failed: ${parseResult1.error.issues[0]?.message}`;
    }
  } catch (err) {
    lastValidationError = `Attempt 1 failed: ${(err as Error).message}`;
  }

  // --- Controlled Retry (Attempt 2) ---
  if (!parsedQuestions && lastValidationError) {
    console.warn(`[QuestionGeneration] Attempt 1 failed validation: ${lastValidationError}. Executing single controlled retry...`);

    const correctivePrompt = `${userPrompt}

IMPORTANT CORRECTION REQUIRED:
Your previous response failed validation with the following error:
"${lastValidationError}"

Please correct this issue:
- Valid requirement IDs are: [${input.requirements.map((r) => r.id).join(", ")}]
- Technical requirements must have category 'technical' and link to their technical REQ ID.
- Behavioral requirements must have category 'behavioral' and link to their behavioral REQ ID.
- Domain requirements must have category 'roleSpecific' and link to their domain REQ ID.
- Company questions must have category 'company' and requirementIds: [].
- Output valid JSON with the exact count of ${input.requirements.length + (hasCompanyContext ? 1 : 0)} questions.`;

    try {
      const completion2 = await llm.generateCompletion({
        systemPrompt,
        userPrompt: correctivePrompt,
        responseFormat: "json_object",
        temperature: 0.1,
      });

      const rawOutput2 = parseLlmJson(completion2);
      const parseResult2 = rawLlmResponseSchema.safeParse(rawOutput2);

      if (parseResult2.success) {
        const invariantError2 = validateGenerationInvariants(
          parseResult2.data.questions,
          input.requirements,
          hasCompanyContext
        );
        if (!invariantError2) {
          parsedQuestions = parseResult2.data.questions;
        } else {
          lastValidationError = invariantError2;
        }
      } else {
        lastValidationError = `Retry structural validation failed: ${parseResult2.error.issues[0]?.message}`;
      }
    } catch (retryErr) {
      lastValidationError = `Retry failed: ${(retryErr as Error).message}`;
    }
  }

  if (!parsedQuestions) {
    throw new Error(`GENERATION_VALIDATION_FAILED: ${lastValidationError || "Failed to generate valid question bank."}`);
  }

  // --- Application-Controlled Sequential ID Assignment ---
  const startId = options.startIndex ?? 1;
  const finalQuestions: IQuestion[] = parsedQuestions.map((q, idx) => {
    const seqNum = String(startId + idx).padStart(3, "0");
    return {
      id: `Q-${seqNum}`,
      category: q.category,
      question: q.question,
      answerOutline: q.answerOutline,
      requirementIds: q.requirementIds,
      durationMinutes: 10,
      state: "generated" as const,
    };
  });

  return finalQuestions;
}
