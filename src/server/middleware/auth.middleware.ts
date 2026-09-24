import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface JwtUserPayload {
  userId: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  let token = req.cookies?.auth_token;

  if (!token && req.headers.authorization) {
    const [scheme, credentials] = req.headers.authorization.split(" ");
    if (scheme?.toLowerCase() === "bearer" && credentials) {
      token = credentials;
    }
  }

  if (!token) {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication token missing.",
      },
    });
    return;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("[Auth] JWT_SECRET is not configured.");
    res.status(500).json({
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Authentication configuration error.",
      },
    });
    return;
  }

  try {
    const decoded = jwt.verify(token, jwtSecret) as JwtUserPayload;
    if (!decoded || !decoded.userId) {
      res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHORIZED",
          message: "Invalid authentication token payload.",
        },
      });
      return;
    }

    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Invalid or expired authentication token.",
      },
    });
  }
}
