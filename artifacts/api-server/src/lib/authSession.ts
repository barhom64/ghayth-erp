/**
 * Shared auth-session core — single source of truth for credential
 * verification, session-token issuance, and refresh-token rotation.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The web (browser) flow stores the access + refresh tokens in HttpOnly
 * cookies; the mobile (Expo) flow needs the very same tokens returned in
 * the JSON body so a native app — which has no cookie jar scoped to our
 * `/api` path — can attach `Authorization: Bearer <accessToken>`.
 *
 * Rather than fork the login/refresh logic (and risk the two flows
 * drifting on something security-critical like lockout thresholds or
 * refresh-token reuse detection), both the cookie handlers in
 * `routes/auth.ts` and the new `/auth/mobile/*` handlers call into the
 * helpers below. The access token is the EXACT same `signToken()` JWT in
 * both flows, so `authMiddleware` + `buildScope` reconstruct identical
 * RBAC / allowedModules / feature-flag scope regardless of transport —
 * mobile inherits web's permissions automatically, with zero changes to
 * the authorization layer.
 *
 * The functions here own side effects (failed-attempt counters, lockout,
 * refresh_tokens rows) but never touch `res`/cookies — the transport
 * decision (Set-Cookie vs JSON body) stays with the route handler.
 */

import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { signToken, signRefreshToken, verifyPassword } from "./auth.js";
import { ForbiddenError, TooManyRequestsError } from "./errorHandler.js";
import { createAuditLog, emitEvent } from "./businessHelpers.js";
import { sendAuthEmail } from "./authNotifications.js";
import { logger } from "./logger.js";
import { canonicalizeModules } from "./rbac/roleModulesCatalog.js";

export const REFRESH_TOKEN_TTL_DAYS = 7;
/** Access-token lifetime in seconds — mirrors the `"15m"` passed to signToken. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

interface UserLoginRow {
  id: number;
  passwordHash: string;
  isActive: boolean;
  employeeId: number;
  failedLoginAttempts: number;
  lockedUntil: string | null;
}

interface FailedAttemptsRow {
  failedLoginAttempts: number;
}

export interface AssignmentLoginRow {
  id: number;
  companyId: number;
  branchId: number | null;
  role: string;
  status: string;
  jobTitleId: number | null;
  jobTitle: string | null;
  companyName: string | null;
  branchName: string | null;
}

export interface UserRoleRow {
  id: number;
  roleKey: string;
  label: string;
  modules: unknown;
  level: number;
  source: "legacy" | "v2";
}

interface RefreshTokenRow {
  id: number;
  token: string;
  userId: number;
  expiresAt: string;
  revokedAt: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  isActive: boolean;
  employeeId: number;
  lockedUntil: string | null;
  // Carried through from employees.companyId so the downstream
  // employee_assignments lookup stays tenant-scoped.
  companyId: number;
}

interface AssignmentRefreshRow {
  id: number;
  role: string;
}

/** Result of a successful credential check — caller mints the session next. */
export interface AuthenticatedUser {
  userId: number;
  employeeId: number;
  assignments: AssignmentLoginRow[];
  userRoles: UserRoleRow[];
  /** First active assignment — drives the initial JWT's company/branch scope. */
  primary: AssignmentLoginRow;
}

/** A minted session. The route handler decides cookie vs JSON-body transport. */
export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  /** Access-token validity window, seconds. */
  accessTokenExpiresIn: number;
  /** Refresh-token validity window, seconds. */
  refreshTokenExpiresIn: number;
}

export interface SessionContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

/**
 * Verify an email/password pair and load the user's active assignments +
 * RBAC roles. Owns the failed-attempt / lockout side effects.
 *
 * Throws (mapped by handleRouteError to the right status):
 *  - ForbiddenError (403)        — unknown user, wrong password, suspended,
 *                                   or no active assignment.
 *  - TooManyRequestsError (429)  — account locked (pre-existing lock or this
 *                                   attempt tripped MAX_FAILED_ATTEMPTS).
 */
