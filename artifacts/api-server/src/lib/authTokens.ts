/**
 * Auth tokens — single-use, hashed, expiring tokens for account
 * activation/invitation and password reset (#2137 slice 2).
 *
 * INVARIANTS (owner-mandated):
 *   - the RAW token (256-bit random) appears ONLY inside the link the
 *     user receives; it is NEVER stored, logged, audited, or returned.
 *   - the DB stores ONLY its sha256 hash (password_reset_requests
 *     .tokenHash, migration 380).
 *   - short TTL: 72h activation/invitation, 60min password reset.
 *   - single-use: consume marks usedAt and the partial unique index
 *     frees the hash.
 *   - issuing a new token INVALIDATES every previous unused token for
 *     the same (userId, purpose) — no ambiguity about which link works.
 *   - links are built ONLY from config.publicBaseUrl. If it is empty we
 *     refuse to send a broken link (operational gate, no hardcoded
 *     domain).
 */
import { randomBytes, createHash } from "node:crypto";
import { rawQuery, rawExecute } from "./rawdb.js";
import { config } from "./config.js";

export type AuthTokenPurpose = "password_reset" | "activation" | "invitation";

export const TOKEN_TTL_MINUTES: Record<AuthTokenPurpose, number> = {
  password_reset: 60, // 60 minutes
  activation: 72 * 60, // 72 hours
  invitation: 72 * 60, // 72 hours
};

/** Frontend paths the link points at, per purpose. */
const TOKEN_PATH: Record<AuthTokenPurpose, string> = {
  password_reset: "/reset-password",
  activation: "/activate",
  invitation: "/activate",
};

export class PublicBaseUrlMissingError extends Error {
  constructor() {
    super(
      "رابط النظام العام غير مضبوط (PUBLIC_BASE_URL) — لا يمكن إرسال رابط تفعيل أو إعادة تعيين. اضبط PUBLIC_BASE_URL أولاً.",
    );
    this.name = "PublicBaseUrlMissingError";
  }
}

/** sha256 hex of the raw token. The only form that touches the DB. */
export function hashAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Build the absolute link the user clicks. THROWS PublicBaseUrlMissing
 * when config.publicBaseUrl is empty — callers must surface a safe
 * Arabic error instead of emailing a broken relative link. No domain
 * is ever hardcoded.
 */
export function buildAuthLink(purpose: AuthTokenPurpose, rawToken: string): string {
  const base = config.publicBaseUrl;
  if (!base) throw new PublicBaseUrlMissingError();
  return `${base}${TOKEN_PATH[purpose]}?token=${encodeURIComponent(rawToken)}`;
}

export interface IssuedToken {
  rawToken: string;
  /** absolute link, already built from publicBaseUrl */
  url: string;
  expiresAt: Date;
  ttlMinutes: number;
}

/**
 * Issue a fresh single-use token for (userId, email, purpose). Builds
 * the link FIRST so an empty PUBLIC_BASE_URL fails BEFORE any DB row is
 * created (no orphan tokens, no broken email). Invalidates every prior
 * unused token for the same (userId, purpose) in the same statement.
 *
 * The returned rawToken/url are for the OUTBOUND MESSAGE ONLY — never
 * persist or log them.
 */
export async function issueAuthToken(params: {
  userId: number | null;
  email: string;
  purpose: AuthTokenPurpose;
}): Promise<IssuedToken> {
  const { userId, email, purpose } = params;
  const ttlMinutes = TOKEN_TTL_MINUTES[purpose];
  const rawToken = randomBytes(32).toString("hex");
  // Build the link first — throws on empty PUBLIC_BASE_URL before we write.
  const url = buildAuthLink(purpose, rawToken);
  const tokenHash = hashAuthToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  // Invalidate previous unused tokens for the same (userId, purpose).
  if (userId) {
    await rawExecute(
      `UPDATE password_reset_requests
          SET "usedAt" = now(), status = 'superseded'
        WHERE "userId" = $1 AND purpose = $2 AND "usedAt" IS NULL`,
      [userId, purpose],
    );
  }

  await rawExecute(
    `INSERT INTO password_reset_requests
       (email, "userId", "tokenHash", purpose, status, "expiresAt", "createdAt")
     VALUES ($1, $2, $3, $4, 'pending', $5, now())`,
    [email.trim().toLowerCase(), userId, tokenHash, purpose, expiresAt.toISOString()],
  );

  return { rawToken, url, expiresAt, ttlMinutes };
}

export interface ConsumedToken {
  userId: number | null;
  email: string;
}

/**
 * Consume a raw token for a given purpose. Atomically verifies the
 * token is live (matching hash, not used, not expired) and marks it
 * used — single-use even under concurrent requests (the UPDATE …
 * RETURNING only matches a still-live row). Returns null on any
 * invalid/expired/used token so the caller emits ONE generic safe
 * error (no oracle that distinguishes "wrong" from "expired").
 */
export async function consumeAuthToken(params: {
  rawToken: string;
  purpose: AuthTokenPurpose;
}): Promise<ConsumedToken | null> {
  const tokenHash = hashAuthToken(params.rawToken);
  const rows = await rawQuery<{ userId: number | null; email: string }>(
    `UPDATE password_reset_requests
        SET "usedAt" = now(), status = 'used'
      WHERE "tokenHash" = $1
        AND purpose = $2
        AND "usedAt" IS NULL
        AND "expiresAt" IS NOT NULL
        AND "expiresAt" > now()
      RETURNING "userId", email`,
    [tokenHash, params.purpose],
  );
  return rows[0] ?? null;
}
