import { handleRouteError, ValidationError, NotFoundError, ConflictError, parseId, zodParse } from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { issueNumber } from "../lib/numberingService.js";
import { createSubsidiaryAccountsForEntity } from "./accounting-engine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { hashPassword } from "../lib/auth.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { logger } from "../lib/logger.js";
import { registerEntityParty } from "../lib/partyService.js";
import type { ClientRow, InvoiceRow } from "../lib/dbTypes.js";

// Local row shapes for the projection-style SELECTs in this file. Keeping
// them next to the route file (rather than in dbTypes.ts) lets us track
// which columns each list/detail endpoint actually returns to the client.

type ClientListRow = Pick<
  ClientRow,
  "id" | "name" | "phone" | "email" | "classification" | "source" | "isBlacklisted" | "createdAt"
> & { totalRevenue: number | string | null; expectedRevenue: number | string | null };

type ClientInvoiceRow = Pick<InvoiceRow, "id" | "ref" | "status" | "createdAt" | "dueDate"> & {
  total: number | string;
  paidAmount: number | string;
};

interface ClientOpportunityRow {
  id: number;
  title: string;
  stage: string;
  value: string | number;
  probability: number;
  expectedCloseDate: string | null;
  status: string;
}

interface ClientTicketRow {
  id: number;
  ref: string;
  title: string;
  status: string;
  priority: string;
  category: string | null;
  createdAt: string;
}

interface ClientProjectRow {
  id: number;
  name: string;
  status: string;
  budget: string | number;
  progress: number;
  startDate: string | null;
  endDate: string | null;
}

interface ClientFinancialsRow {
  totalInvoiced: string | number;
  totalPaid: string | number;
  totalOutstanding: string | number;
  invoiceCount: string | number;
  paidCount: string | number;
  overdueCount: string | number;
}

interface ClientConversationRow {
  id: number;
  phone: string;
  message: string;
  status: string;
  createdAt: string;
  channel: "whatsapp" | "sms";
}

interface ClientTimelineRow {
  type: "invoice" | "opportunity" | "ticket" | "project";
  ref: string;
  status: string;
  detail: string;
  createdAt: string;
}

interface ClientAttachment {
  name: string;
  url: string;
  type: string;
}

interface PortalAccountRow {
  id: number;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

// #2134 — quick-create dialogs submit untouched optional fields as "" (empty
// string). A bare z.string().email() REJECTS "", so leaving «البريد» empty in
// «+ عميل جديد» 422'd the whole create and the client silently never existed.
// Treat "" as absent; a non-empty value is still validated as a real email.
const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

const createClientSchema = z.object({
  name: z.string().min(1, "اسم العميل مطلوب"),
  phone: z.string().optional().nullable(),
  email: z.preprocess(emptyToNull, z.string().email("البريد الإلكتروني غير صالح").optional().nullable()),
  classification: z.enum(["regular", "vip", "prospect", "wholesale", "new", "inactive"]).optional().default("regular"),
  source: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  type: z.enum(["individual", "company", "government"]).optional().default("individual"),
  nationality: z.string().optional().nullable(),
  language: z.enum(["ar", "en"]).optional().default("ar"),
});

const updateClientSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  email: z.preprocess(emptyToNull, z.string().email("البريد الإلكتروني غير صالح").optional().nullable()),
  classification: z.enum(["regular", "vip", "prospect", "wholesale", "new", "inactive"]).optional(),
  source: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isBlacklisted: z.boolean().optional(),
});

const autoCreateClientSchema = z.object({
  phone: z.string().min(1, "رقم الهاتف مطلوب"),
  name: z.string().optional(),
  source: z.string().optional().default("auto"),
});

const createPortalAccountSchema = z.object({
  email: z.string().min(1, "البريد الإلكتروني مطلوب"),
  password: z.string().min(1, "كلمة المرور مطلوبة"),
});

const updatePortalAccountSchema = z.object({
  isActive: z.boolean().optional(),
  password: z.string().optional(),
});

const router = Router();

