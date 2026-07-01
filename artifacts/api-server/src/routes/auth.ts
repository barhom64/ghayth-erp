import { handleRouteError, ValidationError, ForbiddenError, NotFoundError, ConflictError, parseId, zodParse } from "../lib/errorHandler.js";
import { Router, type Response as ExpressResponse } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { signToken, signRefreshToken, verifyPassword, hashPassword, signPending2faToken, verifyPending2faToken } from "../lib/auth.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { setCsrfCookie } from "../middlewares/csrfMiddleware.js";
import { canonicalizeModules } from "../lib/rbac/roleModulesCatalog.js";
import rateLimit from "express-rate-limit";
import { createPerUserLimiter } from "../lib/perUserRateLimit.js";
import { makeRateLimitStore } from "../lib/rateLimitStore.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { seedRolesAndGrantsV2 } from "../lib/rbac/autoMigrate.js";
import { consumeAuthToken } from "../lib/authTokens.js";
import { sendAuthEmail } from "../lib/authNotifications.js";
import {
  authenticateUserByPassword,
  createUserSession,
  rotateUserSession,
  loadUserSessionContext,
} from "../lib/authSession.js";
import { encryptField, decryptField } from "../lib/fieldEncryption.js";
import {
  generateSecret,
  otpauthURL,
  verifyTOTP,
  generateBackupCodes,
  hashBackupCode,
} from "../lib/totp.js";
import QRCode from "qrcode";

const router = Router();

interface UserRoleRow {
  id: number;
  roleKey: string;
  label: string;
  modules: unknown;
  level: number;
  source: "legacy" | "v2";
}

interface EmployeeMeRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  empNumber: string | null;
  photoUrl: string | null;
  status: string;
  jobTitle: string | null;
  jobTitleId: number | null;
  role: string;
  salary: number | string | null;
  companyId: number;
  branchId: number | null;
  companyName: string | null;
  branchName: string | null;
  preferredCalendar: "hijri" | "gregorian";
  preferredLocale: "ar" | "en";
  tablePrefs: Record<string, unknown>;
}

interface UserPasswordRow {
  id: number;
  passwordHash: string;
}

interface AssignmentSwitchRow {
  id: number;
  companyId: number;
  branchId: number | null;
  role: string;
}

const isProduction = config.isProduction;

function setAccessTokenCookie(res: ExpressResponse, token: string) {
  res.cookie("erp_access", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/api",
    maxAge: 15 * 60 * 1000,
  });
}

function setRefreshTokenCookie(res: ExpressResponse, refreshToken: string) {
  res.cookie("erp_refresh", refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res: ExpressResponse) {
  res.clearCookie("erp_access", { path: "/api" });
  res.clearCookie("erp_refresh", { path: "/api/auth" });
}

const loginSchema = z.object({
  email: z.string().min(1, "البريد الإلكتروني مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "رمز التحديث مطلوب"),
});

const switchAssignmentSchema = z.object({
  assignmentId: z.coerce.number({ required_error: "التعيين مطلوب" }),
});

// Shared strong-password rule (mirrors change-password).
const newPasswordRule = z.string()
  .min(8, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل")
  .regex(/[A-Z]/, "يجب أن تحتوي على حرف كبير واحد على الأقل")
  .regex(/[a-z]/, "يجب أن تحتوي على حرف صغير واحد على الأقل")
  .regex(/[0-9]/, "يجب أن تحتوي على رقم واحد على الأقل")
  .regex(/[^a-zA-Z0-9]/, "يجب أن تحتوي على رمز خاص واحد على الأقل");

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: newPasswordRule,
});

// #2137 slice 2 — token-driven account recovery (public, token-authenticated).
const tokenResetSchema = z.object({
  token: z.string().min(16, "الرمز غير صالح").max(200),
  newPassword: newPasswordRule,
});

// NOTE: A router-wide per-IP authRouteLimiter previously sat here. It has
// been removed because it threw IP-based caps on authenticated endpoints
// (/auth/me, /auth/logout, /auth/switch-assignment, /auth/change-password),
// which violates the per-user rate-limit policy (admins on a shared proxy
// IP could be unfairly throttled). Anonymous endpoints below
// (/register, /login, /refresh) keep their own dedicated per-IP limiters,
// and /change-password gets a per-user limiter (changePasswordLimiter).
// The truly authenticated endpoints (/me, /logout, /switch-assignment) are
// covered by the global per-user limiter mounted in routes/index.ts after
// authMiddleware.

const REFRESH_TOKEN_TTL_DAYS = 7;

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("auth:login"),
  // The Playwright suite reuses a single test admin across ~8 tests in
  // parallel + retries, easily exceeding 10/min from a single CI runner.
  // Skip the limiter in non-production when the canonical e2e marker
  // header is set — the workflow already attaches `X-E2E-Test: 1` to
  // every request via playwright.config.ts. Production traffic never
  // carries this header so abuse protection is unchanged there.
  skip: (req) =>
    !config.isProduction && req.headers["x-e2e-test"] === "1",
});

// Per-user limiter for the authenticated /auth/(me,logout,switch) endpoints
// (/me, /logout, /switch-assignment). The /auth router is mounted in routes/index.ts
// BEFORE the global authMiddleware mount, so the per-route authMiddleware
// must run first inside each route chain to set req.scope. Owner/admin
// exempt — these are routine session management calls.
const authedUserLimiter = createPerUserLimiter({
  prefix: "auth:authed",
  windowMs: 60 * 1000,
  max: isProduction ? 120 : 1200,
  message: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة بعد دقيقة",
});

// Per-user change-password limiter. Mounted after authMiddleware on the
// /change-password route, so req.scope is set. Owner/admin NOT exempt — the
// cap is a per-actor safety net against credential-stuffing-style abuse.
const changePasswordLimiter = createPerUserLimiter({
  prefix: "auth:change-pw",
  windowMs: 60 * 1000,
  max: 5,
  message: "تم تجاوز الحد الأقصى لطلبات تغيير كلمة المرور. يرجى المحاولة بعد دقيقة",
  skip: () => false,
});

const refreshLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لطلبات تحديث الرمز. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("auth:refresh"),
  // Same canonical e2e bypass as loginLimiter above: automated suites
  // (Playwright, the 604-route runtime audit) walk pages far faster than a
  // human and each expiry-triggered silent refresh counts against this
  // per-IP cap — mid-run the whole walk bounced to /login. Non-production
  // only; production traffic never carries the header.
  skip: (req) =>
    !config.isProduction && req.headers["x-e2e-test"] === "1",
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لطلبات إنشاء الحسابات. يرجى المحاولة لاحقاً" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("auth:register"),
});

