import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { makeRateLimitStore } from "../lib/rateLimitStore.js";
import { handleRouteError, ValidationError, NotFoundError, ForbiddenError, isTypedError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { issueNumber } from "../lib/numberingService.js";
import { internalTechRef } from "../lib/internalRef.js";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";

const router = Router();

interface PortalAccountStatusRow {
  id: number;
  isActive: boolean;
}

interface PortalAccountLoginRow {
  id: number;
  clientId: number;
  companyId: number;
  passwordHash: string;
  isActive: boolean;
  mustChangePassword: boolean;
  clientName: string;
  clientEmail: string | null;
  clientPhone: string | null;
}

interface TicketReplyPortalRow {
  id: number;
  message: string;
  senderType: "client" | "staff";
  senderName: string | null;
  createdAt: string;
}

interface CsatRatingRow {
  id: number;
  ticketId: number;
  companyId: number;
  assigneeId: number | null;
  score: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface KbArticleListRow {
  id: number;
  title: string;
  category: string | null;
  tags: unknown;
  views: number | null;
  helpful: number | null;
  notHelpful: number | null;
  createdAt: string;
}

interface KbArticleRow extends KbArticleListRow {
  content: string | null;
  status: string;
  companyId: number | null;
  deletedAt: string | null;
  updatedAt: string | null;
}

const portalLoginSchema = z.object({
  email: z.string().email("البريد الإلكتروني غير صالح"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

const portalTicketReplySchema = z.object({
  message: z.string().min(1, "نص الرد مطلوب"),
});

const portalCreateTicketSchema = z.object({
  title: z.string().min(1, "عنوان الطلب مطلوب"),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  priority: z.string().optional(),
  invoiceId: z.coerce.number().optional().nullable(),
  contractId: z.coerce.number().optional().nullable(),
});

const portalChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "كلمة المرور الحالية مطلوبة"),
  newPassword: z.string().min(6, "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل"),
});

const portalInvoicePaySchema = z.object({
  amount: z.coerce.number({ invalid_type_error: "المبلغ مطلوب وأكبر من صفر" }).positive("المبلغ مطلوب وأكبر من صفر"),
  method: z.string().optional(),
  transactionRef: z.string().optional().nullable(),
});

const portalCsatSchema = z.object({
  score: z.coerce.number({ invalid_type_error: "التقييم يجب أن يكون بين 1 و 5" }).int().min(1, "التقييم يجب أن يكون بين 1 و 5").max(5, "التقييم يجب أن يكون بين 1 و 5"),
  comment: z.string().optional().nullable(),
});

const portalKbFeedbackSchema = z.object({
  helpful: z.union([z.boolean(), z.string()]).optional(),
});

const SECRET = config.jwtSecret;
if (!SECRET) throw new Error("JWT_SECRET is required for client portal");

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("portal:login"),
});

export interface PortalScope {
  accountId: number;
  clientId: number;
  companyId: number;
  type: string;
}

function signPortalToken(payload: { accountId: number; clientId: number; companyId: number }) {
  return jwt.sign({ ...payload, type: "client_portal" }, SECRET!, { expiresIn: "7d" });
}

function verifyPortalToken(token: string): PortalScope {
  return jwt.verify(token, SECRET!, { algorithms: ["HS256"] }) as any;
}

async function portalAuthMiddleware(req: Request & { portalScope?: PortalScope }, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "غير مصرح: لا يوجد توكن" });
    return;
  }
  const token = auth.slice(7);
  try {
    const payload = verifyPortalToken(token);
    if (payload.type !== "client_portal") {
      res.status(401).json({ error: "توكن غير صالح" });
      return;
    }
    const [account] = await rawQuery<PortalAccountStatusRow>(
      `SELECT id, "isActive" FROM client_portal_accounts WHERE id = $1 AND "clientId" = $2 AND "companyId" = $3`,
      [payload.accountId, payload.clientId, payload.companyId]
    );
    if (!account) {
      res.status(401).json({ error: "الحساب غير موجود" });
      return;
    }
    if (!account.isActive) {
      throw new ForbiddenError("الحساب موقوف، يرجى التواصل مع الدعم");
    }
    req.portalScope = payload;
    next();
  } catch (err) {
    if (isTypedError(err)) {
      res.status(err.status).json(err.toResponse());
      return;
    }
    res.status(401).json({ error: "توكن غير صالح أو منتهي" });
  }
}

