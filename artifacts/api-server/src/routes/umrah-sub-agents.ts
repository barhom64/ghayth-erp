// ─────────────────────────────────────────────────────────────────────────────
// umrah-sub-agents.ts — UMRAH SUB-AGENTS (U-07 Phase 6)
//
// Routes carved verbatim from umrah-entities.ts into this dedicated sub-router.
// Mounted via `router.use(subAgentsRouter)` in umrah-entities.ts so the API
// surface stays identical (paths still resolve at /umrah/sub-agents/...).
//
// Pure code move — handlers, schemas, RBAC are carried over VERBATIM
// (no behaviour change). Audit calls converted to auditFromRequest per the
// IGOC ratchet (auditIgocContextCoverageRatchet.test.ts) — new route files
// must not use the legacy direct audit helper.
//
// Routes owned here:
//   GET    /sub-agents
//   POST   /sub-agents
//   GET    /sub-agents/unlinked
//   GET    /sub-agents/:id
//   PATCH  /sub-agents/:id
//   DELETE /sub-agents/:id
//   PUT    /sub-agents/:id/link
//   POST   /sub-agents/link-by-nusk
//   POST   /sub-agents/:id/link-client
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { issueNumber } from "../lib/numberingService.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { registerEntityParty } from "../lib/partyService.js";

const router = Router();

// ============================================================================
// SCHEMAS
// ============================================================================

const createSubAgentSchema = z.object({
  nuskCode: z.string().min(1, "رمز نسك مطلوب"),
  name: z.string().min(1, "الاسم مطلوب"),
  agentId: z.coerce.number().optional(),
  clientId: z.coerce.number().optional(),
  paymentTerms: z.string().optional(),
  defaultPricePerMutamer: z.coerce.number().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  country: z.string().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().optional(),
});

