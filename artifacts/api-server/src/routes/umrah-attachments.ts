// ─────────────────────────────────────────────────────────────────────────────
// umrah-attachments.ts — UMRAH ATTACHMENTS (U-07 Phase 10)
//
// Routes carved verbatim from umrah-entities.ts into this dedicated sub-router.
// Mounted via `router.use(attachmentsRouter)` in umrah-entities.ts so the API
// surface stays identical (paths still resolve at /umrah/attachments...).
//
// Pure code move — handlers, schemas, RBAC are carried over VERBATIM
// (no behaviour change). Audit calls converted to auditFromRequest per the
// IGOC ratchet (auditIgocContextCoverageRatchet.test.ts) — new route files
// must not use the legacy direct audit helper.
//
// Polymorphic document storage for umrah entities. Since migration 237
// (DOC-VIOLATION unification) attachments live in the shared documents +
// document_entity_links store, namespaced as 'umrah_<entityType>'. No ledger
// posting. `documents` is not a DOMAIN_TABLES-owned table, so these writes are
// not cross-domain violations (verbatim-preserved from the parent).
//
// Routes owned here:
//   GET    /attachments
//   POST   /attachments
//   DELETE /attachments/:id
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ============================================================================
// ATTACHMENTS — polymorphic document storage for umrah entities (#4)
// ============================================================================

const ATTACH_ENTITY_TYPES = ["mutamer","sub_agent","group","agent","nusk_invoice","season","sales_invoice","violation"] as const;
const ATTACH_TYPES = ["passport","visa","contract","nusk_file","identity","transfer_receipt","other"] as const;

const createAttachmentSchema = z.object({
  entityType: z.enum(ATTACH_ENTITY_TYPES),
  entityId: z.number().int().positive(),
  type: z.enum(ATTACH_TYPES),
  title: z.string().min(1).max(255),
  notes: z.string().optional(),
  fileUrl: z.string().url().max(2000).optional(),
  storageKey: z.string().max(500).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  mimeType: z.string().max(120).optional(),
});

// Map entityType → table for ownership verification. Keeps the route from
// trusting arbitrary entityIds — every attachment must point at a row the
// caller's company actually owns.
const ATTACH_OWNER_TABLE: Record<string, string> = {
  mutamer:        "umrah_pilgrims",
  sub_agent:      "umrah_sub_agents",
  group:          "umrah_groups",
  agent:          "umrah_agents",
  nusk_invoice:   "umrah_nusk_invoices",
  season:         "umrah_seasons",
  sales_invoice:  "umrah_sales_invoices",
  violation:      "umrah_violations",
};

async function assertAttachmentOwner(companyId: number, entityType: string, entityId: number): Promise<void> {
  const table = ATTACH_OWNER_TABLE[entityType];
  if (!table) throw new ValidationError("نوع كيان غير مدعوم", { field: "entityType" });
  const safeTable = table.replace(/[^a-zA-Z0-9_]/g, "");
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT id FROM "${safeTable}" WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
    [entityId, companyId]
  );
  if (!row) throw new NotFoundError("الكيان المرفق به غير موجود أو محذوف");
}