function withPortalScope(
  handler: (req: Request & { portalScope: PortalScope }, res: Response) => Promise<void>
) {
  return async (req: Request & { portalScope?: PortalScope }, res: Response): Promise<void> => {
    if (!req.portalScope) {
      res.status(401).json({ error: "غير مصرح" });
      return;
    }
    return handler(req as Request & { portalScope: PortalScope }, res);
  };
}

type PortalScopedReq = Request & { portalScope: PortalScope };

interface PortalQueryOptions {
  clientColumn?: string;
  companyColumn?: string;
  extraParams?: any[];
  extraWhere?: string;
}

function buildPortalWhere(
  scope: PortalScope,
  opts: PortalQueryOptions = {}
): { where: string; params: unknown[] } {
  const cc = opts.clientColumn ?? '"clientId"';
  const mc = opts.companyColumn ?? '"companyId"';
  let where = `${cc} = $1 AND ${mc} = $2`;
  const params: unknown[] = [scope.clientId, scope.companyId, ...(opts.extraParams ?? [])];
  if (opts.extraWhere) where += ` AND ${opts.extraWhere}`;
  return { where, params };
}

function assertPortalScopeInParams(scope: PortalScope, params: unknown[]): void {
  const hasClientId = params.some(p => String(p) === String(scope.clientId));
  const hasCompanyId = params.some(p => String(p) === String(scope.companyId));
  if (!hasClientId || !hasCompanyId) {
    throw new Error(
      `[PortalSecurity] Portal query missing required scope isolation: ` +
      `clientId=${scope.clientId} companyId=${scope.companyId} not found in params=[${params.join(",")}]`
    );
  }
}

async function portalScopedQuery<T = any>(
  scope: PortalScope,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  assertPortalScopeInParams(scope, params);
  return rawQuery<T>(sql, params);
}

async function portalScopedExecute(
  scope: PortalScope,
  sql: string,
  params: unknown[] = []
) {
  assertPortalScopeInParams(scope, params);
  return rawExecute(sql, params);
}

