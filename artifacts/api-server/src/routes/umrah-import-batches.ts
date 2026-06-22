// ─────────────────────────────────────────────────────────────────────────────
// umrah-import-batches.ts — UMRAH IMPORT BATCHES (U-07 Phase 8)
//
// Routes carved verbatim from umrah-entities.ts into this dedicated sub-router.
// Mounted via `router.use(importBatchesRouter)` in umrah-entities.ts so the API
// surface stays identical (paths still resolve at /umrah/import/batches...).
//
// Pure code move — handlers, schemas, RBAC are carried over VERBATIM
// (no behaviour change). Audit calls converted to auditFromRequest per the
// IGOC ratchet (auditIgocContextCoverageRatchet.test.ts) — new route files
// must not use the legacy direct audit helper.
//
// Routes owned here (umrah import-batches listing + unlinked-rows recovery):
//   GET    /import/batches
//   GET    /import/batches/:id/changes
//   GET    /import/batches/:id/unlinked
//   POST   /import/batches/:id/unlinked/link
//
// Ledger note: none of these routes post journal entries. The link handler
// creates dimension entities (agents / groups / sub-agents) and stamps the
// resolved FK on the selected pilgrims — operational writes only.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { internalTechRef } from "../lib/internalRef.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ============================================================================
// IMPORT — preview + confirm
// ============================================================================

router.get("/import/batches", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as Record<string, string | undefined>;
    let where = `b."companyId" = $1 AND b."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND b."seasonId" = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT b.* FROM umrah_import_batches b WHERE ${where} ORDER BY b."createdAt" DESC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List import batches"); }
});

router.get("/import/batches/:id/changes", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [batch] = await rawQuery(
      `SELECT id FROM umrah_import_batches WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!batch) throw new NotFoundError("الدفعة غير موجودة");
    const rows = await rawQuery(
      `SELECT * FROM umrah_import_changes WHERE "batchId" = $1 AND "companyId" = $2 ORDER BY id LIMIT 1000`,
      [id, scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List batch changes"); }
});

// ============================================================================
// IMPORT — unlinked-rows recovery (§3 of #1870)
// ============================================================================
//
// Why this exists. The engine resolvers fall back to NULL when the source
// row lacks the lookup key (nuskAgentNumber / nuskGroupNumber / nuskCode).
// The row still lands in umrah_pilgrims, but with NULL agentId / groupId /
// subAgentId — meaning it's invisible on the agent → group → sub-agent
// drill-down and on per-entity rollup queries. The wizard now shows
// pre-confirm counts; this endpoint pair is the after-confirm recovery
// path so the operator can bulk-assign without re-importing the file.