router.get("/attachments", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId, type } = req.query as Record<string, string | undefined>;
    // DOC-VIOLATION unification (migration 237): umrah attachments now live in
    // the shared documents + document_entity_links store. The polymorphic owner
    // is namespaced as 'umrah_<entityType>' in the link table; type → category,
    // notes → description. Response shape is preserved (entityType stripped back
    // to the umrah-local value) so the umrah attachments panel is unchanged.
    let where = `d."companyId" = $1 AND d."deletedAt" IS NULL AND del."entityType" LIKE 'umrah\\_%'`;
    const params: unknown[] = [scope.companyId];
    if (entityType) { params.push(`umrah_${entityType}`); where += ` AND del."entityType" = $${params.length}`; }
    if (entityId)   { params.push(Number(entityId)); where += ` AND del."entityId" = $${params.length}`; }
    if (type)       { params.push(type); where += ` AND d.category = $${params.length}`; }
    const docs = await rawQuery<Record<string, unknown>>(
      `SELECT d.id, del."entityType" AS "linkEntityType", del."entityId" AS "entityId",
              d.category AS type, d.title, d.description AS notes, d."fileUrl", d."storageKey",
              d."fileSize", d."mimeType", d."uploadedBy", d."createdAt"
         FROM documents d
         JOIN document_entity_links del ON del."documentId" = d.id
        WHERE ${where}
        ORDER BY d."createdAt" DESC
        LIMIT 500`,
      params
    );
    const rows = docs.map((d) => ({
      id: d.id,
      entityType: String(d.linkEntityType).replace(/^umrah_/, ""),
      entityId: d.entityId,
      type: d.type,
      title: d.title,
      notes: d.notes,
      fileUrl: d.fileUrl,
      storageKey: d.storageKey,
      fileSize: d.fileSize,
      mimeType: d.mimeType,
      uploadedBy: d.uploadedBy,
      createdAt: d.createdAt,
    }));
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List attachments"); }
});

router.post("/attachments", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(createAttachmentSchema.safeParse(req.body));
    await assertAttachmentOwner(scope.companyId, body.entityType, body.entityId);

    // DOC-VIOLATION unification (migration 237): write to the shared documents
    // store (+ document_entity_links) instead of the per-track umrah_attachments
    // table. type → category, notes → description, owner namespaced as
    // 'umrah_<entityType>'. Atomic so a document is never left without its link.
    let newId!: number;
    await withTransaction(async (client) => {
      const r = await client.query(
        `INSERT INTO documents
           (title, description, category, "fileName", "fileUrl", "storageKey",
            "fileSize", "mimeType", status, "currentVersion", "uploadedBy", "companyId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',1,$9,$10) RETURNING id`,
        [
          body.title, body.notes || null, body.type, body.title,
          body.fileUrl || null, body.storageKey || null,
          body.fileSize ?? null, body.mimeType || null,
          scope.userId, scope.companyId,
        ]
      );
      newId = r.rows[0].id;
      await client.query(
        `INSERT INTO document_entity_links ("documentId", "entityType", "entityId")
         VALUES ($1, $2, $3) ON CONFLICT ("documentId", "entityType", "entityId") DO NOTHING`,
        [newId, `umrah_${body.entityType}`, body.entityId]
      );
    });
    const row = { id: newId };

    auditFromRequest(req, "create", "umrah_attachments", row.id, {
      after: { entityType: body.entityType, entityId: body.entityId, type: body.type, title: body.title },
    }).catch((e) => logger.error(e, "umrah attachments bg"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "umrah.attachment.created", entity: "umrah_attachments", entityId: row.id,
      details: JSON.stringify({ entityType: body.entityType, entityId: body.entityId, type: body.type }),
    }).catch((e) => logger.error(e, "umrah attachments bg"));

    res.status(201).json({ id: row.id });
  } catch (err) { handleRouteError(err, res, "Create attachment"); }
});

router.delete("/attachments/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // DOC-VIOLATION unification (migration 237): the id is now a documents.id.
    // Only allow deleting documents that belong to this company AND are linked
    // to an umrah owner (entityType LIKE 'umrah\_%') so this endpoint can't be
    // used to delete arbitrary documents.
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT d.id FROM documents d
         JOIN document_entity_links del ON del."documentId" = d.id
        WHERE d.id=$1 AND d."companyId"=$2 AND d."deletedAt" IS NULL
          AND del."entityType" LIKE 'umrah\\_%'
        LIMIT 1`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المرفق غير موجود");
    await rawExecute(
      `UPDATE documents SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    auditFromRequest(req, "delete", "umrah_attachments", id, {}).catch((e) => logger.error(e, "umrah attachments bg"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.attachment.deleted", entity: "umrah_attachments", entityId: id, details: "{}" }).catch((e) => logger.error(e, "umrah attachments bg"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete attachment"); }
});

export default router;
