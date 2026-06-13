import { handleRouteError, ValidationError, ForbiddenError, NotFoundError, zodParse } from "../lib/errorHandler.js";
import { Router, type Response as ExpressResponse } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { signToken, signRefreshToken, verifyPassword, hashPassword } from "../lib/auth.js";
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
import {
  authenticateUserByPassword,
  createUserSession,
  rotateUserSession,
} from "../lib/authSession.js";

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

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: z.string()
    .min(8, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل")
    .regex(/[A-Z]/, "يجب أن تحتوي على حرف كبير واحد على الأقل")
    .regex(/[a-z]/, "يجب أن تحتوي على حرف صغير واحد على الأقل")
    .regex(/[0-9]/, "يجب أن تحتوي على رقم واحد على الأقل")
    .regex(/[^a-zA-Z0-9]/, "يجب أن تحتوي على رمز خاص واحد على الأقل"),
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

// Per-user limiter for the authenticated /auth/* endpoints (/me, /logout,
// /switch-assignment). The /auth router is mounted in routes/index.ts
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
router.get("/setup-state", registerLimiter, async (_req, res) => {
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
    if (!scope.allowedAssignments.includes(Number(assignmentId))) {
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
              u."preferredCalendar", u."preferredLocale"
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
}).refine(
  (b) => b.preferredCalendar !== undefined || b.preferredLocale !== undefined,
  { message: "لم يتم تحديد أي تفضيل لتحديثه" },
);

router.patch("/me/preferences", authMiddleware, authedUserLimiter, async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = updatePreferencesSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    }
    const { preferredCalendar, preferredLocale } = parsed.data;

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
      after: { preferredCalendar, preferredLocale },
    }).catch((e) => logger.error(e, "auth background task failed"));

    res.json({
      success: true,
      preferredCalendar: preferredCalendar ?? null,
      preferredLocale: preferredLocale ?? null,
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
    res.json({ success: true, message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Change password error:");
  }
});

export default router;