// Dedicated limiter for the PUBLIC GET /setup-state boot probe. It MUST NOT
// reuse `registerLimiter` (max 5/hour): the login page polls /setup-state on
// every mount, so a strict account-creation budget — shared across all
// visitors behind one egress IP and lacking the automated-suite bypass —
// 429s the probe after a handful of page loads, breaking first-run detection
// and spraying console errors across the app. A read-only COUNT(*) probe that
// leaks nothing needs only light bot-deterrence, plus the same non-prod e2e
// bypass loginLimiter/refreshLimiter carry so the runtime audit / Playwright
// walks don't trip it.
const setupStateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("auth:setup-state"),
  skip: (req) =>
    !config.isProduction && req.headers["x-e2e-test"] === "1",
});

router.post("/register", registerLimiter, async (_req, res) => {
  emitEvent({ companyId: 0, userId: 0, action: "auth.register", entity: "users", entityId: 0 }).catch((e) => logger.error(e, "auth background task failed"));
  createAuditLog({ companyId: 0, userId: 0, action: "create", entity: "users", entityId: 0, after: { blocked: true, reason: "self_registration_not_permitted" } }).catch((e) => logger.error(e, "auth background task failed"));
  res.status(405).json({
    error: "إنشاء الحسابات يتم بواسطة المسؤول فقط — Self-registration is not permitted",
    fix: "إذا كنت تُؤسِّس شركة جديدة لأول مرة، استخدم /api/auth/bootstrap-tenant على نظام جديد",
  });
});

// B1 + B3 fix from CRITICAL_DEFECTS_REPORT.md — public setup-state
// probe. Returns whether ANY company exists. The login page polls this
// on mount to decide whether to show the "إعداد النظام لأول مرة" link.
// Unauthenticated by design: the answer is YES (setup needed) or NO
// (login as usual), and neither leaks anything sensitive. Rate-limited
// to deter bots that would otherwise probe to figure out if a fresh
// install exists.
router.get("/setup-state", setupStateLimiter, async (_req, res) => {
  try {
    const [row] = await rawQuery<{ companyCount: string }>(
      `SELECT COUNT(*)::text AS "companyCount" FROM companies`,
      []
    );
    const needsSetup = Number(row?.companyCount ?? "0") === 0;
    res.json({ needsSetup, hasAnyCompany: !needsSetup });
  } catch (err) {
    // On error, default to "no setup needed" so a broken DB doesn't
    // suddenly let anyone bootstrap. Operator sees the real error in
    // server logs.
    logger.error(err, "setup-state probe failed");
    res.json({ needsSetup: false, hasAnyCompany: true });
  }
});

const bootstrapTenantSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صالح"),
  password: z.string().min(8, "كلمة المرور 8 أحرف على الأقل"),
  companyName: z.string().min(2, "اسم الشركة مطلوب"),
  companyNameEn: z.string().optional(),
  ownerName: z.string().min(2, "اسم المالك مطلوب"),
  branchName: z.string().optional(),
});

// B1 + B3 — atomic first-tenant bootstrap. Allows ONLY when the
// companies table is empty (fresh deploy). After the first call,
// every subsequent attempt returns 409. Creates: company, primary
// branch, owner employee + assignment, owner user, owner role grant.
// Wrapped in a transaction so a partial failure leaves no orphan rows
// for the second attempt to trip over.
router.post("/bootstrap-tenant", registerLimiter, async (req, res) => {
  try {
    const parsed = zodParse(bootstrapTenantSchema.safeParse(req.body));
    const { email, password, companyName, companyNameEn, ownerName, branchName } = parsed;

    const [countRow] = await rawQuery<{ companyCount: string }>(
      `SELECT COUNT(*)::text AS "companyCount" FROM companies`,
      []
    );
    if (Number(countRow?.companyCount ?? "0") > 0) {
      // After bootstrap, every call returns 409 — the only path to
      // create more companies is via /settings/companies as an admin.
      res.status(409).json({
        error: "النظام مُعَد مسبقاً — استخدم تسجيل الدخول",
        code: "ALREADY_BOOTSTRAPPED",
      });
      return;
    }

    const hashed = await hashPassword(password);

    let newOwnerUserId = 0;
    let newCompanyId = 0;
    await withTransaction(async (client) => {
      // 1. Company. Trial expiry = 30 days from now.
      const compRes = await client.query(
        `INSERT INTO companies (name, "nameEn", status, "subscriptionStatus", "subscriptionPlan", "trialExpiresAt")
         VALUES ($1, $2, 'active', 'trial', 'trial', NOW() + INTERVAL '30 days')
         RETURNING id`,
        [companyName, companyNameEn || null]
      );
      newCompanyId = compRes.rows[0].id as number;

      // 2. Primary branch — uses the company name if no branch name given.
      const branchRes = await client.query(
        `INSERT INTO branches (name, "companyId") VALUES ($1, $2) RETURNING id`,
        [branchName || `${companyName} — الرئيسي`, newCompanyId]
      );
      const newBranchId = branchRes.rows[0].id as number;

      // 3. Owner employee + assignment so the user row can FK to a
      //    real employeeId (matches the existing /admin/users contract).
      const empRes = await client.query(
        `INSERT INTO employees (name, "companyId", email, status)
         VALUES ($1, $2, $3, 'active') RETURNING id`,
        [ownerName, newCompanyId, email]
      );
      const newEmployeeId = empRes.rows[0].id as number;
      await client.query(
        `INSERT INTO employee_assignments ("employeeId", "companyId", "branchId", "jobTitle", role, status, "hireDate", "isPrimary")
         VALUES ($1, $2, $3, 'مالك', 'owner', 'active', CURRENT_DATE, true)`,
        [newEmployeeId, newCompanyId, newBranchId]
      );

      // 4. Owner user. role='owner' is the wildcard grant — every
      //    feature passes the authorize() gate for this role.
      const userRes = await client.query(
        `INSERT INTO users (email, "passwordHash", role, "employeeId", "isActive")
         VALUES ($1, $2, 'owner', $3, true) RETURNING id`,
        [email, hashed, newEmployeeId]
      );
      newOwnerUserId = userRes.rows[0].id as number;

      // 5. Seed RBAC v2 roles/grants for the new company and bind the owner
      //    so they appear in the role-switcher and RBAC matrix (#1791 —
      //    legacy user_roles removed; login reads rbac_user_roles only).
      const { roleIdByKey } = await seedRolesAndGrantsV2(client, newCompanyId);
      const ownerRoleId = roleIdByKey["owner"];
      if (ownerRoleId) {
        await client.query(
          `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, "branchId", is_primary)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT ("userId", "companyId", role_id) DO NOTHING`,
          [newOwnerUserId, newCompanyId, ownerRoleId, newBranchId]
        );
      }
    });

    // Bootstrap helpers (CoA seed, leave types, numbering prefixes,
    // default settings) run on first /settings/companies POST today.
    // Replicating that wiring here would couple two flows; let the
    // existing helper run on the FIRST UI-driven settings save. For
    // now the owner sees a working but empty workspace and can finish
    // setup from /settings.

    await createAuditLog({
      companyId: newCompanyId, userId: newOwnerUserId,
      action: "bootstrap", entity: "companies", entityId: newCompanyId,
      after: { companyName, ownerName, email },
    }).catch(() => undefined);
    await emitEvent({
      companyId: newCompanyId, userId: newOwnerUserId,
      action: "tenant.bootstrapped", entity: "companies", entityId: newCompanyId,
    }).catch(() => undefined);

    res.status(201).json({
      ok: true,
      message: "تم إعداد النظام بنجاح. سجّل الدخول بالبريد وكلمة المرور التي أدخلتها.",
      companyId: newCompanyId,
    });
  } catch (err) {
    handleRouteError(err, res, "Bootstrap tenant failed");
  }
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    }
    const { email, password } = parsed.data;

    // Credential check + lockout + assignments/roles load are shared with
    // the mobile flow via authenticateUserByPassword (single source of
    // truth — see lib/authSession.ts).
    const auth = await authenticateUserByPassword(email, password);
    const { primary, assignments, userRoles } = auth;

    // #2712 (1ب) — إن كانت 2FA مفعّلة: لا تُصدر جلسة؛ أعد رمزًا مؤقّتًا فقط
    // (لا يصلح كرمز وصول)، يكملها العميل عبر /auth/2fa/verify-login.
    const [twofaRow] = await rawQuery<{ twoFactorEnabled: boolean }>(
      `SELECT "twoFactorEnabled" FROM users WHERE id=$1`, [auth.userId]);
    if (twofaRow?.twoFactorEnabled) {
      const pendingToken = signPending2faToken({ userId: auth.userId, employeeId: auth.employeeId, assignmentId: primary.id, role: primary.role });
      emitEvent({ companyId: primary.companyId, branchId: primary.branchId ?? undefined, userId: auth.userId, action: "auth.login.2fa_required", entity: "users", entityId: auth.userId, ip: (req.ip ?? null) || "unknown", details: JSON.stringify({ email }) }).catch((e) => logger.error(e, "auth background task failed"));
      res.json({ twoFactorRequired: true, pendingToken });
      return;
    }

    const ipAddress = req.ip ?? null;
    const session = await createUserSession({
      userId: auth.userId,
      assignmentId: primary.id,
      role: primary.role,
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress,
    });

    // Web transport: tokens live in HttpOnly cookies, never the body.
    setAccessTokenCookie(res, session.accessToken);
    setRefreshTokenCookie(res, session.refreshToken);
    setCsrfCookie(res);

    emitEvent({ companyId: primary.companyId, branchId: primary.branchId ?? undefined, userId: auth.userId, action: "auth.login.success", entity: "users", entityId: auth.userId, ip: ipAddress || "unknown", details: JSON.stringify({ email, assignmentId: primary.id }) }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ assignments, userRoles });
  } catch (err) {
    handleRouteError(err, res, "Login error:");
  }
});