router.get("/", authorize({ feature: "crm.clients", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search = "", classification = "", page = "1", limit: lim = "20", deleted = "" } = req.query as Record<string, string | undefined>;
    const safeLim = Math.min(Math.max(Number(lim) || 20, 1), 500);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLim;

    const filters = parseScopeFilters(req);
    if (search) { filters.search = String(search); filters.searchColumns = ['name', 'email', 'phone']; }

    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { disableBranchScope: true });
    // #2713 — سلة المحذوفات: deleted=true يعرض المحذوف ناعمًا فقط (للاسترجاع).
    const showDeleted = deleted === "true";
    let where = baseWhere + (showDeleted ? ` AND "deletedAt" IS NOT NULL` : ` AND "deletedAt" IS NULL`);
    let paramIdx = nextParamIndex;

    if (classification) {
      where += ` AND classification = $${paramIdx}`;
      params.push(classification);
      paramIdx++;
    }

    params.push(safeLim);
    const limitParam = paramIdx++;
    params.push(offset);
    const offsetParam = paramIdx++;

    const clients = await rawQuery<ClientListRow>(
      `SELECT id, name, phone, email, classification, source,
              "totalRevenue", "expectedRevenue", "isBlacklisted", "createdAt"
       FROM clients
       WHERE ${where}
       ORDER BY "createdAt" DESC, name ASC
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<{ total: string | number }>(
      `SELECT COUNT(*) AS total FROM clients WHERE ${where}`,
      countParams
    );

    res.json(maskFields(req, { data: clients, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: safeLim }));
  } catch (err) {
    handleRouteError(err, res, "List clients error:");
  }
});

router.post("/", authorize({ feature: "crm.clients", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(createClientSchema.safeParse(req.body));
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
    } = parsed;

    const rawAttachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 20) : null;
    const attachments: ClientAttachment[] | null = rawAttachments
      ? rawAttachments.map((a: unknown) => {
          const obj = (a ?? {}) as Record<string, unknown>;
          return { name: String(obj.name ?? ""), url: String(obj.url ?? ""), type: String(obj.type ?? "") };
        })
      : null;
    let insertedId: number = 0;
    await withTransaction(async (txClient) => {
      if (email) {
        const { rows: [emailExists] } = await txClient.query<{ id: number }>(
          `SELECT id FROM clients WHERE email = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1 FOR UPDATE`,
          [email, scope.companyId]
        );
        if (emailExists) throw new ConflictError("البريد الإلكتروني مستخدم لعميل آخر", { field: "email", fix: "استخدم بريداً إلكترونياً مختلفاً أو ابحث عن العميل الموجود" });
      }
      if (phone) {
        const { rows: [phoneExists] } = await txClient.query<{ id: number }>(
          `SELECT id FROM clients WHERE phone = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1 FOR UPDATE`,
          [phone, scope.companyId]
        );
        if (phoneExists) throw new ConflictError("رقم الهاتف مستخدم لعميل آخر", { field: "phone", fix: "استخدم رقم هاتف مختلفاً أو ابحث عن العميل الموجود" });
      }
      const { rows: [newRow] } = await txClient.query<{ id: number }>(
        `INSERT INTO clients (name, phone, email, classification, source, notes, "type", nationality, language, "companyId", "isBlacklisted", attachments)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11) RETURNING id`,
        [String(name).trim(), phone ?? null, email ?? null, classification, source ?? null, notes ?? null, type, nationality ?? null, language, scope.companyId, attachments ? JSON.stringify(attachments) : null]
      );
      insertedId = newRow!.id;
    });

    const [client] = await rawQuery<ClientRow>(
      `SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [insertedId, scope.companyId]
    );
    if (!client) throw new NotFoundError("فشل في استرجاع العميل");

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "clients",
      entityId: insertedId,
      after: { name, phone, email, classification, source },
    }).catch((e) => logger.error(e, "clients background task failed"));

    createSubsidiaryAccountsForEntity(scope.companyId, "client", insertedId, name, { branchId: scope.branchId, actorUserId: scope.userId }).catch((e) => logger.error(e, "clients background task failed"));

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.created", entity: "clients", entityId: insertedId, details: JSON.stringify({ name, phone, email, classification, source }) }).catch((e) => logger.error(e, "clients background task failed"));

    // Master-data identity (migration 249): link the client to ONE party so a
    // customer who is also a supplier/employee resolves to a single 360° record
    // immediately — no waiting for the operator-triggered backfill. Non-fatal.
    registerEntityParty(scope.companyId, "clients", insertedId, "customer", {
      displayName: String(name).trim(),
      phone: phone ?? null,
      email: email ?? null,
      kind: type === "government" ? "organization" : "person",
    }).catch((e) => logger.error(e, "[partyService] clients registration failed"));

    res.status(201).json(client);
  } catch (err) {
    handleRouteError(err, res, "Create client error:");
  }
});