router.post("/auth/login", loginLimiter, async (req, res) => {
  try {
    const body = zodParse(portalLoginSchema.safeParse(req.body));
    const { email: rawEmail, password } = body;
    const email = rawEmail.trim().toLowerCase();
    const [account] = await rawQuery<PortalAccountLoginRow>(
      `SELECT cpa.id, cpa."clientId", cpa."companyId", cpa."passwordHash", cpa."isActive", cpa."mustChangePassword",
              c.name AS "clientName", c.email AS "clientEmail", c.phone AS "clientPhone"
       FROM client_portal_accounts cpa
       JOIN clients c ON c.id = cpa."clientId"
       WHERE cpa.email = $1`,
      [email]
    );
    if (!account) {
      res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      return;
    }
    if (!account.isActive) {
      throw new ForbiddenError("الحساب موقوف، يرجى التواصل مع الدعم");
    }
    const valid = await verifyPassword(password, account.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
      return;
    }
    await rawExecute(
      `UPDATE client_portal_accounts SET "lastLoginAt" = NOW() WHERE id = $1`,
      [account.id]
    );
    emitEvent({ companyId: account.companyId, branchId: 0, userId: 0, action: "portal.login", entity: "client_portal_accounts", entityId: account.id, details: JSON.stringify({ clientId: account.clientId, email }) }).catch((e) => logger.error(e, "clientPortal background task failed"));
    createAuditLog({ companyId: account.companyId, userId: 0, action: "login", entity: "client_portal_accounts", entityId: account.id, after: { clientId: account.clientId, email } }).catch((e) => logger.error(e, "clientPortal background task failed"));
    const token = signPortalToken({
      accountId: account.id,
      clientId: account.clientId,
      companyId: account.companyId,
    });
    res.json({
      token,
      mustChangePassword: account.mustChangePassword,
      client: {
        id: account.clientId,
        name: account.clientName,
        email: account.clientEmail,
        phone: account.clientPhone,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Portal login error:");
  }
});

const protectedRouter = Router();
protectedRouter.use(portalAuthMiddleware);

protectedRouter.get("/me", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { where, params } = buildPortalWhere(scope, { clientColumn: "c.id", companyColumn: 'c."companyId"' });
    const [client] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT c.id, c.name, c.email, c.phone, c.classification, c.source, c.notes, c."createdAt",
              cpa.email AS "portalEmail", cpa."mustChangePassword", cpa."lastLoginAt"
       FROM clients c
       JOIN client_portal_accounts cpa ON cpa."clientId" = c.id AND cpa."companyId" = c."companyId"
       WHERE ${where} AND c."deletedAt" IS NULL`,
      params
    );
    if (!client) throw new NotFoundError("العميل غير موجود");

    // Compute which portal sections this customer has access to — works
    // like the employee role system: the client's "role" is implicit
    // from which tables actually reference their clientId.
    //
    // Each section is enabled only when real data exists, so a CRM-only
    // client never sees an empty "Projects" tab, and a sub-agent never
    // sees a phantom "Legal" tab. The portal SPA reads `availableSections`
    // from /me to render only the tabs relevant to this customer.
    const [counts] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT
         (SELECT COUNT(*) FROM invoices WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)::int AS invoices,
         (SELECT COUNT(*) FROM support_tickets WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)::int AS tickets,
         (SELECT COUNT(*) FROM projects WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)::int AS projects,
         (SELECT COUNT(*) FROM umrah_sub_agents WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)::int AS "umrahSubAgents",
         (SELECT COUNT(*) FROM tenants WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)::int AS "tenantLinks",
         (SELECT COUNT(*) FROM legal_cases WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)::int AS "legalCases"`,
      params
    );

    // Build the section list — order matches the SPA tab order. "core"
    // sections (overview + profile) are always present; everything else
    // is data-gated.
    const sections: string[] = ["overview", "profile"];
    if (Number(counts?.invoices ?? 0) > 0) sections.push("invoices");
    if (Number(counts?.tenantLinks ?? 0) > 0) sections.push("property");
    if (Number(counts?.legalCases ?? 0) > 0) sections.push("legal");
    if (Number(counts?.projects ?? 0) > 0) sections.push("projects");
    if (Number(counts?.umrahSubAgents ?? 0) > 0) sections.push("umrah");
    if (Number(counts?.tickets ?? 0) > 0) sections.push("support");
    sections.push("knowledge-base"); // always available — no scoping

    res.json({
      ...client,
      availableSections: sections,
      sectionCounts: {
        invoices: Number(counts?.invoices ?? 0),
        tickets: Number(counts?.tickets ?? 0),
        projects: Number(counts?.projects ?? 0),
        umrahSubAgents: Number(counts?.umrahSubAgents ?? 0),
        tenantLinks: Number(counts?.tenantLinks ?? 0),
        legalCases: Number(counts?.legalCases ?? 0),
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Portal me error:");
  }
}));

protectedRouter.get("/dashboard", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { where, params } = buildPortalWhere(scope);
    const [financials] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT
         COALESCE(SUM(total), 0) AS "totalInvoiced",
         COALESCE(SUM("paidAmount"), 0) AS "totalPaid",
         COALESCE(SUM(total) - SUM("paidAmount"), 0) AS "totalOutstanding",
         COUNT(*) AS "invoiceCount",
         COUNT(*) FILTER (WHERE status = 'paid') AS "paidCount",
         COUNT(*) FILTER (WHERE status = 'pending_approval') AS "pendingCount",
         COUNT(*) FILTER (WHERE status NOT IN ('paid','cancelled') AND "dueDate" < CURRENT_DATE) AS "overdueCount"
       FROM invoices
       WHERE ${where} AND "deletedAt" IS NULL`,
      params
    );
    const [ticketStats] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'open') AS "openCount",
         COUNT(*) FILTER (WHERE status = 'in_progress') AS "inProgressCount",
         COUNT(*) FILTER (WHERE status = 'closed') AS "closedCount"
       FROM support_tickets
       WHERE ${where} AND "deletedAt" IS NULL`,
      params
    );
    const recentInvoices = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, ref, status, total, "paidAmount", "dueDate", "createdAt"
       FROM invoices
       WHERE ${where} AND "deletedAt" IS NULL
       ORDER BY "createdAt" DESC LIMIT 5`,
      params
    );
    const recentTickets = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, ref, title, status, priority, category, "createdAt"
       FROM support_tickets
       WHERE ${where} AND "deletedAt" IS NULL
       ORDER BY "createdAt" DESC LIMIT 5`,
      params
    );
    res.json({
      financials: financials || {},
      ticketStats: ticketStats || {},
      recentInvoices,
      recentTickets,
    });
  } catch (err) {
    handleRouteError(err, res, "Portal dashboard error:");
  }
}));

