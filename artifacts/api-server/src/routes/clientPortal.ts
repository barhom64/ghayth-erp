import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { handleRouteError } from "../lib/errorHandler.js";
import type { Request, Response, NextFunction } from "express";

const router = Router();

const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error("JWT_SECRET is required for client portal");

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة" },
  validate: { ip: false, trustProxy: false },
});

export interface PortalScope {
  accountId: number;
  clientId: number;
  companyId: number;
  type: string;
}

// Portal tokens are short-lived (1 hour) to bound the blast radius of
// a leaked token from the browser. If the portal needs persistent
// sessions, introduce a refresh-token flow analogous to the main app.
function signPortalToken(payload: { accountId: number; clientId: number; companyId: number }) {
  return jwt.sign({ ...payload, type: "client_portal" }, SECRET!, { expiresIn: "1h" });
}

function verifyPortalToken(token: string): PortalScope {
  return jwt.verify(token, SECRET!) as any;
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
    const [account] = await rawQuery<any>(
      `SELECT id, "isActive" FROM client_portal_accounts WHERE id = $1 AND "clientId" = $2 AND "companyId" = $3`,
      [payload.accountId, payload.clientId, payload.companyId]
    );
    if (!account) {
      res.status(401).json({ error: "الحساب غير موجود" });
      return;
    }
    if (!account.isActive) {
      res.status(403).json({ error: "الحساب موقوف، يرجى التواصل مع الدعم" });
      return;
    }
    req.portalScope = payload;
    next();
  } catch {
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
): { where: string; params: any[] } {
  const cc = opts.clientColumn ?? '"clientId"';
  const mc = opts.companyColumn ?? '"companyId"';
  let where = `${cc} = $1 AND ${mc} = $2`;
  const params: any[] = [scope.clientId, scope.companyId, ...(opts.extraParams ?? [])];
  if (opts.extraWhere) where += ` AND ${opts.extraWhere}`;
  return { where, params };
}

function assertPortalScopeInParams(scope: PortalScope, params: any[]): void {
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
  params: any[] = []
): Promise<T[]> {
  assertPortalScopeInParams(scope, params);
  return rawQuery<T>(sql, params);
}

async function portalScopedExecute(
  scope: PortalScope,
  sql: string,
  params: any[] = []
) {
  assertPortalScopeInParams(scope, params);
  return rawExecute(sql, params);
}

router.post("/auth/login", loginLimiter, async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body as { email: string; password: string };
    if (!rawEmail || !password) {
      res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
      return;
    }
    const email = rawEmail.trim().toLowerCase();
    const [account] = await rawQuery<any>(
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
      res.status(403).json({ error: "الحساب موقوف، يرجى التواصل مع الدعم" });
      return;
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
    const [client] = await portalScopedQuery<any>(scope,
      `SELECT c.id, c.name, c.email, c.phone, c.classification, c.source, c.notes, c."createdAt",
              cpa.email AS "portalEmail", cpa."mustChangePassword", cpa."lastLoginAt"
       FROM clients c
       JOIN client_portal_accounts cpa ON cpa."clientId" = c.id AND cpa."companyId" = c."companyId"
       WHERE ${where}`,
      params
    );
    if (!client) {
      res.status(404).json({ error: "العميل غير موجود" });
      return;
    }
    res.json(client);
  } catch (err) {
    handleRouteError(err, res, "Portal me error:");
  }
}));

