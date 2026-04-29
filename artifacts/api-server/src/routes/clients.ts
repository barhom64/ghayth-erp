import { handleRouteError, ValidationError, NotFoundError, ConflictError } from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { createAuditLog, emitEvent, generateTimeRef } from "../lib/businessHelpers.js";
import { createSubsidiaryAccountsForEntity } from "./accounting-engine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { hashPassword } from "../lib/auth.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { logger } from "../lib/logger.js";

const createClientSchema = z.object({
  name: z.string().min(1, "اسم العميل مطلوب"),
  phone: z.string().optional().nullable(),
  email: z.string().email("البريد الإلكتروني غير صالح").optional().nullable(),
  classification: z.enum(["regular", "vip", "prospect", "wholesale", "new", "inactive"]).optional().default("regular"),
  source: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  type: z.enum(["individual", "company", "government"]).optional().default("individual"),
  nationality: z.string().optional().nullable(),
  language: z.enum(["ar", "en"]).optional().default("ar"),
});

const router = Router();

router.get("/", requirePermission("crm:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search = "", classification = "", page = "1", limit: lim = "20" } = req.query as any;
    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);

    const filters = parseScopeFilters(req);
    if (search) { filters.search = String(search); filters.searchColumns = ['name', 'email', 'phone']; }

    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { disableBranchScope: true });
    let where = baseWhere + ` AND "deletedAt" IS NULL`;
    let paramIdx = nextParamIndex;

    if (classification) {
      where += ` AND classification = $${paramIdx}`;
      params.push(classification);
      paramIdx++;
    }

    params.push(Number(lim));
    const limitParam = paramIdx++;
    params.push(offset);
    const offsetParam = paramIdx++;

    const clients = await rawQuery<any>(
      `SELECT id, name, phone, email, classification, source,
              "totalRevenue", "isBlacklisted", "createdAt"
       FROM clients
       WHERE ${where}
       ORDER BY name ASC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM clients WHERE ${where}`,
      countParams
    );

    res.json({ data: clients, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) });
  } catch (err) {
    handleRouteError(err, res, "List clients error:");
  }
});

router.post("/", requirePermission("crm:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createClientSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const {
      name,
      phone,
      email,
      classification,
      source,
      notes,
      type,
      nationality,
      language,
    } = parsed.data;

    // Pre-check: reject duplicate email within same company
    if (email) {
      const [emailExists] = await rawQuery<any>(
        `SELECT id FROM clients WHERE email = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
        [email, scope.companyId]
      );
      if (emailExists) throw new ConflictError("البريد الإلكتروني مستخدم لعميل آخر", { field: "email", fix: "استخدم بريداً إلكترونياً مختلفاً أو ابحث عن العميل الموجود" });
    }

    // Pre-check: reject duplicate phone within same company
    if (phone) {
      const [phoneExists] = await rawQuery<any>(
        `SELECT id FROM clients WHERE phone = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
        [phone, scope.companyId]
      );
      if (phoneExists) throw new ConflictError("رقم الهاتف مستخدم لعميل آخر", { field: "phone", fix: "استخدم رقم هاتف مختلفاً أو ابحث عن العميل الموجود" });
    }

    const attachments = (req.body as any).attachments ?? null;
    const { insertId } = await rawExecute(
      `INSERT INTO clients (name, phone, email, classification, source, notes, "type", nationality, language, "companyId", "isBlacklisted", attachments)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11)`,
      [String(name).trim(), phone ?? null, email ?? null, classification, source ?? null, notes ?? null, type, nationality ?? null, language, scope.companyId, attachments ? JSON.stringify(attachments) : null]
    );

    const [client] = await rawQuery<any>(
      `SELECT * FROM clients WHERE id = $1 AND "deletedAt" IS NULL`,
      [insertId]
    );
    if (!client) throw new NotFoundError("فشل في استرجاع العميل");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "clients",
      entityId: insertId,
      after: { name, phone, email, classification, source },
    }).catch((e) => logger.error(e, "clients background task failed"));

    createSubsidiaryAccountsForEntity(scope.companyId, "client", insertId, name).catch((e) => logger.error(e, "clients background task failed"));

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.created", entity: "clients", entityId: insertId, details: JSON.stringify({ name, phone, email, classification, source }) }).catch((e) => logger.error(e, "clients background task failed"));

    res.status(201).json(client);
  } catch (err) {
    handleRouteError(err, res, "Create client error:");
  }
});