protectedRouter.get("/invoices", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { status, page = "1", limit: lim = "20" } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(lim) || 20, 500);
    const offset = (pageNum - 1) * perPage;

    const extra: string[] = ["\"deletedAt\" IS NULL"];
    const extraParams: any[] = [];
    if (status) { extraParams.push(status); extra.push(`status = $${3 + extraParams.length - 1}`); }

    const { where, params } = buildPortalWhere(scope, {
      extraParams,
      extraWhere: extra.join(" AND "),
    });

    params.push(perPage, offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const invoices = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, ref, status, total, "paidAmount", "dueDate", "createdAt" AS "issueDate", notes, "createdAt"
       FROM invoices
       WHERE ${where}
       ORDER BY "createdAt" DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT COUNT(*) AS total FROM invoices WHERE ${where}`,
      countParams
    );
    res.json({ data: invoices, total: Number(countRow?.total ?? 0), page: pageNum, pageSize: perPage });
  } catch (err) {
    handleRouteError(err, res, "Portal invoices error:");
  }
}));

protectedRouter.get("/invoices/:id", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const id = parseId(req.params.id, "id");
    const [invoice] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT i.*,
              json_agg(json_build_object('description', il.description, 'qty', il.quantity, 'unitPrice', il."unitPrice", 'total', il."lineTotal") ORDER BY il.id) AS items
       FROM invoices i
       LEFT JOIN invoice_lines il ON il."invoiceId" = i.id
       WHERE i.id = $3 AND i."clientId" = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL
       GROUP BY i.id`,
      [scope.clientId, scope.companyId, id]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");
    res.json(invoice);
  } catch (err) {
    handleRouteError(err, res, "Portal invoice detail error:");
  }
}));