// RBAC v2: crm.clients view + maskFields. Phone, email, creditLimit
// are declared as sensitive fields so per-role policies can mask them
// (e.g. junior sales reps see masked phone numbers).
router.get("/:id", authorize({ feature: "crm.clients", action: "view", resource: { table: "clients", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const [client] = await rawQuery<ClientRow>(
      `SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );

    if (!client) {
      throw new NotFoundError("العميل غير موجود");
    }

    const [invoices, opportunities, tickets, projects, financials, conversations, timeline] = await Promise.all([
      rawQuery<ClientInvoiceRow>(
        `SELECT id, ref, status, total, "paidAmount", "dueDate", "createdAt"
         FROM invoices
         WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [id, scope.companyId]
      ),
      rawQuery<ClientOpportunityRow>(
        `SELECT id, title, stage, value, probability, "expectedCloseDate", status
         FROM crm_opportunities
         WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [id, scope.companyId]
      ),
      rawQuery<ClientTicketRow>(
        `SELECT id, ref, title, status, priority, category, "createdAt"
         FROM support_tickets
         WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [id, scope.companyId]
      ),
      rawQuery<ClientProjectRow>(
        `SELECT id, name, status, budget, progress, "startDate", "endDate"
         FROM projects
         WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [id, scope.companyId]
      ),
      rawQuery<ClientFinancialsRow>(
        `SELECT
           COALESCE(SUM(total), 0) AS "totalInvoiced",
           COALESCE(SUM("paidAmount"), 0) AS "totalPaid",
           COALESCE(SUM(total) - SUM("paidAmount"), 0) AS "totalOutstanding",
           COUNT(*) AS "invoiceCount",
           COUNT(*) FILTER (WHERE status = 'paid') AS "paidCount",
           COUNT(*) FILTER (WHERE status NOT IN ('paid','cancelled') AND "dueDate" < CURRENT_DATE) AS "overdueCount"
         FROM invoices
         WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      ),
      rawQuery<ClientConversationRow>(
        // Phase 4 contract cleanup: read from outbound_queue (unified)
        // instead of the per-channel legacy queues. The client's phone
        // matches outbound_queue.recipient when channel='sms'; for
        // whatsapp the legacy whatsapp_queue.clientId column has no
        // analogue here, so we match on recipient = clients.phone too.
        `SELECT oq.id::int AS id, oq.recipient AS phone, oq.body AS message,
                oq.status, oq."createdAt", oq.channel
           FROM outbound_queue oq
          WHERE oq."companyId" = $2
            AND oq.channel IN ('whatsapp','sms')
            AND oq.recipient = (SELECT phone FROM clients WHERE id = $1 AND "companyId" = $2 LIMIT 1)
          ORDER BY oq."createdAt" DESC LIMIT 20`,
        [id, scope.companyId]
      ).catch((e) => { logger.error(e, "clients query failed"); return [] as ClientConversationRow[]; }),
      rawQuery<ClientTimelineRow>(
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
        [id, scope.companyId]
      ),
    ]);

    const activeServices = {
      activeContracts: await rawQuery<{ id: number; title: string; endDate: string | null }>(
        `SELECT id, title, "endDate" FROM legal_contracts
         WHERE "companyId" = $1 AND status = 'active' AND "deletedAt" IS NULL
           AND ("partyName" = $2 OR id IN (
             SELECT id FROM rental_contracts WHERE "tenantName" = $2 AND "companyId" = $1 AND "deletedAt" IS NULL
           ))
         LIMIT 10`,
        // client `id` unreferenced here → not bound (was a $1 42P18 the .catch
        // swallowed, so "active contracts" always reported none).
        [scope.companyId, client.name]
      ).catch((e) => { logger.error(e, "clients query failed"); return []; }),
      activeProjects: projects.filter((p) => p.status === 'active'),
      openTickets: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress'),
    };

    // Customer-portal linkages — populated from clientId columns added
    // in migration 230 (tenants, legal_cases) and the pre-existing
    // umrah_sub_agents.clientId. Each list mirrors a section the customer
    // portal exposes under /portal/me availableSections, so an operator
    // looking at a CRM client can see at-a-glance every relationship
    // they hold.
    const [tenancies, legalCases, umrahSubAgents] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        // Drop t.phone + t."nationalId" — the request is authorized
        // under crm.clients, not properties.tenants. Sales/account
        // managers viewing a client should not get tenant PII as a
        // side-effect of the tenancies tab; the link is enough so they
        // can navigate to /properties/tenants/:id where the proper
        // properties.tenants:view RBAC + field policy apply.
        `SELECT t.id, t.name,
                (SELECT COUNT(*) FROM rental_contracts rc
                  WHERE rc."tenantId" = t.id AND rc.status = 'active' AND rc."deletedAt" IS NULL)::int AS "activeContracts"
           FROM tenants t
          WHERE t."clientId" = $1 AND t."companyId" = $2 AND t."deletedAt" IS NULL
          ORDER BY t.id DESC LIMIT 20`,
        [id, scope.companyId]
      ).catch((e) => { logger.error(e, "clients-tenancies query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT id, "caseNumber", title, "caseType", court, status, priority,
                "financialRisk", "riskLevel", "filingDate"
           FROM legal_cases
          WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          ORDER BY "createdAt" DESC LIMIT 20`,
        [id, scope.companyId]
      ).catch((e) => { logger.error(e, "clients-legal-cases query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT id, "nuskCode", name, country, "paymentTerms", "isActive"
           FROM umrah_sub_agents
          WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          ORDER BY id DESC LIMIT 20`,
        [id, scope.companyId]
      ).catch((e) => { logger.error(e, "clients-umrah-sub-agents query failed"); return []; }),
    ]);

    res.json(maskFields(req, {
      ...client,
      invoices,
      opportunities,
      tickets,
      projects,
      financials: financials[0] || {},
      conversations,
      timeline,
      activeServices,
      // Customer-type relationships — surface them under their own keys
      // so the client-detail UI can render dedicated cards per type.
      tenancies,
      legalCases,
      umrahSubAgents,
    }));
  } catch (err) {
    handleRouteError(err, res, "Get client error:");
  }
});

