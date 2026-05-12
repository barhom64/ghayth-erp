import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";

const isProduction = process.env.NODE_ENV === "production";
const COOKIE_NAME = "erp_csrf";
const HEADER_NAME = "x-csrf-token";
const TOKEN_BYTES = 32;
const TOKEN_MAX_AGE = 24 * 60 * 60 * 1000; // 24h

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const EXEMPT_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
]);

export function setCsrfCookie(res: Response): string {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  res.cookie(COOKIE_NAME, token, {
    httpOnly: false,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: TOKEN_MAX_AGE,
  });
  return token;
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const fullPath = req.baseUrl + req.path;
  if (EXEMPT_PATHS.has(fullPath) || fullPath.startsWith("/api/public/")) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[COOKIE_NAME];
  const headerToken = req.headers[HEADER_NAME];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    logger.warn({ path: fullPath, hasCookie: !!cookieToken, hasHeader: !!headerToken }, "CSRF validation failed");
    res.status(403).json({
      error: "CSRF token مفقود أو غير صالح — أعد تحميل الصفحة",
      code: "CSRF_INVALID",
    });
    return;
  }

  next();
}