protectedRouter.get("/tickets", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { status, page = "1", limit: lim = "20" } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(lim) || 20, 500);
    const offset = (pageNum - 1) * perPage;

    const extraParams: any[] = [];
    const extraWhereParts: string[] = [];
    if (status) { extraParams.push(status); extraWhereParts.push(`status = $${3 + extraParams.length - 1}`); }

    const { where, params } = buildPortalWhere(scope, {
      extraParams,
      extraWhere: extraWhereParts.length ? extraWhereParts.join(" AND ") : undefined,
    });

    params.push(perPage, offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const tickets = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, ref, title, status, priority, category, "createdAt", "updatedAt"
       FROM support_tickets
       WHERE ${where} AND "deletedAt" IS NULL
       ORDER BY "createdAt" DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT COUNT(*) AS total FROM support_tickets WHERE ${where} AND "deletedAt" IS NULL`,
      countParams
    );
    res.json({ data: tickets, total: Number(countRow?.total ?? 0), page: pageNum, pageSize: perPage });
  } catch (err) {
    handleRouteError(err, res, "Portal tickets error:");
  }
}));

protectedRouter.get("/tickets/:id", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const id = parseId(req.params.id, "id");
    const [ticket] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, ref, title, description, status, priority, category, "createdAt", "updatedAt"
       FROM support_tickets
       WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [scope.clientId, scope.companyId, id]
    );
    if (!ticket) throw new NotFoundError("الطلب غير موجود");
    res.json(ticket);
  } catch (err) {
    handleRouteError(err, res, "Portal ticket detail error:");
  }
}));

protectedRouter.get("/tickets/:id/replies", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const id = parseId(req.params.id, "id");
    const [ticket] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [scope.clientId, scope.companyId, id]
    );
    if (!ticket) throw new NotFoundError("الطلب غير موجود");
    const replies = await rawQuery<TicketReplyPortalRow>(
      `SELECT tr.id, tr.message, CASE WHEN tr."authorId" IS NULL THEN 'client' ELSE 'staff' END AS "senderType", tr."authorName" AS "senderName", tr."createdAt"
       FROM ticket_replies tr
       WHERE tr."ticketId" = $1 AND ("isInternal" = FALSE OR "isInternal" IS NULL) AND tr."deletedAt" IS NULL
       ORDER BY tr."createdAt" ASC`,
      [id]
    );
    res.json({ data: replies });
  } catch (err) {
    handleRouteError(err, res, "Portal ticket replies error:");
  }
}));

protectedRouter.post("/tickets/:id/replies", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const id = parseId(req.params.id, "id");
    const body = zodParse(portalTicketReplySchema.safeParse(req.body));
    const message = body.message.trim();
    if (!message) {
      throw new ValidationError("نص الرد مطلوب");
    }
    const [ticket] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, status FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [scope.clientId, scope.companyId, id]
    );
    if (!ticket) throw new NotFoundError("الطلب غير موجود");
    if (ticket.status === "closed" || ticket.status === "resolved") {
      throw new ValidationError("لا يمكن الرد على طلب مغلق أو محلول");
    }
    await rawExecute(
      `INSERT INTO ticket_replies ("ticketId", message, "isInternal", "authorName")
       VALUES ($1, $2, false, 'العميل')`,
      [id, message]
    );
    const { supportEngine } = await import("../lib/engines/index.js");
    await supportEngine.markTicketInProgress(id, scope.companyId);
    createAuditLog({
      companyId: scope.companyId, userId: scope.accountId,
      action: "create", entity: "ticket_replies", entityId: id,
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.accountId,
      action: "portal.ticket_reply.created", entity: "ticket_replies", entityId: id,
      details: JSON.stringify({ ticketId: id, clientId: scope.clientId }),
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    res.status(201).json({ message: "تم إرسال الرد بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Portal ticket reply error:");
  }
}));

protectedRouter.post("/tickets", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { clientId, companyId } = scope;
    const body = zodParse(portalCreateTicketSchema.safeParse(req.body));
    const { title, description, category, invoiceId, contractId } = body;
    const priority = body.priority ?? "medium";
    assertPortalScopeInParams(scope, [clientId, companyId]);
    // Numbering center (Issue #1141) — portal tickets share the same
    // numbering scheme as internal tickets so a customer never sees a
    // different ref format than an agent.
    const issued = await issueNumber({
      companyId,
      branchId: null,
      moduleKey: "support",
      entityKey: "support_ticket",
      entityTable: "support_tickets",
      actorId: null,
      metadata: { source: "client_portal", clientId },
      expectedTiming: "on_draft",
    });
    const ref = issued.number;
    const { supportEngine } = await import("../lib/engines/index.js");
    const { insertId } = await supportEngine.createPortalTicket({
      companyId,
      clientId,
      ref,
      title,
      description: description ?? null,
      category: category ?? "general",
      priority,
      invoiceId: invoiceId || null,
      contractId: contractId || null,
    });
    const [ticket] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, ref, title, status, priority, category, "invoiceId", "contractId", "createdAt" FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [clientId, companyId, insertId]
    );
    createAuditLog({
      companyId, userId: scope.accountId,
      action: "create", entity: "support_tickets", entityId: insertId,
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    emitEvent({
      companyId, userId: scope.accountId,
      action: "portal.ticket.created", entity: "support_tickets", entityId: insertId,
      details: JSON.stringify({ ref, title, clientId }),
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    res.status(201).json(ticket);
  } catch (err) {
    handleRouteError(err, res, "Portal create ticket error:");
  }
}));

protectedRouter.patch("/profile/password", withPortalScope(async (req, res) => {
  try {
    const { accountId, clientId, companyId } = req.portalScope;
    const body = zodParse(portalChangePasswordSchema.safeParse(req.body));
    const { currentPassword, newPassword } = body;
    const [account] = await portalScopedQuery<Record<string, unknown>>(req.portalScope,
      `SELECT "passwordHash" FROM client_portal_accounts WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2`,
      [clientId, companyId, accountId]
    );
    if (!account) throw new NotFoundError("الحساب غير موجود");
    const valid = await verifyPassword(currentPassword, account.passwordHash as string);
    if (!valid) {
      res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
      return;
    }
    const newHash = await hashPassword(newPassword);
    await portalScopedExecute(req.portalScope,
      `UPDATE client_portal_accounts SET "passwordHash" = $1, "mustChangePassword" = false, "updatedAt" = NOW() WHERE id = $4 AND "clientId" = $2 AND "companyId" = $3`,
      [newHash, clientId, companyId, accountId]
    );
    createAuditLog({
      companyId, userId: accountId,
      action: "update", entity: "client_portal_accounts", entityId: accountId,
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    emitEvent({
      companyId, userId: accountId,
      action: "portal.password.changed", entity: "client_portal_accounts", entityId: accountId,
      details: JSON.stringify({ clientId }),
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    res.json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Portal change password error:");
  }
}));

protectedRouter.post("/invoices/:id/pay", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const id = parseId(req.params.id, "id");
    const body = zodParse(portalInvoicePaySchema.safeParse(req.body));
    const { amount, transactionRef } = body;
    const method = body.method ?? "online";
    const [invoice] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, ref, total, "paidAmount", status FROM invoices WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [scope.clientId, scope.companyId, id]
    );
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");
    if (invoice.status === 'paid') throw new ValidationError("الفاتورة مدفوعة بالكامل مسبقاً");

    const payAmt = Math.min(Number(amount), Number(invoice.total) - Number(invoice.paidAmount));
    // Internal correlation id between the portal payment record and
    // the finance receipt downstream — NOT a customer-visible doc
    // number. `transactionRef` from the gateway wins when supplied.
    const paymentRef = transactionRef || internalTechRef("PAY-PORTAL");

    const { financialEngine } = await import("../lib/engines/index.js");
    const { newPaid, newStatus } = await financialEngine.recordInvoicePayment({
      invoiceId: invoice.id as number,
      companyId: scope.companyId,
      clientId: scope.clientId,
      amount: payAmt,
      method,
      transactionRef: paymentRef,
      source: "portal",
    });

    createAuditLog({
      companyId: scope.companyId, userId: scope.accountId,
      action: "update", entity: "invoices", entityId: invoice.id as number,
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.accountId,
      action: "portal.invoice.paid", entity: "invoices", entityId: invoice.id as number,
      details: JSON.stringify({ paidAmount: payAmt, totalPaid: newPaid, status: newStatus, paymentRef, clientId: scope.clientId }),
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    res.json({
      invoiceId: invoice.id,
      invoiceRef: invoice.ref,
      paidAmount: payAmt,
      totalPaid: newPaid,
      status: newStatus,
      paymentRef,
    });
  } catch (err) {
    handleRouteError(err, res, "Portal invoice payment error:");
  }
}));

protectedRouter.post("/tickets/:id/csat", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const id = parseId(req.params.id, "id");
    const body = zodParse(portalCsatSchema.safeParse(req.body));
    const { score, comment } = body;
    const [ticket] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, "assigneeId", status FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [scope.clientId, scope.companyId, id]
    );
    if (!ticket) throw new NotFoundError("التذكرة غير موجودة");
    if (!['resolved', 'closed'].includes(ticket.status as string)) throw new ValidationError("لا يمكن تقييم تذكرة مفتوحة");
    await rawExecute(
      `INSERT INTO ticket_csat_ratings ("ticketId","companyId","assigneeId",score,comment) VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("ticketId") DO UPDATE SET score=$4, comment=$5, "updatedAt"=NOW()`,
      [id, scope.companyId, ticket.assigneeId, score, comment || null]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.accountId,
      action: "create", entity: "ticket_csat", entityId: id,
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    emitEvent({
      companyId: scope.companyId, userId: scope.accountId,
      action: "portal.csat.submitted", entity: "ticket_csat", entityId: id,
      details: JSON.stringify({ score, ticketId: id, clientId: scope.clientId }),
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    const [row] = await rawQuery<CsatRatingRow>(`SELECT * FROM ticket_csat_ratings WHERE "ticketId"=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.status(201).json(row || { ticketId: id, score, comment });
  } catch (err) {
    handleRouteError(err, res, "Portal CSAT error:");
  }
}));