router.get("/:id", requirePermission("crm:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;

    const [client] = await rawQuery<any>(
      `SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );

    if (!client) {
      throw new NotFoundError("العميل غير موجود");
    }

    const [invoices, opportunities, tickets, projects, financials, conversations, timeline] = await Promise.all([
      rawQuery<any>(
        `SELECT id, ref, status, total, "paidAmount", "dueDate", "createdAt"
         FROM invoices
         WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [Number(id), scope.companyId]
      ),
      rawQuery<any>(
        `SELECT id, title, stage, value, probability, "expectedCloseDate", status
         FROM crm_opportunities
         WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [Number(id), scope.companyId]
      ),
      rawQuery<any>(
        `SELECT id, ref, title, status, priority, category, "createdAt"
         FROM support_tickets
         WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [Number(id), scope.companyId]
      ),
      rawQuery<any>(
        `SELECT id, name, status, budget, progress, "startDate", "endDate"
         FROM projects
         WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [Number(id), scope.companyId]
      ),
      rawQuery<any>(
        `SELECT
           COALESCE(SUM(total), 0) AS "totalInvoiced",
           COALESCE(SUM("paidAmount"), 0) AS "totalPaid",
           COALESCE(SUM(total) - SUM("paidAmount"), 0) AS "totalOutstanding",
           COUNT(*) AS "invoiceCount",
           COUNT(*) FILTER (WHERE status = 'paid') AS "paidCount",
           COUNT(*) FILTER (WHERE status NOT IN ('paid','cancelled') AND "dueDate" < CURRENT_DATE) AS "overdueCount"
         FROM invoices
         WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [Number(id), scope.companyId]
      ),
      rawQuery<any>(
        `SELECT wq.id, wq.phone, wq.message, wq.status, wq."createdAt", 'whatsapp' AS channel
         FROM whatsapp_queue wq
         WHERE wq."clientId" = $1 AND wq."companyId" = $2
         UNION ALL
         SELECT sq.id, sq."recipientPhone" AS phone, sq.message, sq.status, sq."createdAt", 'sms' AS channel
         FROM sms_queue sq
         WHERE sq."clientId" = $1 AND sq."companyId" = $2
         ORDER BY "createdAt" DESC LIMIT 20`,
        [Number(id), scope.companyId]
      ).catch(() => []),
      rawQuery<any>(
        `(SELECT 'invoice' AS type, ref AS ref, status, total::text AS detail, "createdAt"
          FROM invoices WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)
         UNION ALL
         (SELECT 'opportunity' AS type, title AS ref, stage AS status, value::text AS detail, "createdAt"
          FROM crm_opportunities WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)
         UNION ALL
         (SELECT 'ticket' AS type, ref, status, priority AS detail, "createdAt"
          FROM support_tickets WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)
         UNION ALL
         (SELECT 'project' AS type, name AS ref, status, progress::text AS detail, "createdAt"
          FROM projects WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)
         ORDER BY "createdAt" DESC LIMIT 50`,
        [Number(id), scope.companyId]
      ),
    ]);

    const activeServices = {
      activeContracts: await rawQuery<any>(
        `SELECT id, title, "endDate" FROM legal_contracts
         WHERE "companyId" = $2 AND status = 'active'
           AND ("partyName" = $3 OR id IN (
             SELECT "contractId" FROM rental_contracts WHERE "tenantName" = $3 AND "companyId" = $2 AND "deletedAt" IS NULL
           ))
         LIMIT 10`,
        [Number(id), scope.companyId, client.name]
      ).catch(() => []),
      activeProjects: projects.filter((p: any) => p.status === 'active'),
      openTickets: tickets.filter((t: any) => t.status === 'open' || t.status === 'in_progress'),
    };

    res.json({
      ...client,
      invoices,
      opportunities,
      tickets,
      projects,
      financials: financials[0] || {},
      conversations,
      timeline,
      activeServices,
    });
  } catch (err) {
    handleRouteError(err, res, "Get client error:");
  }
});

