import { IKit, IRequirement, ICompanyBrief, IQuestion, ICoverageReport, KitResponse } from "@shared/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export class KitApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "KIT_ERROR", status = 500) {
    super(message);
    this.name = "KitApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMessage =
        data?.error?.message ||
        data?.message ||
        `Request failed with status ${response.status}`;
      const errorCode = data?.error?.code || `HTTP_${response.status}`;
      throw new KitApiError(errorMessage, errorCode, response.status);
    }

    return data as T;
  } catch (error) {
    if (error instanceof KitApiError) {
      throw error;
    }
    throw new KitApiError(
      (error as Error)?.message || "Network error. Please check your connection."
    );
  }
}

export async function createKit(payload: {
  title: string;
  jobDescription: string;
  companyUrl: string;
  daysAvailable: number;
}): Promise<IKit> {
  const result = await request<KitResponse>("/api/kits", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!result.kit) {
    throw new KitApiError("Failed to create interview kit.");
  }

  return result.kit;
}

export async function getKits(): Promise<IKit[]> {
  const result = await request<KitResponse>("/api/kits", {
    method: "GET",
  });

  return result.kits || [];
}

export async function getKit(id: string): Promise<IKit> {
  const result = await request<KitResponse>(`/api/kits/${id}`, {
    method: "GET",
  });

  if (!result.kit) {
    throw new KitApiError("Kit not found or access denied.", "KIT_NOT_FOUND", 404);
  }

  return result.kit;
}

export async function extractKitRequirements(
  kitId: string,
  jobDescription: string
): Promise<IRequirement[]> {
  const result = await request<KitResponse>(
    `/api/kits/${kitId}/requirements/extract`,
    {
      method: "POST",
      body: JSON.stringify({ jobDescription }),
    }
  );

  return result.requirements || [];
}

export async function researchCompanyBrief(
  kitId: string,
  companyUrl?: string
): Promise<ICompanyBrief> {
  const result = await request<KitResponse>(
    `/api/kits/${kitId}/research`,
    {
      method: "POST",
      body: JSON.stringify(companyUrl ? { companyUrl } : {}),
    }
  );

  if (!result.companyBrief) {
    throw new KitApiError("Failed to retrieve company research.");
  }

  return result.companyBrief;
}

export async function generateKitQuestions(
  kitId: string
): Promise<IQuestion[]> {
  const result = await request<KitResponse>(
    `/api/kits/${kitId}/generate`,
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );

  if (!result.questionBank) {
    throw new KitApiError("Failed to generate question bank.");
  }

  return result.questionBank;
}

export async function getKitCoverage(
  kitId: string
): Promise<ICoverageReport> {
  const result = await request<KitResponse>(
    `/api/kits/${kitId}/coverage`,
    {
      method: "GET",
    }
  );

  if (!result.coverage) {
    throw new KitApiError("Failed to retrieve coverage report.");
  }

  return result.coverage;
}