protectedRouter.get("/dashboard", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { where, params } = buildPortalWhere(scope);
    const [financials] = await portalScopedQuery<any>(scope,
      `SELECT
         COALESCE(SUM(total), 0) AS "totalInvoiced",
         COALESCE(SUM("paidAmount"), 0) AS "totalPaid",
         COALESCE(SUM(total) - SUM("paidAmount"), 0) AS "totalOutstanding",
         COUNT(*) AS "invoiceCount",
         COUNT(*) FILTER (WHERE status = 'paid') AS "paidCount",
         COUNT(*) FILTER (WHERE status = 'pending') AS "pendingCount",
         COUNT(*) FILTER (WHERE status NOT IN ('paid','cancelled') AND "dueDate" < CURRENT_DATE) AS "overdueCount"
       FROM invoices
       WHERE ${where} AND "deletedAt" IS NULL`,
      params
    );
    const [ticketStats] = await portalScopedQuery<any>(scope,
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'open') AS "openCount",
         COUNT(*) FILTER (WHERE status = 'in_progress') AS "inProgressCount",
         COUNT(*) FILTER (WHERE status = 'closed') AS "closedCount"
       FROM support_tickets
       WHERE ${where}`,
      params
    );
    const recentInvoices = await portalScopedQuery<any>(scope,
      `SELECT id, ref, status, total, "paidAmount", "dueDate", "createdAt"
       FROM invoices
       WHERE ${where} AND "deletedAt" IS NULL
       ORDER BY "createdAt" DESC LIMIT 5`,
      params
    );
    const recentTickets = await portalScopedQuery<any>(scope,
      `SELECT id, ref, title, status, priority, category, "createdAt"
       FROM support_tickets
       WHERE ${where}
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
    const { status, page = "1", limit: lim = "20" } = req.query as any;
    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);

    const extra: string[] = ["\"deletedAt\" IS NULL"];
    const extraParams: any[] = [];
    if (status) { extraParams.push(status); extra.push(`status = $${3 + extraParams.length - 1}`); }

    const { where, params } = buildPortalWhere(scope, {
      extraParams,
      extraWhere: extra.join(" AND "),
    });

    params.push(Number(lim), offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const invoices = await portalScopedQuery<any>(scope,
      `SELECT id, ref, status, total, "paidAmount", "dueDate", "issueDate", notes, "createdAt"
       FROM invoices
       WHERE ${where}
       ORDER BY "createdAt" DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await portalScopedQuery<any>(scope,
      `SELECT COUNT(*) AS total FROM invoices WHERE ${where}`,
      countParams
    );
    res.json({ data: invoices, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) });
  } catch (err) {
    handleRouteError(err, res, "Portal invoices error:");
  }
}));

protectedRouter.get("/invoices/:id", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { id } = req.params;
    const [invoice] = await portalScopedQuery<any>(scope,
      `SELECT i.*, 
              json_agg(json_build_object('description', ii.description, 'qty', ii.qty, 'unitPrice', ii."unitPrice", 'total', ii.total) ORDER BY ii.id) AS items
       FROM invoices i
       LEFT JOIN invoice_items ii ON ii."invoiceId" = i.id
       WHERE i.id = $3 AND i."clientId" = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL
       GROUP BY i.id`,
      [scope.clientId, scope.companyId, Number(id)]
    );
    if (!invoice) {
      res.status(404).json({ error: "الفاتورة غير موجودة" });
      return;
    }
    res.json(invoice);
  } catch (err) {
    handleRouteError(err, res, "Portal invoice detail error:");
  }
}));

protectedRouter.get("/tickets", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { status, page = "1", limit: lim = "20" } = req.query as any;
    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);

    const extraParams: any[] = [];
    const extraWhereParts: string[] = [];
    if (status) { extraParams.push(status); extraWhereParts.push(`status = $${3 + extraParams.length - 1}`); }

    const { where, params } = buildPortalWhere(scope, {
      extraParams,
      extraWhere: extraWhereParts.length ? extraWhereParts.join(" AND ") : undefined,
    });

    params.push(Number(lim), offset);
    const limitParam = params.length - 1;
    const offsetParam = params.length;

    const tickets = await portalScopedQuery<any>(scope,
      `SELECT id, ref, title, status, priority, category, "createdAt", "updatedAt"
       FROM support_tickets
       WHERE ${where}
       ORDER BY "createdAt" DESC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );
    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await portalScopedQuery<any>(scope,
      `SELECT COUNT(*) AS total FROM support_tickets WHERE ${where}`,
      countParams
    );
    res.json({ data: tickets, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) });
  } catch (err) {
    handleRouteError(err, res, "Portal tickets error:");
  }
}));

protectedRouter.get("/tickets/:id", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { id } = req.params;
    const [ticket] = await portalScopedQuery<any>(scope,
      `SELECT id, ref, title, description, status, priority, category, "createdAt", "updatedAt"
       FROM support_tickets
       WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2`,
      [scope.clientId, scope.companyId, Number(id)]
    );
    if (!ticket) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    res.json(ticket);
  } catch (err) {
    handleRouteError(err, res, "Portal ticket detail error:");
  }
}));