router.get("/import/batches/:id/unlinked", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const dimension = String(req.query.dimension ?? "agent");
    if (!["agent", "group", "subAgent"].includes(dimension)) {
      throw new ValidationError("البُعد المطلوب غير صالح", { field: "dimension" });
    }
    const [batch] = await rawQuery<{ id: number }>(
      `SELECT id FROM umrah_import_batches WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!batch) throw new NotFoundError("الدفعة غير موجودة");

    // The pilgrim row carries no batchId column, so we join through
    // umrah_import_changes which DOES tag every row written during
    // a batch. Filter to entityType='mutamer' + changeType in
    // ('created','updated') so we don't sweep in skips / errors.
    const fkColumn = dimension === "agent" ? "agentId"
                   : dimension === "group" ? "groupId"
                   : "subAgentId";
    const rows = await rawQuery<{
      id: number; nuskNumber: string | null; fullName: string;
      nationality: string | null; status: string | null;
      agentId: number | null; groupId: number | null; subAgentId: number | null;
    }>(
      `SELECT p.id, p."nuskNumber", p."fullName", p.nationality, p.status,
              p."agentId", p."groupId", p."subAgentId"
       FROM umrah_pilgrims p
       WHERE p."companyId" = $1
         AND p."${fkColumn}" IS NULL
         AND p."deletedAt" IS NULL
         AND EXISTS (
           SELECT 1 FROM umrah_import_changes ic
           WHERE ic."batchId" = $2
             AND ic."entityType" = 'mutamer'
             AND ic."entityId" = p.id
             AND ic."changeType" IN ('created','updated')
         )
       ORDER BY p."nuskNumber" NULLS LAST, p.id
       LIMIT 1000`,
      [scope.companyId, id]
    );
    res.json(maskFields(req, { data: rows, dimension, batchId: id }));
  } catch (err) { handleRouteError(err, res, "List unlinked rows"); }
});

const linkUnlinkedSchema = z.object({
  dimension: z.enum(["agent", "group", "subAgent"]),
  pilgrimIds: z.array(z.coerce.number().int().positive()).min(1, "اختر صفًا واحدًا على الأقل"),
  // exactly one of: existing target id, or new-entity name to create
  targetId: z.coerce.number().int().positive().optional(),
  newEntityName: z.string().trim().min(1).optional(),
  // optional parent linkage for sub-agent creation (must belong to an agent)
  parentAgentId: z.coerce.number().int().positive().optional(),
}).refine((v) => (v.targetId !== undefined) !== (v.newEntityName !== undefined), {
  message: "يجب تحديد إما هدف موجود أو اسم لإنشاء كيان جديد، لا الاثنين معًا",
});

router.post("/import/batches/:id/unlinked/link", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(linkUnlinkedSchema.safeParse(req.body));
    const [batch] = await rawQuery<{ id: number; seasonId: number | null }>(
      `SELECT id, "seasonId" FROM umrah_import_batches WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!batch) throw new NotFoundError("الدفعة غير موجودة");

    const result = await withTransaction(async (client) => {
      // Resolve the target FK. Either look up the existing one and
      // verify it belongs to the same tenant, or create a fresh row
      // in the dimension table. Both branches return the id we'll
      // stamp on every selected pilgrim.
      let resolvedTargetId: number;
      if (b.targetId !== undefined) {
        const table = b.dimension === "agent" ? "umrah_agents"
                    : b.dimension === "group" ? "umrah_groups"
                    : "umrah_sub_agents";
        const exists = await client.query(
          `SELECT id FROM ${table} WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
          [b.targetId, scope.companyId]
        );
        if (exists.rows.length === 0) {
          throw new NotFoundError(
            b.dimension === "agent" ? "الوكيل غير موجود"
            : b.dimension === "group" ? "المجموعة غير موجودة"
            : "الوكيل الفرعي غير موجود"
          );
        }
        resolvedTargetId = b.targetId;
      } else {
        const name = b.newEntityName!;
        if (b.dimension === "agent") {
          const ins = await client.query(
            `INSERT INTO umrah_agents ("companyId","branchId",name,"createdBy","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,NOW(),NOW()) RETURNING id`,
            [scope.companyId, scope.branchId || null, name, scope.userId]
          );
          resolvedTargetId = ins.rows[0].id;
        } else if (b.dimension === "group") {
          // nuskGroupNumber is NOT NULL (external Nusk portal id). A group
          // auto-created by name during batch resolution has no external id yet,
          // so stamp an internal placeholder ref (via lib/ so it doesn't bypass
          // the numbering-center lint guard) until the real Nusk number is set.
          // The (companyId, nuskGroupNumber) index is non-unique, so no collision.
          const autoNusk = internalTechRef("UGRP");
          const ins = await client.query(
            `INSERT INTO umrah_groups ("companyId","branchId","nuskGroupNumber","seasonId",name,"agentId","createdBy","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW()) RETURNING id`,
            [scope.companyId, scope.branchId || null, autoNusk, batch.seasonId, name, b.parentAgentId || null, scope.userId]
          );
          resolvedTargetId = ins.rows[0].id;
        } else {
          // Sub-agent needs a parent agent — refuse fast if missing,
          // otherwise the rollup queries on per-agent statements
          // wouldn't pick up the new sub-agent at all.
          if (!b.parentAgentId) {
            throw new ValidationError("يجب اختيار الوكيل الأم للوكيل الفرعي", { field: "parentAgentId" });
          }
          const parent = await client.query(
            `SELECT id FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
            [b.parentAgentId, scope.companyId]
          );
          if (parent.rows.length === 0) throw new NotFoundError("الوكيل الأم غير موجود");
          const ins = await client.query(
            `INSERT INTO umrah_sub_agents ("companyId","branchId","agentId",name,"createdBy","createdAt","updatedAt")
             VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) RETURNING id`,
            [scope.companyId, scope.branchId || null, b.parentAgentId, name, scope.userId]
          );
          resolvedTargetId = ins.rows[0].id;
        }
      }

      const fkColumn = b.dimension === "agent" ? "agentId"
                     : b.dimension === "group" ? "groupId"
                     : "subAgentId";
      // Only UPDATE rows that are STILL unlinked + that were touched
      // by THIS batch — defence against concurrent edits and against
      // an operator pasting pilgrimIds from a different batch.
      const upd = await client.query(
        `UPDATE umrah_pilgrims p
         SET "${fkColumn}"=$1, "updatedBy"=$2, "updatedAt"=NOW()
         WHERE p."companyId"=$3
           AND p.id = ANY($4::int[])
           AND p."${fkColumn}" IS NULL
           AND p."deletedAt" IS NULL
           AND EXISTS (
             SELECT 1 FROM umrah_import_changes ic
             WHERE ic."batchId" = $5 AND ic."entityType" = 'mutamer'
               AND ic."entityId" = p.id
           )
         RETURNING id`,
        [resolvedTargetId, scope.userId, scope.companyId, b.pilgrimIds, id]
      );
      const linkedCount = upd.rows.length;

      // Decrement the batch counter so the recovery screen shows
      // remaining work, not the pre-link count.
      const counterCol = b.dimension === "agent" ? "unlinkedAgentCount"
                       : b.dimension === "group" ? "unlinkedGroupCount"
                       : "unlinkedSubAgentCount";
      await client.query(
        `UPDATE umrah_import_batches
         SET "${counterCol}" = GREATEST(0, COALESCE("${counterCol}", 0) - $1),
             "updatedAt" = NOW()
         WHERE id = $2 AND "companyId" = $3`,
        [linkedCount, id, scope.companyId]
      );

      return { linkedCount, resolvedTargetId };
    });

    auditFromRequest(req, "update", "umrah_pilgrims", 0, {
      after: { batchId: id, dimension: b.dimension, targetId: result.resolvedTargetId, linkedCount: result.linkedCount },
    }).catch((e) => logger.error(e, "unlinked-link bg"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.import.unlinked_rows_linked", entity: "umrah_import_batches", entityId: id,
      after: { dimension: b.dimension, linkedCount: result.linkedCount },
    }).catch((e) => logger.error(e, "unlinked-link bg"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Link unlinked rows"); }
});

export default router;