export async function authenticateUserByPassword(
  email: string,
  password: string,
): Promise<AuthenticatedUser> {
  const [user] = await rawQuery<UserLoginRow>(
    `SELECT u.id, u."passwordHash", u."isActive", u."employeeId",
            u."failedLoginAttempts", u."lockedUntil"
     FROM users u WHERE u.email = $1`,
    [email],
  );

  if (!user) {
    throw new ForbiddenError("بيانات الدخول غير صحيحة");
  }

  if (!user.isActive) {
    throw new ForbiddenError("الحساب موقوف");
  }

  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    throw new TooManyRequestsError(
      "الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة متكررة. يرجى المحاولة لاحقاً",
    );
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    // Atomic increment to prevent race conditions (C10).
    const [updated] = await rawQuery<FailedAttemptsRow>(
      `UPDATE users SET "failedLoginAttempts" = "failedLoginAttempts" + 1 WHERE id = $1 RETURNING "failedLoginAttempts"`,
      [user.id],
    );
    const attempts = updated.failedLoginAttempts;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
      try {
        await rawExecute(`UPDATE users SET "lockedUntil"=$1 WHERE id=$2`, [
          lockedUntil.toISOString(),
          user.id,
        ]);
      } catch (lockErr) {
        logger.error({ err: lockErr, userId: user.id }, "Failed to persist account lockout");
      }
      logger.warn({ userId: user.id }, "Account locked due to too many failed login attempts");
      createAuditLog({
        companyId: 0,
        userId: user.id,
        action: "login_failed",
        entity: "users",
        entityId: user.id,
        after: { email, reason: "account_locked", attempts },
      }).catch((e) => logger.error(e, "auth background task failed"));
      throw new TooManyRequestsError(
        `تم قفل الحساب لمدة ${LOCKOUT_MINUTES} دقيقة بسبب تكرار محاولات الدخول الفاشلة`,
      );
    }
    createAuditLog({
      companyId: 0,
      userId: user.id,
      action: "login_failed",
      entity: "users",
      entityId: user.id,
      after: { email, reason: "invalid_password", attempts },
    }).catch((e) => logger.error(e, "auth background task failed"));
    throw new ForbiddenError("بيانات الدخول غير صحيحة");
  }

  try {
    await rawExecute(
      `UPDATE users SET "lastLoginAt"=NOW(), "failedLoginAttempts"=0, "lockedUntil"=NULL WHERE id=$1`,
      [user.id],
    );
  } catch (resetErr) {
    logger.error({ err: resetErr, userId: user.id }, "Failed to reset login state after successful auth");
  }

  return loadUserSessionContext(user.id, user.employeeId);
}

/**
 * Load a user's active assignments + RBAC roles by id — WITHOUT a password
 * check. Shared by the password login (after credentials pass) and the 2FA
 * verify-login step (after the TOTP / backup code passes) so both mint the
 * exact same session context (single source of truth). Throws
 * ForbiddenError when the user has no active assignment.
 */
export async function loadUserSessionContext(userId: number, employeeId: number): Promise<AuthenticatedUser> {
  const assignments = await rawQuery<AssignmentLoginRow>(
    `SELECT ea.id, ea."companyId", ea."branchId", ea.role, ea.status,
            ea."jobTitleId", COALESCE(jt.name, ea."jobTitle") AS "jobTitle",
            c.name AS "companyName", b.name AS "branchName"
     FROM employee_assignments ea
     LEFT JOIN companies c ON c.id = ea."companyId"
     LEFT JOIN branches b ON b.id = ea."branchId" AND b."companyId" = ea."companyId"
     LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
     WHERE ea."employeeId" = $1 AND ea.status = 'active'`,
    [employeeId],
  );

  if (!assignments.length) {
    throw new ForbiddenError("لا يوجد تعيين نشط لهذا المستخدم");
  }

  const primary = assignments[0]!;

  // Role-switcher source: RBAC v2 (rbac_user_roles → rbac_roles) ONLY.
  // (#1791 — legacy user_roles removed.)
  const userRolesRaw = await rawQuery<UserRoleRow>(
    `SELECT
       r.id AS id,
       r.role_key AS "roleKey",
       r.label_ar AS label,
       COALESCE(
         (SELECT to_jsonb(array_agg(DISTINCT split_part(g.feature_key, '.', 1)))
            FROM rbac_role_grants g WHERE g.role_id = r.id),
         '[]'::jsonb
       ) AS modules,
       r.level,
       'v2' AS source,
       COALESCE(ur.is_primary, FALSE) AS is_primary
      FROM rbac_user_roles ur
      JOIN rbac_roles r ON r.id = ur.role_id
     WHERE ur."userId" = $1 AND ur."companyId" = $2
       AND r.is_active = TRUE AND r.is_template = FALSE
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
     ORDER BY is_primary DESC, level DESC`,
    [userId, primary.companyId],
  );

  // PR-2 / #2163 — canonicalise the projection. split_part above emits
  // feature-key first-segment names (dashboard/properties/projects/
  // communications); the nav registry + requireModule consume the
  // canonical vocab (home/property/operations/comms). Collapsing here
  // means the role switcher payload agrees with both sinks. PR-0 §8
  // caught the live drift.
  const userRoles = userRolesRaw.map((r) => ({
    ...r,
    modules: Array.isArray((r as any).modules)
      ? canonicalizeModules((r as any).modules as string[])
      : (r as any).modules,
  }));

  return {
    userId,
    employeeId,
    assignments,
    userRoles,
    primary,
  };
}