protectedRouter.get("/tickets/:id/replies", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { id } = req.params;
    const [ticket] = await portalScopedQuery<any>(scope,
      `SELECT id FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2`,
      [scope.clientId, scope.companyId, Number(id)]
    );
    if (!ticket) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    const replies = await rawQuery<any>(
      `SELECT tr.id, tr.message, tr."senderType", tr."senderName", tr."createdAt"
       FROM ticket_replies tr
       WHERE tr."ticketId" = $1
       ORDER BY tr."createdAt" ASC`,
      [Number(id)]
    );
    res.json({ data: replies });
  } catch (err) {
    handleRouteError(err, res, "Portal ticket replies error:");
  }
}));

protectedRouter.post("/tickets/:id/replies", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { id } = req.params;
    const { message } = req.body as any;
    if (!message?.trim()) {
      res.status(400).json({ error: "نص الرد مطلوب" });
      return;
    }
    const [ticket] = await portalScopedQuery<any>(scope,
      `SELECT id, status FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2`,
      [scope.clientId, scope.companyId, Number(id)]
    );
    if (!ticket) {
      res.status(404).json({ error: "الطلب غير موجود" });
      return;
    }
    if (ticket.status === "closed" || ticket.status === "resolved") {
      res.status(400).json({ error: "لا يمكن الرد على طلب مغلق أو محلول" });
      return;
    }
    await rawExecute(
      `INSERT INTO ticket_replies ("ticketId", message, "senderType", "senderName")
       VALUES ($1, $2, 'client', 'العميل')`,
      [Number(id), message.trim()]
    );
    await rawExecute(
      `UPDATE support_tickets SET status = 'in_progress', "updatedAt" = NOW() WHERE id = $1 AND status = 'open'`,
      [Number(id)]
    );
    res.status(201).json({ message: "تم إرسال الرد بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Portal ticket reply error:");
  }
}));

protectedRouter.post("/tickets", withPortalScope(async (req, res) => {
  try {
    const scope = req.portalScope;
    const { clientId, companyId } = scope;
    const { title, description, category, priority = "medium" } = req.body as any;
    if (!title) {
      res.status(400).json({ error: "عنوان الطلب مطلوب" });
      return;
    }
    const ref = `TKT-${Date.now().toString(36).toUpperCase()}`;
    const { insertId } = await portalScopedExecute(scope,
      `INSERT INTO support_tickets (ref, title, description, category, priority, status, "clientId", "companyId")
       VALUES ($1, $2, $3, $4, $5, 'open', $6, $7)`,
      [ref, title, description ?? null, category ?? "general", priority, clientId, companyId]
    );
    const [ticket] = await portalScopedQuery<any>(scope,
      `SELECT id, ref, title, status, priority, category, "createdAt" FROM support_tickets WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2`,
      [clientId, companyId, insertId]
    );
    res.status(201).json(ticket);
  } catch (err) {
    handleRouteError(err, res, "Portal create ticket error:");
  }
}));

protectedRouter.patch("/profile/password", withPortalScope(async (req, res) => {
  try {
    const { accountId, clientId, companyId } = req.portalScope;
    const { currentPassword, newPassword } = req.body as any;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "كلمة المرور الحالية والجديدة مطلوبتان" });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: "كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل" });
      return;
    }
    const [account] = await portalScopedQuery<any>(req.portalScope,
      `SELECT "passwordHash" FROM client_portal_accounts WHERE id = $3 AND "clientId" = $1 AND "companyId" = $2`,
      [clientId, companyId, accountId]
    );
    if (!account) {
      res.status(404).json({ error: "الحساب غير موجود" });
      return;
    }
    const valid = await verifyPassword(currentPassword, account.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "كلمة المرور الحالية غير صحيحة" });
      return;
    }
    const newHash = await hashPassword(newPassword);
    await portalScopedExecute(req.portalScope,
      `UPDATE client_portal_accounts SET "passwordHash" = $1, "mustChangePassword" = false, "updatedAt" = NOW() WHERE id = $4 AND "clientId" = $2 AND "companyId" = $3`,
      [newHash, clientId, companyId, accountId]
    );
    res.json({ message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Portal change password error:");
  }
}));

router.use("/", protectedRouter);

export { portalAuthMiddleware };
export default router;
