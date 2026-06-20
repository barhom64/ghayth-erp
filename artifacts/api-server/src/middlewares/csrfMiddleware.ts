import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";

const isProduction = config.isProduction;
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
  // #2137 slice 2 — public, token-authenticated account recovery. The
  // single-use token in the body IS the credential; there is no session
  // cookie to protect against CSRF.
  "/api/auth/reset-password",
  "/api/auth/activate",
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

  // Bearer-authenticated requests (the Capacitor native app) carry NO cookies
  // — they send `Authorization: Bearer`. CSRF protects cookie auth only: a
  // browser auto-attaches cookies to forged cross-site requests, but it never
  // auto-attaches an Authorization header, so a pure-Bearer request cannot be
  // a CSRF vector. Skip the cookie-pair check for it; otherwise EVERY write
  // (POST/PATCH/DELETE) from the native app would 403 (no erp_csrf cookie).
  const authHeader = req.headers.authorization;
  const isBearerAuth = typeof authHeader === "string" && authHeader.startsWith("Bearer ");
  const hasAuthCookie = !!req.cookies?.erp_access;
  if (isBearerAuth && !hasAuthCookie) {
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