const updateSubAgentSchema = z.object({
  nuskCode: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  agentId: z.coerce.number().nullable().optional(),
  clientId: z.coerce.number().nullable().optional(),
  paymentTerms: z.string().optional(),
  defaultPricePerMutamer: z.coerce.number().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

const linkSubAgentSchema = z.object({
  clientId: z.coerce.number().optional(),
  createNew: z.boolean().optional(),
  clientName: z.string().optional(),
  clientPhone: z.string().optional(),
});

const linkByNuskSchema = z.object({
  nuskCode: z.string().min(1, "رمز نسك مطلوب"),
  clientId: z.coerce.number({ required_error: "معرف العميل مطلوب" }),
  // U-11 Phase 3b (#2080) — optional free-text justification recorded
  // on the audit log + emitted event. Surfaces the operator's intent
  // ("matched by phone", "merger with #123", ...) for downstream
  // review. Limited to 500 chars to keep the audit row sane.
  reason: z.string().max(500).optional(),
});

const linkClientSchema = z.object({
  clientId: z.coerce.number({ required_error: "معرف العميل مطلوب" }),
});

// ============================================================================
// ROUTES
// ============================================================================

router.get("/sub-agents", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT sa.*, a.name AS "agentName", c.name AS "clientName"
       FROM umrah_sub_agents sa
       LEFT JOIN umrah_agents a ON sa."agentId" = a.id
                                AND a."companyId" = sa."companyId"
                                AND a."deletedAt" IS NULL
       LEFT JOIN clients c ON sa."clientId" = c.id AND c."companyId" = sa."companyId" AND c."deletedAt" IS NULL
       WHERE sa."companyId" = $1 AND sa."deletedAt" IS NULL
       ORDER BY sa.name
       LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List sub-agents"); }
});

router.post("/sub-agents", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(createSubAgentSchema.safeParse(req.body));
    const b = parsed;
    const rows = await rawQuery(
      `INSERT INTO umrah_sub_agents
       ("companyId","branchId","nuskCode",name,"agentId","clientId","paymentTerms",
        "defaultPricePerMutamer",phone,email,country,"isActive",notes,"createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW()) RETURNING *`,
      [scope.companyId, scope.branchId, b.nuskCode, b.name, b.agentId || null,
       b.clientId || null, b.paymentTerms || "postpaid", b.defaultPricePerMutamer || null,
       b.phone || null, b.email || null, b.country || null, b.isActive ?? true,
       b.notes || null, scope.userId]
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الوكيل الفرعي");
    auditFromRequest(req, "create", "umrah_sub_agents", rows[0].id, { after: { name: b.name } }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.created", entity: "umrah_sub_agents", entityId: rows[0].id, details: JSON.stringify({ name: b.name, nuskCode: b.nuskCode }) }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    // Master-data identity (migration 249) — link the sub-agent to ONE party. Non-fatal.
    registerEntityParty(scope.companyId, "umrah_sub_agents", Number(rows[0].id), "sub_agent", {
      displayName: b.name, phone: b.phone ?? null, email: b.email ?? null, kind: "organization",
    }).catch((e) => logger.error(e, "[partyService] umrah_sub_agents registration failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create sub-agent"); }
});

// Single-row sub-agent fetch. Used by the detail page UI to render
// the full row (same joined columns the list returns) plus the
// statement / pricing / attachments panels.
router.get("/sub-agents/unlinked", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as Record<string, string | undefined>;
    let where = `sa."companyId" = $1 AND sa."deletedAt" IS NULL AND sa."clientId" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (seasonId && Number(seasonId)) {
      // Season filter via agent's packages rather than direct column
    }
    const rows = await rawQuery(
      `SELECT sa.*, a.name AS "agentName",
              (SELECT sa2."clientId" FROM umrah_sub_agents sa2
               WHERE sa2."companyId" = sa."companyId" AND sa2.name = sa.name
                 AND sa2."clientId" IS NOT NULL AND sa2."deletedAt" IS NULL
               ORDER BY sa2."createdAt" DESC LIMIT 1) AS "suggestedClientId",
              (SELECT c2.name FROM clients c2
               JOIN umrah_sub_agents sa3 ON sa3."clientId" = c2.id
               WHERE sa3."companyId" = sa."companyId" AND sa3.name = sa.name
                 AND sa3."clientId" IS NOT NULL AND sa3."deletedAt" IS NULL
               ORDER BY sa3."createdAt" DESC LIMIT 1) AS "suggestedClientName"
       FROM umrah_sub_agents sa
       LEFT JOIN umrah_agents a ON sa."agentId" = a.id
                                AND a."companyId" = sa."companyId"
                                AND a."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY sa.name`,
      params
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List unlinked sub-agents"); }
});

router.get("/sub-agents/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Defence-in-depth: the umrah_agents JOIN previously matched only
    // sa."agentId" = a.id (no companyId / deletedAt guards) — a stale
    // FK could surface another tenant's agent name. Adding the same
    // pattern used by GET /umrah/pilgrims/:id (PR #1425).
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT sa.*, a.name AS "agentName", c.name AS "clientName"
         FROM umrah_sub_agents sa
         LEFT JOIN umrah_agents a
                ON sa."agentId" = a.id
               AND a."companyId" = sa."companyId"
               AND a."deletedAt" IS NULL
         LEFT JOIN clients c
                ON sa."clientId" = c.id
               AND c."companyId" = sa."companyId"
               AND c."deletedAt" IS NULL
        WHERE sa.id = $1 AND sa."companyId" = $2 AND sa."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الوكيل الفرعي غير موجود");

    // Statement aggregates — mirrors the agent statement (PR #1438) so
    // sub-agents get the same one-pane view. Three queries run in
    // parallel via Promise.all so adding them doesn't double the
    // detail-fetch latency.
    //
    //   - pilgrimCount        : how many pilgrims this sub-agent sent
    //   - statusBreakdown     : dict keyed by pilgrim status
    //   - totalPaid           : SUM(sarAmount) from umrah_payments —
    //                            real receipts table (unlike agents
    //                            where we approximate via invoice
    //                            status). Sub-agents are the actual
    //                            money sources in most umrah setups,
    //                            so the payments table IS the source
    //                            of truth.
    const [statsResult, statusBreakdownResult, paymentResult] = await Promise.all([
      rawQuery<{ pilgrimCount: number; overstayedCount: number }>(
        `SELECT COUNT(*)::int AS "pilgrimCount",
                COUNT(*) FILTER (WHERE status='overstayed')::int AS "overstayedCount"
           FROM umrah_pilgrims
          WHERE "subAgentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      ),
      rawQuery<{ status: string; c: number }>(
        `SELECT status, COUNT(*)::int AS c
           FROM umrah_pilgrims
          WHERE "subAgentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
          GROUP BY status`,
        [id, scope.companyId]
      ),
      rawQuery<{ totalPaid: string }>(
        `SELECT COALESCE(SUM("sarAmount"), 0)::numeric AS "totalPaid"
           FROM umrah_payments
          WHERE "subAgentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [id, scope.companyId]
      ),
    ]);
    const stats = statsResult[0] || { pilgrimCount: 0, overstayedCount: 0 };
    const totalPaid = Number(paymentResult[0]?.totalPaid ?? 0);
    const statusBreakdown = Object.fromEntries(
      statusBreakdownResult.map((r) => [r.status, Number(r.c)])
    );

    res.json(maskFields(req, {
      ...row,
      ...stats,
      totalPaid,
      statusBreakdown,
    }));
  } catch (err) { handleRouteError(err, res, "Get sub-agent"); }
});