router.post("/refresh", refreshLimiter, async (req, res) => {
  try {
    const refreshToken = req.cookies?.erp_refresh || req.body?.refreshToken;
    if (!refreshToken || typeof refreshToken !== "string") {
      throw new ValidationError("رمز التحديث مطلوب");
    }

    // Validation + rotation (reuse detection) shared with the mobile flow
    // via rotateUserSession — see lib/authSession.ts.
    const session = await rotateUserSession(refreshToken, {
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: req.ip ?? null,
    });

    setAccessTokenCookie(res, session.accessToken);
    setRefreshTokenCookie(res, session.refreshToken);
    setCsrfCookie(res);

    emitEvent({ companyId: 0, userId: session.userId, action: "auth.refresh", entity: "users", entityId: session.userId }).catch((e) => logger.error(e, "auth background task failed"));
    createAuditLog({ companyId: 0, userId: session.userId, action: "update", entity: "users", entityId: session.userId, after: { reason: "token_refresh" } }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Refresh token error:");
  }
});

// ─── Mobile (Bearer-token) auth ──────────────────────────────────────
// Native apps (Expo) have no cookie jar scoped to `/api`, so the mobile
// flow returns the SAME access + refresh tokens in the JSON body instead
// of Set-Cookie. The access token is the identical signToken() JWT used by
// the cookie flow, so authMiddleware (already Bearer-aware) + buildScope
// reconstruct identical RBAC / allowedModules / feature-flag scope — the
// mobile client inherits web's permissions with ZERO changes to the
// authorization layer. Lockout, reuse-detection, and assignment loading
// are shared verbatim with the web handlers (lib/authSession.ts).
//
// Session lifecycle: access token expires in `accessTokenExpiresIn`
// seconds (15m); when a protected call returns 401, the client posts its
// stored refresh token to `/api/auth/mobile/refresh` to obtain a new pair
// (refresh tokens are rotated; reuse burns the whole session). To sign
// out, the client posts `{ refreshToken }` to the existing
// `/api/auth/logout` with its Bearer header.
router.post("/mobile/login", loginLimiter, async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    }
    const { email, password } = parsed.data;

    const auth = await authenticateUserByPassword(email, password);
    const { primary, assignments, userRoles } = auth;

    // #2712 (1ب) — 2FA مفعّلة: أعد رمزًا مؤقّتًا في الجسم (لا يصلح كرمز وصول)؛
    // يكملها العميل عبر /auth/mobile/2fa/verify-login.
    const [twofaRow] = await rawQuery<{ twoFactorEnabled: boolean }>(
      `SELECT "twoFactorEnabled" FROM users WHERE id=$1`, [auth.userId]);
    if (twofaRow?.twoFactorEnabled) {
      const pendingToken = signPending2faToken({ userId: auth.userId, employeeId: auth.employeeId, assignmentId: primary.id, role: primary.role });
      emitEvent({ companyId: primary.companyId, branchId: primary.branchId ?? undefined, userId: auth.userId, action: "auth.login.2fa_required", entity: "users", entityId: auth.userId, ip: (req.ip ?? null) || "unknown", details: JSON.stringify({ email, channel: "mobile" }) }).catch((e) => logger.error(e, "auth background task failed"));
      res.json({ twoFactorRequired: true, pendingToken });
      return;
    }

    const ipAddress = req.ip ?? null;
    const session = await createUserSession({
      userId: auth.userId,
      assignmentId: primary.id,
      role: primary.role,
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress,
    });

    // Mobile transport: tokens in the body, NO Set-Cookie.
    emitEvent({ companyId: primary.companyId, branchId: primary.branchId ?? undefined, userId: auth.userId, action: "auth.login.success", entity: "users", entityId: auth.userId, ip: ipAddress || "unknown", details: JSON.stringify({ email, assignmentId: primary.id, channel: "mobile" }) }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({
      tokenType: session.tokenType,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessTokenExpiresIn: session.accessTokenExpiresIn,
      refreshTokenExpiresIn: session.refreshTokenExpiresIn,
      assignments,
      userRoles,
    });
  } catch (err) {
    handleRouteError(err, res, "Mobile login error:");
  }
});