router.patch("/:id", authorize({ feature: "crm.clients", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) { throw new NotFoundError("العميل غير موجود"); }

    const b = zodParse(updateClientSchema.safeParse(req.body));
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name = $${params.length}`); }
    if (b.phone !== undefined) { params.push(b.phone); sets.push(`phone = $${params.length}`); }
    if (b.email !== undefined) { params.push(b.email); sets.push(`email = $${params.length}`); }
    if (b.classification !== undefined) { params.push(b.classification); sets.push(`classification = $${params.length}`); }
    if (b.source !== undefined) { params.push(b.source); sets.push(`source = $${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes = $${params.length}`); }
    if (b.isBlacklisted !== undefined) { params.push(b.isBlacklisted); sets.push(`"isBlacklisted" = $${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id, scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE clients SET ${sets.join(",")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL`, params);
    if (!affectedRows) throw new NotFoundError("العميل غير موجود");
    const [updated] = await rawQuery<ClientRow>(`SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!updated) throw new NotFoundError("العميل غير موجود");

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.updated", entity: "clients", entityId: id, details: JSON.stringify({ name: b.name, phone: b.phone, email: b.email, classification: b.classification }) }).catch((e) => logger.error(e, "clients background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "update", entity: "clients", entityId: id, after: { name: b.name, phone: b.phone, email: b.email, classification: b.classification } }).catch((e) => logger.error(e, "clients background task failed"));

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "Update client error:");
  }
});

