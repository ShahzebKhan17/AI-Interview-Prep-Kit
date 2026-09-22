import { z } from "zod";
import { ILlmService, getDefaultLlmService } from "./llm.service";

export interface FlashcardRequirementInput {
  id: string;
  text: string;
  kind?: string;
  priority?: string;
}

export interface FlashcardQuestionInput {
  id: string;
  question?: string;
  prompt?: string;
  answerOutline?: string;
  answer_outline?: string;
  requirementIds?: string[];
  requirement_ids?: string[];
}

export interface FlashcardGenerationInput {
  requirements: FlashcardRequirementInput[];
  questions?: FlashcardQuestionInput[];
}

export interface FlashcardGenerationOptions {
  llmService?: ILlmService;
}

export interface AppendixAFlashcard {
  id: string;
  front: string;
  back: string;
  requirement_ids: string[];
}

const rawFlashcardItemSchema = z.object({
  front: z.string().trim().min(3, "Front of flashcard must be at least 3 characters"),
  back: z.string().trim().min(5, "Back of flashcard must be at least 5 characters"),
  requirement_id: z.string().trim().min(1, "requirement_id is required"),
});

const rawFlashcardsResponseSchema = z.object({
  flashcards: z.array(rawFlashcardItemSchema),
});

/**
 * Deterministic Fallback Flashcard Generator
 * Produces pure deterministic flashcards derived directly from requirement text
 * and question answer outlines without any external network or LLM calls.
 */
export function generateDeterministicFlashcards(
  requirements: FlashcardRequirementInput[],
  questions: FlashcardQuestionInput[] = []
): AppendixAFlashcard[] {
  const reqToQuestionMap = new Map<string, FlashcardQuestionInput>();

  for (const q of questions) {
    const ids = q.requirementIds || q.requirement_ids || [];
    for (const reqId of ids) {
      if (!reqToQuestionMap.has(reqId.toUpperCase())) {
        reqToQuestionMap.set(reqId.toUpperCase(), q);
      }
    }
  }

  return requirements.map((req, index) => {
    const matchedQ = reqToQuestionMap.get(req.id.toUpperCase());
    const answer =
      matchedQ?.answerOutline ||
      matchedQ?.answer_outline ||
      `Demonstrate practical knowledge, trade-offs, and best practices for: ${req.text}.`;

    return {
      id: `f${index + 1}`,
      front: `Key Concept: ${req.text}`,
      back: answer,
      requirement_ids: [req.id],
    };
  });
}

/**
 * Flashcard Generation with Deterministic Fallback
 * Attempts LLM generation when an active LLM service is available,
 * and seamlessly falls back to pure deterministic generation on timeout, failure, or offline mode.
 */
export async function generateFlashcardsWithFallback(
  input: FlashcardGenerationInput,
  options: FlashcardGenerationOptions = {}
): Promise<AppendixAFlashcard[]> {
  const requirements = input.requirements || [];
  const questions = input.questions || [];

  if (requirements.length === 0) {
    return [];
  }

  const llm = options.llmService || getDefaultLlmService();

  // If running in offline test or without API key, use deterministic generator directly
  if (
    process.env.NODE_ENV === "test" ||
    process.env.MOCK_LLM === "true" ||
    !process.env.OPENAI_API_KEY
  ) {
    return generateDeterministicFlashcards(requirements, questions);
  }

  // LLM Generation Mode
  try {
    const promptReqs = requirements
      .map((r) => `[${r.id}] (Kind: ${r.kind || "technical"}): ${r.text}`)
      .join("\n");

    const userPrompt = `Requirements:
${promptReqs}

Generate targeted interview preparation flashcards for each requirement.
Output JSON only matching this schema:
{
  "flashcards": [
    {
      "front": "string",
      "back": "string",
      "requirement_id": "string"
    }
  ]
}`;

    const completion = await llm.generateCompletion({
      systemPrompt:
        "You are an expert technical interviewer creating high-yield flashcards for technical interview preparation. Return valid JSON only.",
      userPrompt,
      responseFormat: "json_object",
      temperature: 0.1,
    });

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(completion);
    } catch {
      const match = completion.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        parsedJson = JSON.parse(match[1]);
      }
    }

    const validation = rawFlashcardsResponseSchema.safeParse(parsedJson);
    if (validation.success && validation.data.flashcards.length > 0) {
      const validReqIds = new Set(requirements.map((r) => r.id.toUpperCase()));

      return validation.data.flashcards.map((fc, idx) => {
        const reqId = fc.requirement_id.trim();
        const validId = validReqIds.has(reqId.toUpperCase())
          ? reqId
          : requirements[idx % requirements.length].id;

        return {
          id: `f${idx + 1}`,
          front: fc.front,
          back: fc.back,
          requirement_ids: [validId],
        };
      });
    }
  } catch (err) {
    console.warn(
      `[Flashcards] LLM generation failed, falling back to deterministic generation: ${(err as Error).message}`
    );
  }

  // Deterministic fallback
  return generateDeterministicFlashcards(requirements, questions);
}
