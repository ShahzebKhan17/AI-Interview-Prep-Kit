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
