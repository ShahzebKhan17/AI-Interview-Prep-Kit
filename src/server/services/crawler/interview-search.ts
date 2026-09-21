export interface InterviewSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface IInterviewSearchProvider {
  search(query: string, options?: { maxResults?: number }): Promise<InterviewSearchResult[]>;
}

/**
 * Production implementation using Google Custom Search JSON API.
 * Active when GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CX are provided in environment.
 */
export class GoogleCustomSearchProvider implements IInterviewSearchProvider {
  private apiKey: string;
  private cx: string;

  constructor(apiKey?: string, cx?: string) {
    this.apiKey = apiKey || process.env.GOOGLE_SEARCH_API_KEY || "";
    this.cx = cx || process.env.GOOGLE_SEARCH_CX || "";
  }

  async search(query: string, options?: { maxResults?: number }): Promise<InterviewSearchResult[]> {
    if (!this.apiKey || !this.cx) {
      console.warn(
        "[InterviewSearch] Google Custom Search credentials not configured. Returning empty results."
      );
      return [];
    }

    const num = Math.min(options?.maxResults || 3, 5);
    const endpoint = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(
      this.apiKey
    )}&cx=${encodeURIComponent(this.cx)}&q=${encodeURIComponent(query)}&num=${num}`;

    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.warn(`[InterviewSearch] Google Custom Search returned status ${response.status}`);
        return [];
      }

      const data = (await response.json()) as {
        items?: Array<{ title?: string; link?: string; snippet?: string }>;
      };

      if (!data.items || !Array.isArray(data.items)) {
        return [];
      }

      return data.items
        .filter((item) => item.link && item.title)
        .map((item) => ({
          title: item.title || "Interview Experience",
          url: item.link as string,
          snippet: item.snippet || "",
        }));
    } catch (err) {
      console.warn(`[InterviewSearch] Search query failed: ${(err as Error).message}`);
      return [];
    }
  }
}

/**
 * Deterministic Mock Interview Search Provider for testing and offline development.
 */
export class MockInterviewSearchProvider implements IInterviewSearchProvider {
  private customHandler?: (query: string) => InterviewSearchResult[];

  constructor(customHandler?: (query: string) => InterviewSearchResult[]) {
    this.customHandler = customHandler;
  }

  async search(query: string, options?: { maxResults?: number }): Promise<InterviewSearchResult[]> {
    const results = this.customHandler
      ? this.customHandler(query)
      : [
          {
            title: "Mock Interview Review",
            url: "https://interview-mock.org/reviews/company-role",
            snippet: "4 rounds: recruiter screen, coding round, system architecture, behavioral.",
            sourceType: "interview_review" as const,
          },
        ];

    return options?.maxResults ? results.slice(0, options.maxResults) : results;
  }
}

let activeSearchProvider: IInterviewSearchProvider | null = null;

export function setInterviewSearchProvider(provider: IInterviewSearchProvider | null): void {
  activeSearchProvider = provider;
}

export function getDefaultInterviewSearchProvider(): IInterviewSearchProvider {
  if (activeSearchProvider) {
    return activeSearchProvider;
  }

  if (process.env.NODE_ENV === "test" || process.env.MOCK_SEARCH === "true") {
    return new MockInterviewSearchProvider();
  }

  if (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX) {
    return new GoogleCustomSearchProvider();
  }

  // Graceful fallback for offline development without paid search keys
  return new MockInterviewSearchProvider();
}