router.post("/mobile/refresh", refreshLimiter, async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken || typeof refreshToken !== "string") {
      throw new ValidationError("رمز التحديث مطلوب");
    }

    const session = await rotateUserSession(refreshToken, {
      userAgent: req.headers["user-agent"] ?? null,
      ipAddress: req.ip ?? null,
    });

    emitEvent({ companyId: 0, userId: session.userId, action: "auth.refresh", entity: "users", entityId: session.userId }).catch((e) => logger.error(e, "auth background task failed"));
    createAuditLog({ companyId: 0, userId: session.userId, action: "update", entity: "users", entityId: session.userId, after: { reason: "token_refresh", channel: "mobile" } }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({
      tokenType: session.tokenType,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessTokenExpiresIn: session.accessTokenExpiresIn,
      refreshTokenExpiresIn: session.refreshTokenExpiresIn,
    });
  } catch (err) {
    handleRouteError(err, res, "Mobile refresh error:");
  }
});

router.post("/logout", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const refreshToken = req.cookies?.erp_refresh || req.body?.refreshToken;
    if (refreshToken) {
      try {
        await rawExecute(
          `UPDATE refresh_tokens SET "revokedAt"=NOW() WHERE token=$1 AND "userId"=$2`,
          [refreshToken, scope.userId]
        );
      } catch (revokeErr) {
        logger.error({ err: revokeErr, userId: scope.userId }, "Failed to revoke refresh token on logout");
      }
    }
    clearAuthCookies(res);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "auth.logout", entity: "users", entityId: scope.userId }).catch((e) => logger.error(e, "auth background task failed"));
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "users", entityId: scope.userId, after: { reason: "logout" } }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Logout error:");
  }
});

router.post("/switch-assignment", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = switchAssignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    }
    const { assignmentId } = parsed.data;
    // Non-owner / non-GM users may only switch among assignments inside
    // their CURRENT company — `scope.allowedAssignments` is company-local
    // (buildScope filters it by the active company). Owners and
    // general_managers legitimately span every company they hold an
    // owner/GM assignment in: buildScope expands `scope.allowedCompanies`
    // for them, so we let them past this pre-check and rely on the
    // company-scoped DB lookup below (`ea."companyId" = ANY(allowedCompanies)`)
    // as the authoritative entitlement gate — a foreign company they do
    // NOT own simply returns no row → NotFoundError. Without this, the
    // header company-switcher (switchToCompany → this route) 403s for an
    // owner moving between their own companies.
    const canCrossCompany = scope.isOwner || scope.role === "general_manager";
    if (!scope.allowedAssignments.includes(Number(assignmentId)) && !canCrossCompany) {
      throw new ForbiddenError("غير مسموح بالتبديل إلى هذا التعيين");
    }
    // Join `branches` so we refuse to switch into an assignment whose
    // branch has been soft-disabled (status='inactive'). Without this,
    // a user with a stale assignment on a disabled branch could keep
    // operating against it indefinitely — the dropdown hides the row
    // (after PR #513), but a direct API call to switch-assignment
    // would still succeed and stamp `scope.branchId` onto new records.
    const [assignment] = await rawQuery<AssignmentSwitchRow>(
      `SELECT ea.id, ea."companyId", ea."branchId", ea.role
         FROM employee_assignments ea
         LEFT JOIN branches b ON b.id = ea."branchId" AND b."companyId" = ea."companyId"
        WHERE ea.id = $1
          AND ea."companyId" = ANY($2::int[])
          AND ea.status = 'active'
          AND (b.id IS NULL OR COALESCE(b.status, 'active') = 'active')`,
      [assignmentId, scope.allowedCompanies]
    );
    if (!assignment) {
      throw new NotFoundError("التعيين غير موجود أو الفرع غير نشط");
    }

    const token = signToken({ userId: scope.userId, assignmentId: Number(assignmentId), role: assignment.role });
    setAccessTokenCookie(res, token);

    const refreshToken = signRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    const userAgent = req.headers["user-agent"] ?? null;
    const ipAddress = req.ip ?? null;

    await withTransaction(async (client) => {
      await client.query('UPDATE refresh_tokens SET "revokedAt"=NOW() WHERE "userId"=$1 AND "revokedAt" IS NULL', [scope.userId]);
      await client.query(
        `INSERT INTO refresh_tokens (token, "userId", "expiresAt", "userAgent", "ipAddress") VALUES ($1, $2, $3, $4, $5)`,
        [refreshToken, scope.userId, expiresAt.toISOString(), userAgent, ipAddress]
      );
    });

    setRefreshTokenCookie(res, refreshToken);

    emitEvent({ companyId: assignment.companyId, userId: scope.userId, action: "auth.switch_assignment", entity: "user_assignments", entityId: Number(assignmentId) }).catch((e) => logger.error(e, "auth background task failed"));
    createAuditLog({ companyId: assignment.companyId, userId: scope.userId, action: "update", entity: "employee_assignments", entityId: Number(assignmentId), after: { switchedTo: assignmentId, role: assignment.role } }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Switch assignment error:");
  }
});