// #2713 — استرجاع عميل محذوف ناعمًا (سلة المحذوفات). صلاحية تعديل + Audit.
router.post("/:id/restore", authorize({ feature: "crm.clients", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(
      `UPDATE clients SET "deletedAt" = NULL WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NOT NULL`,
      [id, scope.companyId]
    );
    if (!affectedRows) throw new NotFoundError("لا يوجد عميل محذوف بهذا المعرّف");
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "restore", entity: "clients", entityId: id }).catch((e) => logger.error(e, "clients background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.restored", entity: "clients", entityId: id, details: JSON.stringify({ restored: true }) }).catch((e) => logger.error(e, "clients background task failed"));
    const [restored] = await rawQuery<ClientRow>(`SELECT * FROM clients WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    res.json(restored ?? { id, restored: true });
  } catch (err) {
    handleRouteError(err, res, "Restore client error:");
  }
});

router.post("/auto-create", authorize({ feature: "crm.clients", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(autoCreateClientSchema.safeParse(req.body ?? {}));
    const { phone, name, source } = b;

    const existing = await rawQuery<ClientRow>(
      `SELECT * FROM clients WHERE phone = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [phone, scope.companyId]
    );

    if (existing.length > 0) {
      res.json({ ...existing[0], isNew: false });
      return;
    }

    const clientName = name || `عميل ${phone.slice(-4)}`;
    // Numbering center (Issue #1141) — atomic flow: issueNumber +
    // INSERT + link-back inside one withTransaction. SAVEPOINT
    // reentrancy in rawdb.ts means the inner issueNumber joins this
    // outer tx, so the entity INSERT and the assignment link-back
    // either both commit or both roll back. Replaces the previous
    // .catch(logger.error) swallow that allowed an orphan client row
    // with no audit assignment.
    const atomic = await withTransaction(async () => {
      const issued = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "crm",
        entityKey: "client_code",
        entityTable: "clients",
        actorId: scope.userId,
        expectedTiming: "on_draft",
      });
      const result = await rawExecute(
        `INSERT INTO clients (name, phone, classification, source, code, "companyId", "isBlacklisted")
         VALUES ($1, $2, 'prospect', $3, $4, $5, false)`,
        [clientName, phone, source, issued.number, scope.companyId]
      );
      assertInsert(result.insertId, "clients");
      await rawExecute(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [result.insertId, issued.assignmentId]
      );
      return { insertId: result.insertId, code: issued.number };
    });
    const code = atomic.code;
    const insertId = atomic.insertId;

    const [newClient] = await rawQuery<ClientRow>(`SELECT * FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);
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

    // Master-data identity (migration 249) — auto-created clients link to a
    // party too, so the on-the-fly customer is deduped/360-resolvable. Non-fatal.
    registerEntityParty(scope.companyId, "clients", insertId, "customer", {
      displayName: clientName, phone: phone ?? null, kind: "person",
    }).catch((e) => logger.error(e, "[partyService] clients auto-create registration failed"));

    res.status(201).json({ ...newClient, isNew: true });
  } catch (err) {
    handleRouteError(err, res, "Auto-create client error:");
  }
});

router.delete("/:id", authorize({ feature: "crm.clients", action: "delete", resource: { table: "clients", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) { throw new NotFoundError("العميل غير موجود"); }

    const [deps] = await rawQuery<{ invoices: number; opportunities: number; tickets: number }>(
      `SELECT
        (SELECT COUNT(*)::int FROM invoices WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status NOT IN ('cancelled','closed')) AS invoices,
        (SELECT COUNT(*)::int FROM crm_opportunities WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND stage NOT IN ('closed_won','closed_lost')) AS opportunities,
        (SELECT COUNT(*)::int FROM support_tickets WHERE "clientId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status NOT IN ('closed','resolved')) AS tickets`,
      [id, scope.companyId]
    );
    const blocking = [];
    if (deps?.invoices > 0) blocking.push(`${deps.invoices} فاتورة نشطة`);
    if (deps?.opportunities > 0) blocking.push(`${deps.opportunities} فرصة مفتوحة`);
    if (deps?.tickets > 0) blocking.push(`${deps.tickets} تذكرة مفتوحة`);
    if (blocking.length > 0) {
      throw new ConflictError(
        `لا يمكن حذف العميل — يوجد سجلات مرتبطة: ${blocking.join("، ")}`,
        { field: "id", fix: "أغلق أو ألغِ السجلات المرتبطة أولاً" }
      );
    }

    const { affectedRows } = await rawExecute(`UPDATE clients SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("العميل غير موجود");

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.deleted", entity: "clients", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "clients background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "delete", entity: "clients", entityId: id }).catch((e) => logger.error(e, "clients background task failed"));

    res.json({ message: "تم حذف العميل بنجاح" });
  } catch (err) {
    handleRouteError(err, res, "Delete client error:");
  }
});

router.get("/:id/portal-account", authorize({ feature: "crm.clients", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) { throw new NotFoundError("العميل غير موجود"); }
    const [account] = await rawQuery<PortalAccountRow>(
      `SELECT id, email, "isActive", "mustChangePassword", "lastLoginAt", "createdAt"
       FROM client_portal_accounts
       WHERE "clientId" = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    res.json(maskFields(req, { account: account || null }));
  } catch (err) {
    handleRouteError(err, res, "Get portal account error:");
  }
});