router.patch("/:id", requirePermission("crm:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const [existing] = await rawQuery<any>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!existing) { throw new NotFoundError("العميل غير موجود"); }

    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name = $${params.length}`); }
    if (b.phone !== undefined) { params.push(b.phone); sets.push(`phone = $${params.length}`); }
    if (b.email !== undefined) { params.push(b.email); sets.push(`email = $${params.length}`); }
    if (b.classification !== undefined) { params.push(b.classification); sets.push(`classification = $${params.length}`); }
    if (b.source !== undefined) { params.push(b.source); sets.push(`source = $${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes = $${params.length}`); }
    if (b.isBlacklisted !== undefined) { params.push(b.isBlacklisted); sets.push(`"isBlacklisted" = $${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(Number(id), scope.companyId);
    await rawExecute(`UPDATE clients SET ${sets.join(",")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length}`, params);
    const [updated] = await rawQuery<any>(`SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [Number(id), scope.companyId]);
    if (!updated) throw new NotFoundError("العميل غير موجود");

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.updated", entity: "clients", entityId: Number(id), details: JSON.stringify({ name: b.name, phone: b.phone, email: b.email, classification: b.classification }) }).catch((e) => logger.error(e, "clients background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "update", entity: "clients", entityId: Number(id), after: { name: b.name, phone: b.phone, email: b.email, classification: b.classification } }).catch((e) => logger.error(e, "clients background task failed"));

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "Update client error:");
  }
});

router.post("/auto-create", requirePermission("crm:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { phone, name, source = "auto" } = req.body as any;
    if (!phone) {
      throw new ValidationError("رقم الهاتف مطلوب");
    }

    const existing = await rawQuery<any>(
      `SELECT * FROM clients WHERE phone = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [phone, scope.companyId]
    );

    if (existing.length > 0) {
      res.json({ ...existing[0], isNew: false });
      return;
    }

    const clientName = name || `عميل ${phone.slice(-4)}`;
    const code = generateTimeRef("CLT");

    const { insertId } = await rawExecute(
      `INSERT INTO clients (name, phone, classification, source, code, "companyId", "isBlacklisted")
       VALUES ($1, $2, 'prospect', $3, $4, $5, false)`,
      [clientName, phone, source, code, scope.companyId]
    );

    const [newClient] = await rawQuery<any>(`SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);
    if (!newClient) throw new NotFoundError("فشل في استرجاع العميل");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "auto_create",
      entity: "clients",
      entityId: insertId,
      after: { name: clientName, phone, source, classification: "prospect", code },
    }).catch((e) => logger.error(e, "clients background task failed"));

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.created", entity: "clients", entityId: insertId, details: JSON.stringify({ name: clientName, phone, source }) }).catch((e) => logger.error(e, "clients background task failed"));

    res.status(201).json({ ...newClient, isNew: true });
  } catch (err) {
    handleRouteError(err, res, "Auto-create client error:");
  }
});

router.delete("/:id", requirePermission("crm:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const [existing] = await rawQuery<any>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!existing) { throw new NotFoundError("العميل غير موجود"); }
    await rawExecute(`UPDATE clients SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [Number(id), scope.companyId]);

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.deleted", entity: "clients", entityId: Number(id), details: JSON.stringify({ id: Number(id) }) }).catch((e) => logger.error(e, "clients background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "delete", entity: "clients", entityId: Number(id) }).catch((e) => logger.error(e, "clients background task failed"));

    res.json({ message: "تم حذف العميل بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Delete client error:");
  }
});