router.get("/me", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;

    const [employee] = await rawQuery<EmployeeMeRow>(
      `SELECT e.id, e.name, e.phone, e.email, e."empNumber",
              e."photoUrl", e.status,
              COALESCE(jt.name, ea."jobTitle") AS "jobTitle",
              ea."jobTitleId", ea.role, ea.salary,
              ea."companyId", ea."branchId",
              c.name AS "companyName", b.name AS "branchName",
              u."preferredCalendar", u."preferredLocale", u."tablePrefs"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id
       JOIN users u ON u."employeeId" = e.id
       LEFT JOIN companies c ON c.id = ea."companyId"
       LEFT JOIN branches b ON b.id = ea."branchId" AND b."companyId" = ea."companyId"
       LEFT JOIN job_titles jt ON jt.id = ea."jobTitleId"
       WHERE ea.id = $1 AND e."deletedAt" IS NULL`,
      [scope.activeAssignmentId]
    );

    if (!employee) {
      throw new NotFoundError("المستخدم غير موجود");
    }

    // Role-switcher source: RBAC v2 only. See /login. (#1791)
    const userRoles = await rawQuery<UserRoleRow>(
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
      [scope.userId, scope.companyId]
    );

    // PR-2 / #2163 — canonicalise. split_part above emits feature-key
    // first-segment names (dashboard/properties/projects/communications);
    // the canonical vocabulary the nav + requireModule consume is
    // (home/property/operations/comms). authSession.ts (the /login
    // counterpart of this handler) does the same.
    const userRolesCanon = userRoles.map((r) => ({
      ...r,
      modules: Array.isArray((r as any).modules)
        ? canonicalizeModules((r as any).modules as string[])
        : (r as any).modules,
    }));

    res.json({ ...employee, userRoles: userRolesCanon });
  } catch (err) {
    handleRouteError(err, res, "GetMe error:");
  }
});

// User-controlled UI preferences. Today: calendar (hijri|gregorian) +
// locale (ar|en). Persisted on `users` so the choice follows the user
// across devices and is available to server-side formatters (emails,
// PDFs, scheduled reports). Both fields are optional in the body — a
// PATCH with only `preferredCalendar` keeps the locale untouched.
const updatePreferencesSchema = z.object({
  preferredCalendar: z.enum(["hijri", "gregorian"]).optional(),
  preferredLocale: z.enum(["ar", "en"]).optional(),
  // Per-user table UI prefs, merged into the existing jsonb (never
  // overwritten). `pageSize` is validated against the allowed set; any
  // other key (future column order / hidden columns / sort) passes through
  // permissively so new prefs don't need another schema change.
  tablePrefs: z.object({
    pageSize: z.number().int().refine((v) => [10, 20, 50, 100, 200].includes(v)).optional(),
  }).passthrough().optional(),
}).refine(
  (b) => b.preferredCalendar !== undefined || b.preferredLocale !== undefined || b.tablePrefs !== undefined,
  { message: "لم يتم تحديد أي تفضيل لتحديثه" },
);

