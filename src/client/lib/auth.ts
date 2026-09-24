import { AuthResponse, AuthUser } from "@shared/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export class AuthError extends Error {
  code: string;
  constructor(message: string, code = "AUTH_ERROR") {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

const TOKEN_KEY = "auth_token";

export function getStoredToken(): string | null {
  if (typeof window !== "undefined") {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }
  return null;
}

export function setStoredToken(token: string): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Ignore storage errors in restricted contexts
    }
  }
}

export function removeStoredToken(): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Ignore storage errors
    }
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getStoredToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      throw new AuthError(errorMessage, errorCode);
    }

    return data as T;
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError(
      (error as Error)?.message || "Network error. Please check your connection."
    );
  }
}

export async function register(
  name: string,
  email: string,
  password: string
): Promise<AuthUser> {
  const result = await request<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });

  if (!result.user) {
    throw new AuthError("Registration failed to return user profile.");
  }

  return result.user;
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const result = await request<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  if (!result.user) {
    throw new AuthError("Login failed to return user profile.");
  }

  if (result.token) {
    setStoredToken(result.token);
  }

  return result.user;
}

export async function logout(): Promise<void> {
  try {
    await request<{ success: boolean }>("/api/auth/logout", {
      method: "POST",
    });
  } finally {
    removeStoredToken();
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const result = await request<AuthResponse>("/api/auth/me", {
      method: "GET",
    });
    return result.user || null;
  } catch (error) {
    if (error instanceof AuthError && error.code === "HTTP_401") {
      removeStoredToken();
      return null;
    }
    // For other errors like network error or unauthenticated, return null
    return null;
  }
}
