/**
 * LLM Service Abstraction
 * Supports OpenAI-compatible providers and an intelligent mock implementation
 * for deterministic offline testing and environments without API credentials.
 */

export interface LlmCompletionOptions {
  systemPrompt?: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
}

export interface ILlmService {
  generateCompletion(options: LlmCompletionOptions): Promise<string>;
}

export interface OpenAiConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

/**
 * OpenAI API client implementation using standard fetch.
 * Works with OpenAI and any OpenAI-compatible API endpoint (Groq, OpenRouter, Ollama, etc.).
 */
export class OpenAiLlmService implements ILlmService {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config?: OpenAiConfig) {
    this.apiKey = config?.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config?.model || process.env.OPENAI_MODEL || "gpt-4o-mini";
    this.baseUrl = (
      config?.baseUrl ||
      process.env.OPENAI_BASE_URL ||
      "https://api.openai.com/v1"
    ).replace(/\/+$/, "");
  }

  async generateCompletion(options: LlmCompletionOptions): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is not configured. Set the environment variable or use MockLlmService."
      );
    }

    const messages: Array<{ role: "system" | "user"; content: string }> = [];

    if (options.systemPrompt) {
      messages.push({
        role: "system",
        content: options.systemPrompt,
      });
    }

    messages.push({
      role: "user",
      content: options.userPrompt,
    });

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.1,
    };

    if (options.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    if (options.maxTokens) {
      body.max_tokens = options.maxTokens;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorDetails = "";
      try {
        const errorJson = (await response.json()) as {
          error?: { message?: string };
        };
        errorDetails = errorJson.error?.message || response.statusText;
      } catch {
        errorDetails = response.statusText;
      }
      throw new Error(
        `OpenAI API request failed (${response.status}): ${errorDetails}`
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("OpenAI API returned an empty or invalid completion.");
    }

    return content;
  }
}

/**
 * Heuristic/Mock LLM Service for testing without incurring API costs
 * or when developing offline.
 */
export class MockLlmService implements ILlmService {
  private customHandler?: (options: LlmCompletionOptions) => string;

  constructor(customHandler?: (options: LlmCompletionOptions) => string) {
    this.customHandler = customHandler;
  }

  async generateCompletion(options: LlmCompletionOptions): Promise<string> {
    if (this.customHandler) {
      return this.customHandler(options);
    }

    // Default heuristic extraction based on user prompt content
    const rawText = options.userPrompt;
    return this.heuristicExtract(rawText);
  }

  private heuristicExtract(text: string): string {
    const lines = text.split(/\r?\n/);
    const requirements: Array<{
      text: string;
      kind: "technical" | "behavioral" | "domain";
      priority: "must" | "nice";
    }> = [];

    const domainKeywords = [
      "fintech",
      "finance",
      "banking",
      "healthcare",
      "e-commerce",
      "ecommerce",
      "retail",
      "crypto",
      "blockchain",
      "insurance",
      "logistics",
    ];

    const behavioralKeywords = [
      "communication",
      "leadership",
      "teamwork",
      "team player",
      "collaborative",
      "collaboration",
      "problem-solving",
      "problem solving",
      "ownership",
      "mentor",
      "mentoring",
      "interpersonal",
      "agile",
    ];

    const niceKeywords = [
      "preferred",
      "nice to have",
      "nice-to-have",
      "plus",
      "bonus",
      "optional",
      "a plus",
    ];

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // Look for bullet-point lines or list lines
      const bulletMatch = line.match(/^[-*•\d.)\]]\s*(.+)$/);
      if (!bulletMatch) continue;

      const itemText = bulletMatch[1].trim();
      if (!itemText) continue;

      // Ignore generic headers or sections
      const lower = itemText.toLowerCase();
      if (
        lower.startsWith("we are looking") ||
        lower.startsWith("requirements") ||
        lower.startsWith("about us") ||
        lower.startsWith("responsibilities") ||
        lower.startsWith("what you will do") ||
        lower.startsWith("benefits") ||
        lower.startsWith("salary")
      ) {
        continue;
      }

      // Priority determination
      const isNice = niceKeywords.some((kw) => lower.includes(kw));
      const priority = isNice ? "nice" : "must";

      // Kind determination
      let kind: "technical" | "behavioral" | "domain" = "technical";
      if (domainKeywords.some((kw) => lower.includes(kw))) {
        kind = "domain";
      } else if (behavioralKeywords.some((kw) => lower.includes(kw))) {
        kind = "behavioral";
      }

      requirements.push({
        text: itemText,
        kind,
        priority,
      });
    }

    return JSON.stringify({ requirements });
  }
}

/**
 * Returns the default LLM service based on environment configuration.
 */
export function getDefaultLlmService(): ILlmService {
  if (
    process.env.MOCK_LLM === "true" ||
    process.env.NODE_ENV === "test"
  ) {
    return new MockLlmService();
  }

  if (process.env.OPENAI_API_KEY) {
    return new OpenAiLlmService();
  }

  // Graceful fallback for local development without API key
  console.warn(
    "[LlmService] OPENAI_API_KEY not found in environment. Defaulting to MockLlmService."
  );
  return new MockLlmService();
}