router.patch("/me/preferences", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = updatePreferencesSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    }
    const { preferredCalendar, preferredLocale, tablePrefs } = parsed.data;

    const sets: string[] = [];
    const params: unknown[] = [];
    if (preferredCalendar !== undefined) {
      params.push(preferredCalendar);
      sets.push(`"preferredCalendar" = $${params.length}`);
    }
    if (preferredLocale !== undefined) {
      params.push(preferredLocale);
      sets.push(`"preferredLocale" = $${params.length}`);
    }
    if (tablePrefs !== undefined) {
      // Merge into the existing object (|| is a shallow jsonb merge) so a
      // PATCH carrying only { pageSize } keeps any other table prefs intact.
      params.push(JSON.stringify(tablePrefs));
      sets.push(`"tablePrefs" = COALESCE("tablePrefs", '{}'::jsonb) || $${params.length}::jsonb`);
    }
    params.push(scope.userId);
    const { affectedRows } = await rawExecute(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${params.length}`,
      params
    );
    if (!affectedRows) throw new NotFoundError("المستخدم غير موجود");

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "users",
      entityId: scope.userId,
      after: { preferredCalendar, preferredLocale, tablePrefs },
    }).catch((e) => logger.error(e, "auth background task failed"));

    res.json({
      success: true,
      preferredCalendar: preferredCalendar ?? null,
      preferredLocale: preferredLocale ?? null,
      tablePrefs: tablePrefs ?? null,
    });
  } catch (err) {
    handleRouteError(err, res, "UpdatePreferences error:");
  }
});

router.post("/change-password", authMiddleware, changePasswordLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    }
    const { currentPassword, newPassword } = parsed.data;
    const [user] = await rawQuery<UserPasswordRow>(`SELECT id, "passwordHash" FROM users WHERE id=$1`, [scope.userId]);
    if (!user) { throw new NotFoundError("المستخدم غير موجود"); }
    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) { throw new ForbiddenError("كلمة المرور الحالية غير صحيحة"); }
    const hashed = await hashPassword(newPassword);

    // Atomic: rotate password AND revoke existing refresh tokens together.
    // Previously the revoke ran in fire-and-forget try/catch; if it failed
    // (DB blip mid-request) the password was changed but old tokens stayed
    // valid — a security regression masked by a "success" response. Wrap
    // both in a single transaction so they commit or roll back together.
    await withTransaction(async (client) => {
      const { rowCount: passwordUpdated } = await client.query(
        `UPDATE users SET "passwordHash"=$1 WHERE id=$2`,
        [hashed, scope.userId],
      );
      if (!passwordUpdated) throw new NotFoundError("المستخدم غير موجود");
      await client.query(
        `UPDATE refresh_tokens SET "revokedAt"=NOW() WHERE "userId"=$1 AND "revokedAt" IS NULL`,
        [scope.userId],
      );
    });

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "password_change", entity: "users", entityId: scope.userId,
    }).catch((e) => logger.error(e, "auth background task failed"));
    clearAuthCookies(res);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "auth.password.changed", entity: "users", entityId: scope.userId }).catch((e) => logger.error(e, "auth background task failed"));
    // Security notice (best-effort, no secret) — #2137 slice 2.
    void notifyPasswordChanged(scope.companyId, scope.userId).catch((e) => logger.warn(e, "password-changed notice"));
    res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Change password error:");
  }
});

// ─────────────────────── #2712 — المصادقة الثنائية (2FA / TOTP) ─────────────
// الدفعة 1أ: التسجيل فقط (إعداد/تفعيل/تعطيل/حالة). الإنفاذ عند تسجيل الدخول
// دفعة لاحقة منفصلة (1ب) — هذه الدفعة لا تلمس /login فلا خطر إقفال. السرّ
// يُخزَّن مشفّرًا (fieldEncryption AES) والرموز الاحتياطية مُجزّأة (SHA-256).
// كل النقاط محميّة بـauthMiddleware + authedUserLimiter (نفس /me و/logout).
const TOTP_ISSUER = "Ghayth ERP";

interface User2faRow {
  id: number;
  email: string | null;
  passwordHash: string;
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorEnrolledAt: string | null;
  twoFactorBackupCodes: Array<{ hash: string; usedAt: string | null }> | null;
}

const enable2faSchema = z.object({ token: z.string().min(6, "رمز التحقق مطلوب") });
const disable2faSchema = z.object({
  password: z.string().min(1, "كلمة المرور مطلوبة"),
  token: z.string().optional(),
});

// POST /2fa/setup — يولّد سرًّا (غير مفعّل) ويعيد QR + السرّ للإدخال اليدوي.
router.post("/2fa/setup", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const [user] = await rawQuery<Pick<User2faRow, "id" | "email" | "twoFactorEnabled">>(
      `SELECT id, email, "twoFactorEnabled" FROM users WHERE id=$1`, [scope.userId]);
    if (!user) throw new NotFoundError("المستخدم غير موجود");
    if (user.twoFactorEnabled) throw new ConflictError("المصادقة الثنائية مفعّلة بالفعل", { fix: "عطّلها أولًا إن أردت إعادة التسجيل" });

    const secret = generateSecret();
    await rawExecute(
      `UPDATE users SET "twoFactorSecret"=$1, "twoFactorEnabled"=FALSE WHERE id=$2`,
      [encryptField(secret), scope.userId]);

    const label = user.email || `user-${scope.userId}`;
    const otpauthUrl = otpauthURL({ secret, label, issuer: TOTP_ISSUER });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "users", entityId: scope.userId, after: { reason: "2fa_setup_started" } }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ secret, otpauthUrl, qrDataUrl });
  } catch (err) {
    handleRouteError(err, res, "2FA setup error:");
  }
});

// POST /2fa/enable — يتحقق من أول رمز ثم يفعّل ويُصدر الرموز الاحتياطية مرة واحدة.
router.post("/2fa/enable", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const { token } = zodParse(enable2faSchema.safeParse(req.body ?? {}));
    const [user] = await rawQuery<Pick<User2faRow, "id" | "twoFactorEnabled" | "twoFactorSecret">>(
      `SELECT id, "twoFactorEnabled", "twoFactorSecret" FROM users WHERE id=$1`, [scope.userId]);
    if (!user) throw new NotFoundError("المستخدم غير موجود");
    if (user.twoFactorEnabled) throw new ConflictError("المصادقة الثنائية مفعّلة بالفعل");
    if (!user.twoFactorSecret) throw new ValidationError("ابدأ بإعداد المصادقة الثنائية أولًا", { fix: "اطلب /2fa/setup ثم امسح رمز QR" });

    const secret = decryptField(user.twoFactorSecret);
    if (!verifyTOTP(secret, token)) throw new ForbiddenError("رمز التحقق غير صحيح");

    const backupCodes = generateBackupCodes();
    const hashed = backupCodes.map((c) => ({ hash: hashBackupCode(c), usedAt: null }));
    await rawExecute(
      `UPDATE users SET "twoFactorEnabled"=TRUE, "twoFactorEnrolledAt"=NOW(), "twoFactorBackupCodes"=$1 WHERE id=$2`,
      [JSON.stringify(hashed), scope.userId]);

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "users", entityId: scope.userId, after: { reason: "2fa_enabled" } }).catch((e) => logger.error(e, "auth background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "auth.2fa.enabled", entity: "users", entityId: scope.userId }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true, backupCodes, message: "تم تفعيل المصادقة الثنائية. احفظ الرموز الاحتياطية في مكان آمن — لن تظهر مرة أخرى." });
  } catch (err) {
    handleRouteError(err, res, "2FA enable error:");
  }
});

// POST /2fa/disable — يتطلب كلمة المرور (+ رمزًا حاليًا إن كانت مفعّلة).
router.post("/2fa/disable", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const { password, token } = zodParse(disable2faSchema.safeParse(req.body ?? {}));
    const [user] = await rawQuery<Pick<User2faRow, "id" | "passwordHash" | "twoFactorEnabled" | "twoFactorSecret">>(
      `SELECT id, "passwordHash", "twoFactorEnabled", "twoFactorSecret" FROM users WHERE id=$1`, [scope.userId]);
    if (!user) throw new NotFoundError("المستخدم غير موجود");
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw new ForbiddenError("كلمة المرور غير صحيحة");
    // إن كانت مفعّلة، اطلب رمزًا حاليًا صحيحًا أيضًا (دفاع ضد جلسة مخطوفة).
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!token || !verifyTOTP(decryptField(user.twoFactorSecret), token)) {
        throw new ForbiddenError("رمز التحقق غير صحيح");
      }
    }
    await rawExecute(
      `UPDATE users SET "twoFactorEnabled"=FALSE, "twoFactorSecret"=NULL, "twoFactorBackupCodes"=NULL, "twoFactorEnrolledAt"=NULL WHERE id=$1`,
      [scope.userId]);

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "users", entityId: scope.userId, after: { reason: "2fa_disabled" } }).catch((e) => logger.error(e, "auth background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "auth.2fa.disabled", entity: "users", entityId: scope.userId }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true, message: "تم تعطيل المصادقة الثنائية" });
  } catch (err) {
    handleRouteError(err, res, "2FA disable error:");
  }
});

// GET /2fa/status — حالة التفعيل + عدد الرموز الاحتياطية المتبقية.
router.get("/2fa/status", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const [user] = await rawQuery<Pick<User2faRow, "twoFactorEnabled" | "twoFactorEnrolledAt" | "twoFactorBackupCodes">>(
      `SELECT "twoFactorEnabled", "twoFactorEnrolledAt", "twoFactorBackupCodes" FROM users WHERE id=$1`, [scope.userId]);
    if (!user) throw new NotFoundError("المستخدم غير موجود");
    const codes = Array.isArray(user.twoFactorBackupCodes) ? user.twoFactorBackupCodes : [];
    const remaining = codes.filter((c) => c && !c.usedAt).length;
    res.json({
      enabled: !!user.twoFactorEnabled,
      enrolledAt: user.twoFactorEnrolledAt ?? null,
      backupCodesRemaining: remaining,
    });
  } catch (err) {
    handleRouteError(err, res, "2FA status error:");
  }
});

// ─── #2712 (1ب) — إنفاذ 2FA عند تسجيل الدخول ────────────────────────────────
// بعد نجاح كلمة المرور، إن كانت 2FA مفعّلة يعيد /login رمزًا مؤقّتًا (لا جلسة)؛
// يُكمل العميل هنا برمز TOTP أو رمز احتياطي فتُصدر الجلسة الحقيقية.
const verifyLogin2faSchema = z.object({
  pendingToken: z.string().min(1, "انتهت الجلسة المؤقتة، أعد تسجيل الدخول"),
  token: z.string().optional(),
  backupCode: z.string().optional(),
}).refine((v) => !!v.token || !!v.backupCode, { message: "أدخل رمز التحقق أو رمزًا احتياطيًا" });

interface User2faVerifyRow {
  twoFactorEnabled: boolean;
  twoFactorSecret: string | null;
  twoFactorBackupCodes: Array<{ hash: string; usedAt: string | null }> | null;
}

// يتحقق من العامل الثاني: رمز TOTP أو رمز احتياطي (يُستهلك مرة واحدة). true عند النجاح.
async function passSecondFactor(userId: number, token?: string, backupCode?: string): Promise<boolean> {
  const [u] = await rawQuery<User2faVerifyRow>(
    `SELECT "twoFactorEnabled", "twoFactorSecret", "twoFactorBackupCodes" FROM users WHERE id=$1`, [userId]);
  if (!u || !u.twoFactorEnabled || !u.twoFactorSecret) return false;
  if (token && verifyTOTP(decryptField(u.twoFactorSecret), token)) return true;
  if (backupCode) {
    const wanted = hashBackupCode(backupCode);
    const codes = Array.isArray(u.twoFactorBackupCodes) ? u.twoFactorBackupCodes : [];
    const idx = codes.findIndex((c) => c && !c.usedAt && c.hash === wanted);
    if (idx >= 0) {
      codes[idx]!.usedAt = new Date().toISOString();
      await rawExecute(`UPDATE users SET "twoFactorBackupCodes"=$1 WHERE id=$2`, [JSON.stringify(codes), userId]);
      return true;
    }
  }
  return false;
}

// POST /2fa/verify-login (ويب) — يكمل الدخول بكوكيز الجلسة.
router.post("/2fa/verify-login", loginLimiter, async (req, res) => {
  try {
    const { pendingToken, token, backupCode } = zodParse(verifyLogin2faSchema.safeParse(req.body ?? {}));
    const pending = (() => {
      try { return verifyPending2faToken(pendingToken); }
      catch { throw new ForbiddenError("انتهت الجلسة المؤقتة، أعد تسجيل الدخول"); }
    })();
    if (!(await passSecondFactor(pending.userId, token, backupCode))) {
      throw new ForbiddenError("رمز التحقق غير صحيح");
    }
    const ctx = await loadUserSessionContext(pending.userId, pending.employeeId);
    const ipAddress = req.ip ?? null;
    const session = await createUserSession({
      userId: pending.userId, assignmentId: pending.assignmentId, role: pending.role,
      userAgent: req.headers["user-agent"] ?? null, ipAddress,
    });
    setAccessTokenCookie(res, session.accessToken);
    setRefreshTokenCookie(res, session.refreshToken);
    setCsrfCookie(res);
    emitEvent({ companyId: ctx.primary.companyId, branchId: ctx.primary.branchId ?? undefined, userId: pending.userId, action: "auth.login.2fa_success", entity: "users", entityId: pending.userId, ip: ipAddress || "unknown" }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ assignments: ctx.assignments, userRoles: ctx.userRoles });
  } catch (err) {
    handleRouteError(err, res, "2FA verify-login error:");
  }
});

// POST /mobile/2fa/verify-login — نفس المنطق، التوكنات في الجسم.
router.post("/mobile/2fa/verify-login", loginLimiter, async (req, res) => {
  try {
    const { pendingToken, token, backupCode } = zodParse(verifyLogin2faSchema.safeParse(req.body ?? {}));
    const pending = (() => {
      try { return verifyPending2faToken(pendingToken); }
      catch { throw new ForbiddenError("انتهت الجلسة المؤقتة، أعد تسجيل الدخول"); }
    })();
    if (!(await passSecondFactor(pending.userId, token, backupCode))) {
      throw new ForbiddenError("رمز التحقق غير صحيح");
    }
    const ctx = await loadUserSessionContext(pending.userId, pending.employeeId);
    const ipAddress = req.ip ?? null;
    const session = await createUserSession({
      userId: pending.userId, assignmentId: pending.assignmentId, role: pending.role,
      userAgent: req.headers["user-agent"] ?? null, ipAddress,
    });
    emitEvent({ companyId: ctx.primary.companyId, branchId: ctx.primary.branchId ?? undefined, userId: pending.userId, action: "auth.login.2fa_success", entity: "users", entityId: pending.userId, ip: ipAddress || "unknown", details: JSON.stringify({ channel: "mobile" }) }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({
      tokenType: session.tokenType,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessTokenExpiresIn: session.accessTokenExpiresIn,
      refreshTokenExpiresIn: session.refreshTokenExpiresIn,
      assignments: ctx.assignments,
      userRoles: ctx.userRoles,
    });
  } catch (err) {
    handleRouteError(err, res, "Mobile 2FA verify-login error:");
  }
});

// ─── #2712 (الدفعة 2) — إدارة الجلسات النشطة (الأجهزة) ───────────────────────
// مبنية على refresh_tokens (مخزن الجلسات الفعلي). يتصرّف المستخدم في جلساته
// هو فقط (ownership عبر userId)، والجلسة الحالية تُميَّز بمطابقة كوكي التحديث.
interface SessionListRow {
  id: number;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// GET /sessions — الجلسات النشطة (غير الملغاة وغير المنتهية).
router.get("/sessions", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const currentRefresh: string | null = req.cookies?.erp_refresh ?? null;
    const rows = await rawQuery<SessionListRow>(
      `SELECT id, "ipAddress", "userAgent", "createdAt"
         FROM refresh_tokens
        WHERE "userId"=$1 AND "revokedAt" IS NULL AND "expiresAt" > NOW()
        ORDER BY "createdAt" DESC`,
      [scope.userId],
    );
    let currentId: number | null = null;
    if (currentRefresh) {
      const [cur] = await rawQuery<{ id: number }>(
        `SELECT id FROM refresh_tokens WHERE token=$1 AND "userId"=$2 LIMIT 1`,
        [currentRefresh, scope.userId],
      );
      currentId = cur?.id ?? null;
    }
    res.json({ data: rows.map((r) => ({ ...r, current: r.id === currentId })) });
  } catch (err) {
    handleRouteError(err, res, "List sessions error:");
  }
});

// POST /sessions/:id/revoke — إنهاء جلسة محددة (يملكها المستخدم).
router.post("/sessions/:id/revoke", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id);
    const { affectedRows } = await rawExecute(
      `UPDATE refresh_tokens SET "revokedAt"=NOW() WHERE id=$1 AND "userId"=$2 AND "revokedAt" IS NULL`,
      [id, scope.userId],
    );
    if (!affectedRows) throw new NotFoundError("الجلسة غير موجودة أو منتهية");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "users", entityId: scope.userId, after: { reason: "session_revoked", sessionId: id } }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true, message: "تم إنهاء الجلسة" });
  } catch (err) {
    handleRouteError(err, res, "Revoke session error:");
  }
});

// POST /sessions/revoke-others — إنهاء كل الجلسات عدا الحالية.
router.post("/sessions/revoke-others", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const currentRefresh: string | null = req.cookies?.erp_refresh ?? null;
    const { affectedRows } = await rawExecute(
      `UPDATE refresh_tokens SET "revokedAt"=NOW()
        WHERE "userId"=$1 AND "revokedAt" IS NULL AND ($2::text IS NULL OR token <> $2)`,
      [scope.userId, currentRefresh],
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "users", entityId: scope.userId, after: { reason: "sessions_revoked_others", count: affectedRows } }).catch((e) => logger.error(e, "auth background task failed"));
    res.json({ success: true, revoked: affectedRows, message: "تم إنهاء بقية الجلسات" });
  } catch (err) {
    handleRouteError(err, res, "Revoke other sessions error:");
  }
});

// ─────────────────────── #2137 slice 2 — account recovery ─────────────────

interface AccountRow {
  userId: number;
  email: string;
  companyId: number;
  name: string;
}

/**
 * Resolve a login account by email → its user id, company, and display
 * name (for templated emails). Email is the login identity (users.email).
 * Returns null when no active user matches — callers MUST stay silent
 * about which case occurred (no user enumeration).
 */
async function lookupAccountByEmail(email: string): Promise<AccountRow | null> {
  const [row] = await rawQuery<AccountRow>(
    `SELECT u.id AS "userId", u.email AS email,
            COALESCE(ea."companyId", 0) AS "companyId",
            COALESCE(e.name, u.email) AS name
       FROM users u
       LEFT JOIN employees e ON e.id = u."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = u."employeeId" AND ea.status = 'active'
      WHERE LOWER(u.email) = LOWER($1) AND u."isActive" = TRUE
      ORDER BY ea."isPrimary" DESC NULLS LAST
      LIMIT 1`,
    [email],
  );
  return row ?? null;
}

/**
 * Best-effort password-changed security notice. No secret.
 *
 * Looks the user up by their globally-unique PK (users.id) only — no
 * tenant-scoped join — because this runs in public token-auth contexts
 * (reset/activate) that have no company scope. The greeting uses the
 * email; a display-name join would pull in the tenant-scoped employees
 * table for no security benefit on a self-addressed notice.
 */
async function notifyPasswordChanged(companyId: number, userId: number): Promise<void> {
  const [row] = await rawQuery<{ email: string }>(
    `SELECT email FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );
  if (!row?.email) return;
  await sendAuthEmail({
    companyId, userId,
    recipientEmail: row.email,
    recipientName: row.email,
    templateKey: "auth.password_changed.email",
    vars: { userName: row.email, changedAt: new Date().toISOString() },
  });
}