protectedRouter.get("/kb", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { q, category } = req.query as Record<string, string | undefined>;
    const conditions = [`("companyId"=$1 OR "companyId" IS NULL)`, `status='published'`, `"deletedAt" IS NULL`];
    const params: unknown[] = [scope.companyId];
    if (category) { params.push(category); conditions.push(`category=$${params.length}`); }
    if (q) { params.push(`%${q}%`); conditions.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`); }
    const rows = await rawQuery<KbArticleListRow>(
      `SELECT id, title, category, tags, views, helpful, "notHelpful", "createdAt" FROM kb_articles WHERE ${conditions.join(' AND ')} ORDER BY views DESC LIMIT 50`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Portal KB list error:");
  }
}));

protectedRouter.get("/kb/:id", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<KbArticleRow>(
      `SELECT * FROM kb_articles WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND status='published' AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المقالة غير موجودة");
    await rawExecute(`UPDATE kb_articles SET views=COALESCE(views,0)+1 WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]).catch((e) => logger.error(e, "clientPortal background task failed"));
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Portal KB article error:");
  }
}));

protectedRouter.post("/kb/:id/feedback", withPortalScope(async (req, res) => {
  try {
    const id = parseId(req.params.id, "id");
    const body = zodParse(portalKbFeedbackSchema.safeParse(req.body));
    const { helpful } = body;
    const scope = req.portalScope!;
    if (helpful === true || helpful === 'true') {
      await rawExecute(`UPDATE kb_articles SET helpful=COALESCE(helpful,0)+1 WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    } else {
      await rawExecute(`UPDATE kb_articles SET "notHelpful"=COALESCE("notHelpful",0)+1 WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    }
    createAuditLog({
      companyId: req.portalScope!.companyId, userId: req.portalScope!.accountId,
      action: "create", entity: "kb_feedback", entityId: id,
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    emitEvent({
      companyId: req.portalScope!.companyId, userId: req.portalScope!.accountId,
      action: "portal.kb_feedback.submitted", entity: "kb_feedback", entityId: id,
      details: JSON.stringify({ helpful, articleId: id }),
    }).catch((e) => logger.error(e, "clientPortal background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Portal KB feedback error:");
  }
}));

// ─────────────────────────────────────────────────────────────────────────────
// Customer-type-aware sections — each surface is data-gated by /me's
// availableSections. The SPA only renders the tab when the section is
// listed there, so the endpoint is a safe no-op for customers without
// the data type (returns an empty list rather than 404).
//
// Each section follows the same shape as /invoices + /tickets: list
// endpoint + per-row detail. Tenant isolation is enforced via
// portalScopedQuery just like the existing handlers.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Projects (for contracting / project-based clients) ─────────────────────
protectedRouter.get("/projects", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { where, params } = buildPortalWhere(scope);
    const rows = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, name, status, "startDate", "endDate", budget, progress, "createdAt"
         FROM projects
        WHERE ${where} AND "deletedAt" IS NULL
        ORDER BY "createdAt" DESC LIMIT 100`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Portal projects error:");
  }
}));