router.get("/:id/portal-account", requirePermission("crm:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const [existing] = await rawQuery<any>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!existing) { throw new NotFoundError("العميل غير موجود"); }
    const [account] = await rawQuery<any>(
      `SELECT id, email, "isActive", "mustChangePassword", "lastLoginAt", "createdAt"
       FROM client_portal_accounts
       WHERE "clientId" = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    res.json({ account: account || null });
  } catch (err) {
    handleRouteError(err, res, "Get portal account error:");
  }
});

router.post("/:id/portal-account", requirePermission("crm:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const { email: rawEmail, password } = req.body as { email: string; password: string };

    if (!rawEmail || !password) {
      throw new ValidationError("البريد الإلكتروني وكلمة المرور مطلوبان");
    }
    if (password.length < 6) {
      throw new ValidationError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    }
    const email = rawEmail.trim().toLowerCase();

    const [client] = await rawQuery<any>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [Number(id), scope.companyId]
    );
    if (!client) { throw new NotFoundError("العميل غير موجود"); }

    const [existing] = await rawQuery<any>(
      `SELECT id FROM client_portal_accounts WHERE "clientId" = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (existing) {
      throw new ConflictError("يوجد حساب بوابة لهذا العميل مسبقاً");
    }

    const [emailTaken] = await rawQuery<any>(
      `SELECT id FROM client_portal_accounts WHERE email = $1`,
      [email]
    );
    if (emailTaken) {
      throw new ConflictError("هذا البريد الإلكتروني مستخدم بالفعل في بوابة العملاء");
    }

    const passwordHash = await hashPassword(password);
    const { insertId } = await rawExecute(
      `INSERT INTO client_portal_accounts ("clientId", "companyId", email, "passwordHash", "isActive", "mustChangePassword")
       VALUES ($1, $2, $3, $4, true, true)`,
      [Number(id), scope.companyId, email, passwordHash]
    );
    const [account] = await rawQuery<any>(
      `SELECT id, email, "isActive", "mustChangePassword", "createdAt" FROM client_portal_accounts WHERE id = $1 AND "companyId" = $2`,
      [insertId, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.created", entity: "client_portal_accounts", entityId: insertId, details: JSON.stringify({ clientId: Number(id), email }) }).catch((e) => logger.error(e, "clients background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "create", entity: "client_portal_accounts", entityId: insertId, after: { clientId: Number(id), email } }).catch((e) => logger.error(e, "clients background task failed"));

    res.status(201).json({ account });
  } catch (err) {
    handleRouteError(err, res, "Create portal account error:");
  }
});

router.patch("/:id/portal-account", requirePermission("crm:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const { isActive, password } = req.body as { isActive?: boolean; password?: string };

    const [account] = await rawQuery<any>(
      `SELECT cpa.id FROM client_portal_accounts cpa
       JOIN clients c ON c.id = cpa."clientId"
       WHERE cpa."clientId" = $1 AND cpa."companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!account) { throw new NotFoundError("حساب البوابة غير موجود"); }

    const sets: string[] = [];
    const params: any[] = [];

    if (isActive !== undefined) {
      params.push(isActive);
      sets.push(`"isActive" = $${params.length}`);
    }
    if (password) {
      if (password.length < 6) {
        throw new ValidationError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      }
      const hash = await hashPassword(password);
      params.push(hash);
      sets.push(`"passwordHash" = $${params.length}`);
      params.push(true);
      sets.push(`"mustChangePassword" = $${params.length}`);
    }

    if (sets.length === 0) { res.json({ account }); return; }
    sets.push(`"updatedAt" = NOW()`);
    params.push(account.id);
    await rawExecute(
      `UPDATE client_portal_accounts SET ${sets.join(",")} WHERE id = $${params.length}`,
      params
    );
    const [updated] = await rawQuery<any>(
      `SELECT id, email, "isActive", "mustChangePassword", "lastLoginAt", "createdAt" FROM client_portal_accounts WHERE id = $1 AND "companyId" = $2`,
      [account.id, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.updated", entity: "client_portal_accounts", entityId: account.id, details: JSON.stringify({ clientId: Number(id), isActive }) }).catch((e) => logger.error(e, "clients background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "update", entity: "client_portal_accounts", entityId: account.id, after: { clientId: Number(id), isActive, passwordChanged: !!password } }).catch((e) => logger.error(e, "clients background task failed"));

    res.json({ account: updated });
  } catch (err) {
    handleRouteError(err, res, "Update portal account error:");
  }
});

export default router;