/**
 * POST /auth/reset-password — consume a password-reset token (single-use,
 * unexpired) and set the new password. Public + token-authenticated, so
 * CSRF-exempt and per-IP rate-limited like login. Atomically rotates the
 * password and revokes all refresh tokens, then sends the password-changed
 * security notice. A bad/expired/used token yields ONE generic error.
 */
router.post("/reset-password", loginLimiter, async (req, res) => {
  try {
    const { token, newPassword } = zodParse(tokenResetSchema.safeParse(req.body));
    const consumed = await consumeAuthToken({ rawToken: token, purpose: "password_reset" });
    if (!consumed || !consumed.userId) {
      throw new ForbiddenError("رابط إعادة التعيين غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.");
    }
    const hashed = await hashPassword(newPassword);
    await withTransaction(async (client) => {
      const { rowCount } = await client.query(`UPDATE users SET "passwordHash"=$1 WHERE id=$2`, [hashed, consumed.userId]);
      if (!rowCount) throw new NotFoundError("المستخدم غير موجود");
      await client.query(`UPDATE refresh_tokens SET "revokedAt"=NOW() WHERE "userId"=$1 AND "revokedAt" IS NULL`, [consumed.userId]);
    });
    void createAuditLog({ companyId: 0, userId: consumed.userId, action: "password_reset_completed", entity: "users", entityId: consumed.userId }).catch((e) => logger.warn(e, "audit reset"));
    void emitEvent({ companyId: 0, branchId: 0, userId: consumed.userId, action: "auth.password.reset_completed", entity: "users", entityId: consumed.userId }).catch((e) => logger.warn(e, "event reset"));
    void notifyPasswordChanged(0, consumed.userId).catch((e) => logger.warn(e, "password-changed notice"));
    res.json({ success: true, message: "تم تعيين كلمة المرور الجديدة. يمكنك تسجيل الدخول الآن." });
  } catch (err) {
    handleRouteError(err, res, "reset-password");
  }
});

