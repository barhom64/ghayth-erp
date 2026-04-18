import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createAuditLog } from "../lib/businessHelpers.js";
import { createSubsidiaryAccountsForEntity } from "./accounting-engine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { hashPassword } from "../lib/auth.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const { search = "", classification = "", page = "1", limit: lim = "20" } = req.query as any;
    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);

    const filters = parseScopeFilters(req);
    if (search) { filters.search = String(search); filters.searchColumns = ['name', 'email', 'phone']; }

    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, {});
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

router.post("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const {
      name,
      phone,
      email,
      classification = "regular",
      source,
      notes,
    } = req.body as any;

    if (!name) {
      res.status(400).json({ error: "الاسم مطلوب" });
      return;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO clients (name, phone, email, classification, source, notes, "companyId", "isBlacklisted")
       VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
      [name, phone ?? null, email ?? null, classification, source ?? null, notes ?? null, scope.companyId]
    );

    const [client] = await rawQuery<any>(
      `SELECT * FROM clients WHERE id = $1`,
      [insertId]
    );

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "clients",
      entityId: insertId,
      after: { name, phone, email, classification, source },
    }).catch(console.error);

    createSubsidiaryAccountsForEntity(scope.companyId, "client", insertId, name).catch(console.error);

    res.status(201).json(client);
  } catch (err) {
    handleRouteError(err, res, "Create client error:");
  }
});

router.get("/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;

    const [client] = await rawQuery<any>(
      `SELECT * FROM clients WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );

    if (!client) {
      res.status(404).json({ error: "العميل غير موجود" });
      return;
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
         WHERE "clientId" = $1 AND "companyId" = $2
         ORDER BY "createdAt" DESC LIMIT 20`,
        [Number(id), scope.companyId]
      ),
      rawQuery<any>(
        `SELECT id, ref, title, status, priority, category, "createdAt"
         FROM support_tickets
         WHERE "clientId" = $1 AND "companyId" = $2
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
         WHERE sq."companyId" = $2
         ORDER BY "createdAt" DESC LIMIT 20`,
        [Number(id), scope.companyId]
      ).catch(() => []),
      rawQuery<any>(
        `(SELECT 'invoice' AS type, ref AS ref, status, total::text AS detail, "createdAt"
          FROM invoices WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL)
         UNION ALL
         (SELECT 'opportunity' AS type, title AS ref, stage AS status, value::text AS detail, "createdAt"
          FROM crm_opportunities WHERE "clientId" = $1 AND "companyId" = $2)
         UNION ALL
         (SELECT 'ticket' AS type, ref, status, priority AS detail, "createdAt"
          FROM support_tickets WHERE "clientId" = $1 AND "companyId" = $2)
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
             SELECT "contractId" FROM rental_contracts WHERE "tenantName" = $3 AND "companyId" = $2
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

router.patch("/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const [existing] = await rawQuery<any>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "العميل غير موجود" }); return; }

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
    params.push(Number(id));
    await rawExecute(`UPDATE clients SET ${sets.join(",")} WHERE id = $${params.length}`, params);
    const [updated] = await rawQuery<any>(`SELECT * FROM clients WHERE id = $1`, [Number(id)]);
    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "Update client error:");
  }
});

router.post("/auto-create", async (req, res) => {
  try {
    const scope = req.scope!;
    const { phone, name, source = "auto" } = req.body as any;
    if (!phone) {
      res.status(400).json({ error: "رقم الهاتف مطلوب" });
      return;
    }

    const existing = await rawQuery<any>(
      `SELECT * FROM clients WHERE phone = $1 AND "companyId" = $2 LIMIT 1`,
      [phone, scope.companyId]
    );

    if (existing.length > 0) {
      res.json({ ...existing[0], isNew: false });
      return;
    }

    const clientName = name || `عميل ${phone.slice(-4)}`;
    const code = `CLT-${Date.now().toString(36).toUpperCase()}`;

    const { insertId } = await rawExecute(
      `INSERT INTO clients (name, phone, classification, source, code, "companyId", "isBlacklisted")
       VALUES ($1, $2, 'prospect', $3, $4, $5, false)`,
      [clientName, phone, source, code, scope.companyId]
    );

    const [newClient] = await rawQuery<any>(`SELECT * FROM clients WHERE id = $1`, [insertId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "auto_create",
      entity: "clients",
      entityId: insertId,
      after: { name: clientName, phone, source, classification: "prospect", code },
    }).catch(console.error);

    res.status(201).json({ ...newClient, isNew: true });
  } catch (err) {
    handleRouteError(err, res, "Auto-create client error:");
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const [existing] = await rawQuery<any>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "العميل غير موجود" }); return; }
    await rawExecute(`UPDATE clients SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [Number(id), scope.companyId]);
    res.json({ message: "تم حذف العميل بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Delete client error:");
  }
});

router.get("/:id/portal-account", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const [existing] = await rawQuery<any>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "العميل غير موجود" }); return; }
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

router.post("/:id/portal-account", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const { email: rawEmail, password } = req.body as { email: string; password: string };

    if (!rawEmail || !password) {
      res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
      return;
    }
    const email = rawEmail.trim().toLowerCase();

    const [client] = await rawQuery<any>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!client) { res.status(404).json({ error: "العميل غير موجود" }); return; }

    const [existing] = await rawQuery<any>(
      `SELECT id FROM client_portal_accounts WHERE "clientId" = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (existing) {
      res.status(409).json({ error: "يوجد حساب بوابة لهذا العميل مسبقاً" });
      return;
    }

    const [emailTaken] = await rawQuery<any>(
      `SELECT id FROM client_portal_accounts WHERE email = $1`,
      [email]
    );
    if (emailTaken) {
      res.status(409).json({ error: "هذا البريد الإلكتروني مستخدم بالفعل في بوابة العملاء" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const { insertId } = await rawExecute(
      `INSERT INTO client_portal_accounts ("clientId", "companyId", email, "passwordHash", "isActive", "mustChangePassword")
       VALUES ($1, $2, $3, $4, true, true)`,
      [Number(id), scope.companyId, email, passwordHash]
    );
    const [account] = await rawQuery<any>(
      `SELECT id, email, "isActive", "mustChangePassword", "createdAt" FROM client_portal_accounts WHERE id = $1`,
      [insertId]
    );
    res.status(201).json({ account });
  } catch (err) {
    handleRouteError(err, res, "Create portal account error:");
  }
});

router.patch("/:id/portal-account", async (req, res) => {
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
    if (!account) { res.status(404).json({ error: "حساب البوابة غير موجود" }); return; }

    const sets: string[] = [];
    const params: any[] = [];

    if (isActive !== undefined) {
      params.push(isActive);
      sets.push(`"isActive" = $${params.length}`);
    }
    if (password) {
      if (password.length < 6) {
        res.status(400).json({ error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
        return;
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
      `SELECT id, email, "isActive", "mustChangePassword", "lastLoginAt", "createdAt" FROM client_portal_accounts WHERE id = $1`,
      [account.id]
    );
    res.json({ account: updated });
  } catch (err) {
    handleRouteError(err, res, "Update portal account error:");
  }
});

export default router;