router.patch("/sub-agents/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updateSubAgentSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;
    const params: unknown[] = [];
    const sets: string[] = [];
    for (const key of ["nuskCode","name","agentId","clientId","paymentTerms","defaultPricePerMutamer","phone","email","country","isActive","notes"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE umrah_sub_agents SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (!affectedRows) throw new NotFoundError("الوكيل الفرعي غير موجود");
    const [row] = await rawQuery(`SELECT * FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    auditFromRequest(req, "update", "umrah_sub_agents", id, { after: b }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.updated", entity: "umrah_sub_agents", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update sub-agent"); }
});

router.delete("/sub-agents/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(
      `UPDATE umrah_sub_agents SET "deletedAt"=NOW(), "updatedBy"=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [scope.userId, id, scope.companyId]
    );
    if (affectedRows === 0) throw new NotFoundError("الوكيل الفرعي غير موجود");
    auditFromRequest(req, "delete", "umrah_sub_agents", id, {}).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.deleted", entity: "umrah_sub_agents", entityId: id, details: "{}" }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete sub-agent"); }
});

router.put("/sub-agents/:id/link", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(linkSubAgentSchema.safeParse(req.body));
    const { clientId, createNew, clientName, clientPhone } = parsed;

    let finalClientId: number | null = clientId ?? null;

    // Validation + number reservation run BEFORE the transaction
    // (issueNumber opens its own tx — must not be nested). The client
    // create/mark + numbering back-link + sub-agent link are then written
    // atomically so a failed sub-agent link can't leave an orphan client.
    let issuedCli: Awaited<ReturnType<typeof issueNumber>> | null = null;
    if (createNew) {
      if (!clientName) throw new ValidationError("اسم العميل مطلوب عند إنشاء عميل جديد");
      // Numbering center (Issue #1141) — client code from authority.
      issuedCli = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "crm",
        entityKey: "client_code",
        entityTable: "clients",
        actorId: scope.userId,
        metadata: { source: "umrah_agent_creation" },
        expectedTiming: "on_draft",
      });
    } else {
      if (!clientId) throw new ValidationError("معرف العميل مطلوب");
      const [existingClient] = await rawQuery<{ id: number }>(
        `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [clientId, scope.companyId]
      );
      if (!existingClient) throw new NotFoundError("العميل غير موجود أو لا ينتمي لهذه الشركة");
    }

    finalClientId = await withTransaction(async () => {
      let cid = clientId ?? null;
      if (createNew && issuedCli) {
        const [newClient] = await rawQuery<{ id: number }>(
          `INSERT INTO clients ("companyId", name, phone, classification, source, code, "createdAt")
           VALUES ($1, $2, $3, 'umrah_agent', 'system', $4, NOW()) RETURNING id`,
          [scope.companyId, clientName, clientPhone || null, issuedCli.number]
        );
        cid = newClient.id;
        // Numbering back-link is now atomic with the client insert.
        await rawExecute(
          `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
          [cid, issuedCli.assignmentId]
        );
      } else {
        await rawExecute(
          `UPDATE clients SET classification = 'umrah_agent' WHERE id = $1 AND "companyId" = $2`,
          [clientId, scope.companyId]
        );
      }

      await rawExecute(
        `UPDATE umrah_sub_agents SET "clientId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
         WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL`,
        [cid, scope.userId, id, scope.companyId]
      );
      return cid;
    });

    const [row] = await rawQuery(
      `SELECT sa.*, c.name AS "clientName" FROM umrah_sub_agents sa
       LEFT JOIN clients c ON c.id = sa."clientId" AND c."companyId" = sa."companyId" AND c."deletedAt" IS NULL
       WHERE sa.id=$1 AND sa."companyId"=$2 AND sa."deletedAt" IS NULL`,
      [id, scope.companyId]
    );

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.agent.linked", entity: "umrah_sub_agents", entityId: id, details: JSON.stringify({ clientId: finalClientId, createNew: !!createNew }) }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    auditFromRequest(req, "update", "umrah_sub_agents", id, { after: { clientId: finalClientId } }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));

    res.json(row);
  } catch (err) { handleRouteError(err, res, "Link sub-agent"); }
});