router.post("/:id/portal-account", authorize({ feature: "crm.clients", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b2 = zodParse(createPortalAccountSchema.safeParse(req.body ?? {}));
    const { email: rawEmail, password } = b2;

    if (!rawEmail || !password) {
      throw new ValidationError("البريد الإلكتروني وكلمة المرور مطلوبان");
    }
    if (password.length < 6) {
      throw new ValidationError("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
    }
    const email = rawEmail.trim().toLowerCase();

    const [client] = await rawQuery<{ id: number }>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!client) { throw new NotFoundError("العميل غير موجود"); }

    const [existing] = await rawQuery<{ id: number }>(
      `SELECT id FROM client_portal_accounts WHERE "clientId" = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (existing) {
      throw new ConflictError("يوجد حساب بوابة لهذا العميل مسبقاً");
    }

    const [emailTaken] = await rawQuery<{ id: number }>(
      `SELECT id FROM client_portal_accounts WHERE email = $1 AND "companyId" = $2`,
      [email, scope.companyId]
    );
    if (emailTaken) {
      throw new ConflictError("هذا البريد الإلكتروني مستخدم بالفعل في بوابة العملاء");
    }

    const passwordHash = await hashPassword(password);
    const { insertId } = await rawExecute(
      `INSERT INTO client_portal_accounts ("clientId", "companyId", email, "passwordHash", "isActive", "mustChangePassword")
       VALUES ($1, $2, $3, $4, true, true)`,
      [id, scope.companyId, email, passwordHash]
    );
    assertInsert(insertId, "client_portal_accounts");
    const [account] = await rawQuery<PortalAccountRow>(
      `SELECT id, email, "isActive", "mustChangePassword", "createdAt" FROM client_portal_accounts WHERE id = $1 AND "companyId" = $2`,
      [insertId, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.created", entity: "client_portal_accounts", entityId: insertId, details: JSON.stringify({ clientId: id, email }) }).catch((e) => logger.error(e, "clients background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "create", entity: "client_portal_accounts", entityId: insertId, after: { clientId: id, email } }).catch((e) => logger.error(e, "clients background task failed"));

    res.status(201).json({ account });
  } catch (err) {
    handleRouteError(err, res, "Create portal account error:");
  }
});

router.patch("/:id/portal-account", authorize({ feature: "crm.clients", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b3 = zodParse(updatePortalAccountSchema.safeParse(req.body ?? {}));
    const { isActive, password } = b3;

    const [account] = await rawQuery<{ id: number }>(
      `SELECT cpa.id FROM client_portal_accounts cpa
       JOIN clients c ON c.id = cpa."clientId"
       WHERE cpa."clientId" = $1 AND cpa."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!account) { throw new NotFoundError("حساب البوابة غير موجود"); }

    const sets: string[] = [];
    const params: unknown[] = [];

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
    // Bump tokenVersion when admin resets the password OR suspends the
    // account — both are recovery paths that must invalidate any JWT
    // currently in the user's (or an attacker's) hands. isActive=false
    // is already blocked by the portal middleware on the next request,
    // but bumping tokenVersion keeps the security model uniform: any
    // change to "who can use this account right now" → all old tokens
    // die.
    if (password || isActive === false) {
      sets.push(`"tokenVersion" = COALESCE("tokenVersion", 0) + 1`);
    }

    if (sets.length === 0) { res.json({ account }); return; }
    sets.push(`"updatedAt" = NOW()`);
    params.push(account.id);
    await rawExecute(
      `UPDATE client_portal_accounts SET ${sets.join(",")} WHERE id = $${params.length} AND "companyId" = $${params.length + 1}`,
      [...params, scope.companyId]
    );
    const [updated] = await rawQuery<PortalAccountRow>(
      `SELECT id, email, "isActive", "mustChangePassword", "lastLoginAt", "createdAt" FROM client_portal_accounts WHERE id = $1 AND "companyId" = $2`,
      [account.id, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "client.updated", entity: "client_portal_accounts", entityId: account.id, details: JSON.stringify({ clientId: id, isActive }) }).catch((e) => logger.error(e, "clients background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "update", entity: "client_portal_accounts", entityId: account.id, after: { clientId: id, isActive, passwordChanged: !!password } }).catch((e) => logger.error(e, "clients background task failed"));

    res.json({ account: updated });
  } catch (err) {
    handleRouteError(err, res, "Update portal account error:");
  }
});

/**
 * GET /clients/:id/contact-summary
 *
 * "When did we last touch this customer, and through which channel?"
 * Returns the most recent message_log row for this client across every
 * channel (inbound or outbound) + a tiny channel-by-channel breakdown,
 * so the detail page can show "آخر تواصل" without the operator opening
 * the inbox.
 *
 * Falls back to `null` when there's no history yet. Never throws on
 * empty data — tenant-scoped, soft-delete-aware.
 */
router.get("/:id/contact-summary", authorize({ feature: "crm.clients", action: "view", resource: { table: "clients", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    // The client's phone/email determine which rows in v_message_log_all
    // are theirs — the unified surface uses fromAddress/toAddress, not
    // entity ids. We match on either side (inbound vs outbound).
    const [client] = await rawQuery<{ phone: string | null; email: string | null }>(
      `SELECT phone, email FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [id, scope.companyId],
    );
    if (!client) throw new NotFoundError("العميل غير موجود");

    const addresses: string[] = [];
    if (client.phone) addresses.push(client.phone);
    if (client.email) addresses.push(client.email);

    if (addresses.length === 0) {
      res.json({ data: { lastContact: null, channelCounts: [], totalCount: 0 } });
      return;
    }

    type LastContactRow = {
      id: number; channel: string; direction: string;
      fromAddress: string | null; toAddress: string | null;
      subject: string | null; createdAt: string;
    };
    const [lastContact] = await rawQuery<LastContactRow>(
      `SELECT id, channel, direction, "fromAddress", "toAddress", subject, "createdAt"::text
         FROM v_message_log_all
        WHERE "companyId" = $1
          AND ("fromAddress" = ANY($2) OR "toAddress" = ANY($2))
          AND "deletedAt" IS NULL
        ORDER BY "createdAt" DESC LIMIT 1`,
      [scope.companyId, addresses],
    ).catch(() => [] as LastContactRow[]);

    const channelCounts: { channel: string; n: string }[] = await rawQuery<{ channel: string; n: string }>(
      `SELECT channel, COUNT(*)::text AS n
         FROM v_message_log_all
        WHERE "companyId" = $1
          AND ("fromAddress" = ANY($2) OR "toAddress" = ANY($2))
          AND "deletedAt" IS NULL
        GROUP BY channel
        ORDER BY channel`,
      [scope.companyId, addresses],
    ).catch(() => [] as { channel: string; n: string }[]);

    const totalCount = channelCounts.reduce((s, r) => s + Number(r.n || 0), 0);
    res.json({
      data: {
        lastContact: lastContact ?? null,
        channelCounts: channelCounts.map((r) => ({ channel: r.channel, count: Number(r.n) })),
        totalCount,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Get client contact summary error:");
  }
});

export default router;