protectedRouter.get("/projects/:id", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const id = parseId(req.params.id, "id");
    const { where, params } = buildPortalWhere(scope);
    const [project] = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, name, description, status, "startDate", "endDate", budget,
              progress, "managerName", "createdAt", "updatedAt"
         FROM projects
        WHERE id = $${params.length + 1} AND ${where} AND "deletedAt" IS NULL`,
      [...params, id]
    );
    if (!project) throw new NotFoundError("المشروع غير موجود");
    res.json(project);
  } catch (err) {
    handleRouteError(err, res, "Portal project detail error:");
  }
}));

// ─── Umrah sub-agent dashboard (for sub-agents linked via clientId) ─────────
protectedRouter.get("/umrah/invoices", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    // umrah_sales_invoices links to sub-agents, not directly to clients —
    // resolve through the sub-agent → client linkage.
    const rows = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT si.id, si.ref, si."invoiceDate", si.subtotal, si."vatAmount", si.total,
              si."paidAmount", si.status, si."dueDate", si."pilgrimCount",
              sa.name AS "subAgentName"
         FROM umrah_sales_invoices si
         JOIN umrah_sub_agents sa
           ON sa.id = si."subAgentId"
          AND sa."companyId" = si."companyId"
          AND sa."deletedAt" IS NULL
        WHERE sa."clientId" = $1 AND si."companyId" = $2 AND si."deletedAt" IS NULL
        ORDER BY si."invoiceDate" DESC LIMIT 100`,
      [scope.clientId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Portal umrah invoices error:");
  }
}));

protectedRouter.get("/umrah/groups", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const rows = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT g.id, g."nuskGroupNumber", g.name, g."mutamerCount",
              g."programDuration", g.status, g."nuskInvoiceNumber", g."createdAt"
         FROM umrah_groups g
         JOIN umrah_sub_agents sa
           ON sa.id = g."subAgentId"
          AND sa."companyId" = g."companyId"
          AND sa."deletedAt" IS NULL
        WHERE sa."clientId" = $1 AND g."companyId" = $2 AND g."deletedAt" IS NULL
        ORDER BY g."createdAt" DESC LIMIT 100`,
      [scope.clientId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Portal umrah groups error:");
  }
}));

protectedRouter.get("/umrah/payments", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const rows = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT p.id, p.ref, p."paymentDate", p.amount, p.currency, p."sarAmount",
              p.method, p."externalReference"
         FROM umrah_payments p
         JOIN umrah_sub_agents sa
           ON sa.id = p."subAgentId"
          AND sa."companyId" = p."companyId"
          AND sa."deletedAt" IS NULL
        WHERE sa."clientId" = $1 AND p."companyId" = $2 AND p."deletedAt" IS NULL
        ORDER BY p."paymentDate" DESC LIMIT 100`,
      [scope.clientId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Portal umrah payments error:");
  }
}));

// ─── Property tenants (gated by tenants.clientId from migration 230) ────────
// A single portal account (bound to clients.id) may map to multiple
// tenant records — e.g. a corporate client leasing several units. All
// queries scope by `t.clientId = me AND t.companyId = me` so a tenant
// record from another company can't leak even if ids collide.