/**
 * Mint a fresh access + refresh token pair for an authenticated user and
 * persist the refresh token. The access token is the same `signToken()`
 * JWT used by the cookie flow, so downstream RBAC/scope is identical.
 */
export async function createUserSession(
  params: { userId: number; assignmentId: number; role: string } & SessionContext,
): Promise<IssuedSession> {
  const accessToken = signToken({
    userId: params.userId,
    assignmentId: params.assignmentId,
    role: params.role,
  });

  const refreshToken = signRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  // #2712 (الدفعة 3) — كشف الدخول من جهاز جديد قبل تسجيل الجلسة: هل سبق
  // لهذا المستخدم الدخول بنفس بصمة الجهاز (User-Agent)؟ الكشف قبل الإدراج
  // حتى لا تُحتسب الجلسة الجديدة نفسها «سابقة». بصمة الجهاز أدلّ من الـIP
  // (الذي يتغيّر كثيرًا) فأقلّ ضجيجًا.
  let newDeviceEmail: string | null = null;
  if (params.userAgent) {
    const [probe] = await rawQuery<{ email: string | null; seen: boolean }>(
      `SELECT u.email AS email,
              EXISTS(SELECT 1 FROM refresh_tokens rt WHERE rt."userId"=$1 AND rt."userAgent"=$2) AS seen
         FROM users u WHERE u.id=$1`,
      [params.userId, params.userAgent],
    );
    if (probe && !probe.seen) newDeviceEmail = probe.email ?? "";
  }

  await rawExecute(
    `INSERT INTO refresh_tokens (token, "userId", "expiresAt", "userAgent", "ipAddress")
     VALUES ($1, $2, $3, $4, $5)`,
    [refreshToken, params.userId, expiresAt.toISOString(), params.userAgent ?? null, params.ipAddress ?? null],
  );

  // تنبيه دخول من جهاز جديد — best-effort، لا يحجب إصدار الجلسة.
  if (newDeviceEmail !== null) {
    void alertNewDeviceLogin(params.userId, newDeviceEmail, params.ipAddress ?? null, params.userAgent ?? null);
  }

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
  };
}

/**
 * #2712 (3) — أثر + تنبيه «دخول من جهاز جديد». الأثر (Audit + Event) بلا
 * هجرة ويعطي إشارة أمنية فورية في سجل التدقيق/النشاط. البريد best-effort:
 * يصمت بهدوء إن لم يُهيَّأ قالب «auth.new_device_login.email» (يحتاج seed
 * باعتماد لاحق). كل شيء داخل try فلا يكسر الدخول أبدًا.
 */
async function alertNewDeviceLogin(
  userId: number,
  email: string,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  try {
    void createAuditLog({
      companyId: 0, userId, action: "login_new_device", entity: "users", entityId: userId,
      after: { ip, userAgent },
    }).catch(() => {});
    void emitEvent({
      companyId: 0, userId, action: "auth.login.new_device", entity: "users", entityId: userId,
      ip: ip ?? "unknown", details: JSON.stringify({ userAgent }),
    }).catch(() => {});
    if (email) {
      await sendAuthEmail({
        companyId: 0, userId, recipientEmail: email, recipientName: email,
        templateKey: "auth.new_device_login.email",
        vars: { userName: email, ip: ip ?? "—", device: userAgent ?? "—", at: new Date().toISOString() },
      });
    }
  } catch (e) {
    logger.warn(e, "[authSession] new-device login alert failed (non-blocking)");
  }
}