/**
 * POST /auth/activate — consume an activation/invitation token and set the
 * account's first password. Public + token-authenticated. Same single-use
 * + revoke + notice flow as reset-password; accepts either purpose.
 */
router.post("/activate", loginLimiter, async (req, res) => {
  try {
    const { token, newPassword } = zodParse(tokenResetSchema.safeParse(req.body));
    // Try invitation first, then activation — both grant first-password set.
    const consumed =
      (await consumeAuthToken({ rawToken: token, purpose: "invitation" })) ??
      (await consumeAuthToken({ rawToken: token, purpose: "activation" }));
    if (!consumed || !consumed.userId) {
      throw new ForbiddenError("رابط التفعيل غير صالح أو منتهي الصلاحية. اطلب دعوة جديدة.");
    }
    const hashed = await hashPassword(newPassword);
    await withTransaction(async (client) => {
      const { rowCount } = await client.query(`UPDATE users SET "passwordHash"=$1, "isActive"=TRUE WHERE id=$2`, [hashed, consumed.userId]);
      if (!rowCount) throw new NotFoundError("المستخدم غير موجود");
      await client.query(`UPDATE refresh_tokens SET "revokedAt"=NOW() WHERE "userId"=$1 AND "revokedAt" IS NULL`, [consumed.userId]);
    });
    void createAuditLog({ companyId: 0, userId: consumed.userId, action: "account_activated", entity: "users", entityId: consumed.userId }).catch((e) => logger.warn(e, "audit activate"));
    void emitEvent({ companyId: 0, branchId: 0, userId: consumed.userId, action: "auth.account.activated", entity: "users", entityId: consumed.userId }).catch((e) => logger.warn(e, "event activate"));
    res.json({ success: true, message: "تم تفعيل حسابك وتعيين كلمة المرور. يمكنك تسجيل الدخول الآن." });
  } catch (err) {
    handleRouteError(err, res, "activate");
  }
});

export default router;