router.post("/sub-agents/link-by-nusk", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(linkByNuskSchema.safeParse(req.body));
    const { nuskCode, clientId, reason } = parsed;
    const [existingClient] = await rawQuery<{ id: number }>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [clientId, scope.companyId]
    );
    if (!existingClient) throw new NotFoundError("العميل غير موجود أو لا ينتمي لهذه الشركة");
    // U-11 Phase 3b (#2080) — explicit-confirmation link from the
    // import wizard. Look up the matching sub-agent BEFORE the
    // UPDATE so the audit log captures `before.clientId` (a real
    // before/after pair) and so we have a concrete entityId to
    // attach to the event instead of the legacy `entityId: 0`.
    // If multiple sub-agents share the nuskCode under this tenant
    // (rare but legal in the current schema), we audit the first
    // one — the UPDATE still touches all matching rows for
    // backward compatibility.
    const [existingSubAgent] = await rawQuery<{ id: number; clientId: number | null }>(
      `SELECT id, "clientId" FROM umrah_sub_agents
        WHERE "companyId"=$1 AND "nuskCode"=$2 AND "deletedAt" IS NULL
        ORDER BY id LIMIT 1`,
      [scope.companyId, nuskCode]
    );
    if (!existingSubAgent) throw new NotFoundError("الوكيل الفرعي غير موجود أو لا ينتمي لهذه الشركة");
    const beforeClientId = existingSubAgent.clientId;
    const subAgentId = existingSubAgent.id;
    await rawExecute(
      `UPDATE umrah_sub_agents SET "clientId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
       WHERE "companyId"=$3 AND "nuskCode"=$4 AND "deletedAt" IS NULL`,
      [clientId, scope.userId, scope.companyId, nuskCode]
    );
    // U-11 Phase 3b — enriched audit. `before` carries the prior
    // clientId (often null in the import-wizard flow), `after`
    // carries the new linkage + the nuskCode that drove the match,
    // `reason` is the operator's free-text justification, and the
    // entity id is the real sub-agent row (no longer 0).
    auditFromRequest(req, "update", "umrah_sub_agents", subAgentId, {
      before: { clientId: beforeClientId },
      after: { nuskCode, clientId },
      reason,
    }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    // U-11 Phase 3b — enriched event. `source` flags this as the
    // explicit-confirmation path from the import wizard so
    // downstream consumers (notification rules, audit dashboards)
    // can distinguish it from the detail-page linker.
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "umrah.sub_agent.linked_by_nusk",
      entity: "umrah_sub_agents",
      entityId: subAgentId,
      details: JSON.stringify({
        nuskCode,
        clientId,
        beforeClientId,
        reason: reason ?? null,
        source: "import_wizard_explicit_confirmation",
      }),
    }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    res.json({ success: true, subAgentId, beforeClientId });
  } catch (err) { handleRouteError(err, res, "Link sub-agent by nusk"); }
});

router.post("/sub-agents/:id/link-client", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(linkClientSchema.safeParse(req.body));
    const { clientId } = parsed;
    const [existingClient] = await rawQuery<{ id: number }>(
      `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [clientId, scope.companyId]
    );
    if (!existingClient) throw new NotFoundError("العميل غير موجود أو لا ينتمي لهذه الشركة");
    await rawExecute(
      `UPDATE umrah_sub_agents SET "clientId"=$1, "updatedBy"=$2, "updatedAt"=NOW()
       WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL`,
      [clientId, scope.userId, id, scope.companyId]
    );
    const [row] = await rawQuery(`SELECT * FROM umrah_sub_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    auditFromRequest(req, "update", "umrah_sub_agents", id, { after: { clientId } }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.sub_agent.client_linked", entity: "umrah_sub_agents", entityId: id, details: JSON.stringify({ clientId }) }).catch((e) => logger.error(e, "umrah-sub-agents background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Link sub-agent client"); }
});

export default router;