protectedRouter.get("/property/contracts", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const rows = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT rc.id, rc."contractNumber", rc."ejarNumber", rc."contractType",
              rc."startDate", rc."endDate", rc."monthlyRent", rc."yearlyRent",
              rc."depositAmount", rc.status, rc."paymentFrequency",
              rc."autoRenewal", rc."renewalNoticeDays",
              u."unitNumber", u."buildingName", u.address AS "unitAddress"
         FROM rental_contracts rc
         JOIN tenants t
           ON t.id = rc."tenantId"
          AND t."companyId" = rc."companyId"
          AND t."deletedAt" IS NULL
         LEFT JOIN property_units u ON u.id = rc."unitId" AND u."companyId" = rc."companyId"
        WHERE t."clientId" = $1 AND rc."companyId" = $2 AND rc."deletedAt" IS NULL
        ORDER BY rc."startDate" DESC LIMIT 100`,
      [scope.clientId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Portal property contracts error:");
  }
}));

protectedRouter.get("/property/rent-payments", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    // rent_payments has no companyId column — same defensive pattern as
    // the Property Owner Statement (PR #5a2c1aed). Gate via rental_contracts.
    const rows = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT rp.id, rp."contractId", rp."dueDate", rp.amount, rp."paidAmount",
              rp."paidDate", rp.method, rp.status, rp."receiptNumber",
              rp.amount - rp."paidAmount" AS "outstanding",
              (CURRENT_DATE - rp."dueDate") AS "daysPastDue"
         FROM rent_payments rp
         JOIN rental_contracts rc ON rc.id = rp."contractId" AND rc."deletedAt" IS NULL
         JOIN tenants t
           ON t.id = rc."tenantId"
          AND t."companyId" = rc."companyId"
          AND t."deletedAt" IS NULL
        WHERE t."clientId" = $1 AND rc."companyId" = $2
        ORDER BY rp."dueDate" DESC LIMIT 200`,
      [scope.clientId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Portal rent payments error:");
  }
}));

protectedRouter.get("/property/maintenance-requests", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const rows = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT mr.id, mr.category, mr.description, mr.priority, mr.status,
              mr."estimatedCost", mr."actualCost", mr."completedAt",
              mr."createdAt",
              u."unitNumber", u."buildingName"
         FROM maintenance_requests mr
         JOIN rental_contracts rc ON rc.id = mr."contractId" AND rc."deletedAt" IS NULL
         JOIN tenants t
           ON t.id = rc."tenantId"
          AND t."companyId" = rc."companyId"
          AND t."deletedAt" IS NULL
         LEFT JOIN property_units u ON u.id = mr."unitId" AND u."companyId" = mr."companyId"
        WHERE t."clientId" = $1 AND mr."companyId" = $2
        ORDER BY mr."createdAt" DESC LIMIT 100`,
      [scope.clientId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Portal maintenance requests error:");
  }
}));

// ─── Legal cases (gated by legal_cases.clientId from migration 230) ─────────
// A client portal user may be a plaintiff or defendant in cases the firm
// represents. legal_cases.clientId is the new link added by migration 230.

protectedRouter.get("/legal/cases", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { where, params } = buildPortalWhere(scope);
    const rows = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT id, "caseNumber", title, "caseType", court, "filingDate",
              "opposingParty", "lawyerName", status, priority,
              "financialRisk", "riskLevel", "createdAt"
         FROM legal_cases
        WHERE ${where} AND "deletedAt" IS NULL
        ORDER BY "createdAt" DESC LIMIT 100`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Portal legal cases error:");
  }
}));

protectedRouter.get("/legal/sessions/upcoming", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const rows = await portalScopedQuery<Record<string, unknown>>(scope,
      `SELECT ls.id, ls."sessionDate", ls.location, ls.judge,
              ls.result, ls."nextSessionDate", ls.notes,
              c.id AS "caseId", c."caseNumber", c.title AS "caseTitle"
         FROM legal_sessions ls
         JOIN legal_cases c ON c.id = ls."caseId" AND c."deletedAt" IS NULL
        WHERE c."clientId" = $1 AND c."companyId" = $2
              AND ls."deletedAt" IS NULL
              AND ls."sessionDate" >= CURRENT_DATE - INTERVAL '30 days'
        ORDER BY ls."sessionDate" ASC LIMIT 100`,
      [scope.clientId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Portal legal sessions error:");
  }
}));

router.use("/", protectedRouter);

export { portalAuthMiddleware };
export default router;
