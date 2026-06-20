import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { config } from "./config.js";

const _jwtSecret = config.jwtSecret;
if (!_jwtSecret) {
  console.error("FATAL: JWT_SECRET environment variable must be set. Exiting.");
  process.exit(1);
}
if (_jwtSecret.length < 32) {
  console.error(`FATAL: JWT_SECRET must be at least 32 characters (got ${_jwtSecret.length}). Exiting.`);
  process.exit(1);
}
const SECRET = _jwtSecret;

export interface JWTPayload {
  userId: number;
  assignmentId: number;
  role: string;
  /**
   * Optional capability scope. A normal session token has none (full
   * API access via the user's RBAC grants). A `"field_tracking"` token
   * is a long-lived, capability-restricted credential issued to the
   * native background-geolocation plugin: authMiddleware rejects it on
   * every route except the field-ping endpoint (see
   * FIELD_TRACKING_ALLOWED_PATHS). This keeps a token that may sit for
   * hours on a device from ever unlocking the rest of the API.
   */
  scope?: "field_tracking";
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, SECRET!, { expiresIn: "15m" });
}

/**
 * Long-lived, capability-restricted token for the native background
 * tracker. Carries `scope:"field_tracking"` so authMiddleware confines
 * it to the field-ping endpoint, and a longer TTL (default 12h) so the
 * plugin can keep posting while the app is backgrounded/terminated
 * without re-authenticating on the 15-minute session cadence.
 */
export function signFieldTrackingToken(
  payload: Omit<JWTPayload, "scope">,
  ttlHours = 12,
): string {
  return jwt.sign(
    { ...payload, scope: "field_tracking" satisfies JWTPayload["scope"] },
    SECRET!,
    { expiresIn: `${ttlHours}h` },
  );
}

export function signRefreshToken(): string {
  return randomBytes(64).toString("hex");
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, SECRET!, { algorithms: ["HS256"] }) as unknown as JWTPayload;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