/**
 * Validate a refresh token and rotate it, returning a new session.
 *
 * Implements the OAuth refresh-token reuse-detection pattern: the old
 * token is revoked atomically with RETURNING, and a no-op revoke (someone
 * already rotated this token) is treated as theft → every outstanding
 * refresh token for the user is burned. Logic is shared verbatim by the
 * web cookie `/refresh` and the mobile `/mobile/refresh` handler.
 *
 * Throws ForbiddenError (403) for invalid/revoked/expired tokens,
 * suspended/locked accounts, or no active assignment.
 */
export async function rotateUserSession(
  oldRefreshToken: string,
  ctx: SessionContext = {},
): Promise<IssuedSession & { userId: number }> {
  const [rt] = await rawQuery<RefreshTokenRow>(
    `SELECT rt.*, u."isActive", u."employeeId", u."lockedUntil", e."companyId"
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt."userId"
     JOIN employees e ON e.id = u."employeeId"
     WHERE rt.token = $1`,
    [oldRefreshToken],
  );

  if (!rt) {
    throw new ForbiddenError("رمز التحديث غير صالح");
  }
  if (rt.revokedAt) {
    throw new ForbiddenError("رمز التحديث ملغي");
  }
  if (new Date(rt.expiresAt) < new Date()) {
    throw new ForbiddenError("انتهت صلاحية رمز التحديث");
  }
  if (!rt.isActive) {
    throw new ForbiddenError("الحساب موقوف");
  }
  if (rt.lockedUntil && new Date(rt.lockedUntil) > new Date()) {
    throw new ForbiddenError("الحساب مقفل مؤقتاً");
  }

  // Tenant scope: an employee belongs to exactly one company. Constraining
  // by BOTH employeeId AND companyId enforces the invariant at query time.
  const [primaryAssignment] = await rawQuery<AssignmentRefreshRow>(
    `SELECT ea.id, ea.role FROM employee_assignments ea
     WHERE ea."employeeId" = $1
       AND ea."companyId" = $2
       AND ea.status = 'active'
     ORDER BY ea."isPrimary" DESC NULLS LAST LIMIT 1`,
    [rt.employeeId, rt.companyId],
  );

  if (!primaryAssignment) {
    throw new ForbiddenError("لا يوجد تعيين نشط");
  }

  const accessToken = signToken({
    userId: rt.userId,
    assignmentId: primaryAssignment.id,
    role: primaryAssignment.role,
  });

  const newRefreshToken = signRefreshToken();
  const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

  // RD4-01 — refresh-token rotation MUST be atomic, and a second use of an
  // already-rotated token MUST burn the session (reuse detection).
  await withTransaction(async (client) => {
    const { rows: revoked } = await client.query(
      `UPDATE refresh_tokens SET "revokedAt" = NOW()
         WHERE id = $1 AND "revokedAt" IS NULL
       RETURNING id`,
      [rt.id],
    );
    if (revoked.length === 0) {
      // Reuse detected — kill every session for this user.
      await client.query(
        `UPDATE refresh_tokens SET "revokedAt" = NOW()
           WHERE "userId" = $1 AND "revokedAt" IS NULL`,
        [rt.userId],
      );
      logger.warn({ userId: rt.userId, tokenId: rt.id }, "[auth] refresh-token reuse detected — revoking all sessions");
      throw new ForbiddenError("رمز التحديث ملغي");
    }
    await client.query(
      `INSERT INTO refresh_tokens (token, "userId", "expiresAt", "userAgent", "ipAddress") VALUES ($1, $2, $3, $4, $5)`,
      [newRefreshToken, rt.userId, newExpiresAt.toISOString(), ctx.userAgent ?? null, ctx.ipAddress ?? null],
    );
  });

  return {
    accessToken,
    refreshToken: newRefreshToken,
    tokenType: "Bearer",
    accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    userId: rt.userId,
  };
}
