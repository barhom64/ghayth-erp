// ─────────────────────────────────────────────────────────────────────────────
// umrah-nusk-invoices.ts — NUSK INVOICES (U-07 Phase 19)
//
// Routes carved VERBATIM out of umrah-entities.ts into this dedicated
// sub-router. Mounted via `router.use(nuskInvoicesRouter)` in umrah-entities.ts
// so the API surface stays identical (paths still resolve at
// /umrah/nusk-invoices...).
//
// LEDGER-TOUCHING — but the GL posting logic is NOT here. The AP / refund
// journal entries are produced entirely by the `postNuskJournalEntries` ENGINE
// (lib/umrahImportEngine.ts), invoked byte-identically inside `withTransaction`
// on POST + PATCH. This file does not touch the engine. Per the constitution
// (GL + account-mapping helpers stay inside engines, not routes), the carve is a
// pure route move; the journal contract is pinned by
// umrahNuskInvoicesSplitSmoke.test.ts (§F asserts the engine-invocation shape +
// the withTransaction wrapping are preserved).
//
// Audit calls converted to auditFromRequest per the IGOC ratchet
// (auditIgocContextCoverageRatchet.test.ts) — new route files must not use the
// legacy direct createAuditLog helper.
//
// Routes owned here:
//   GET    /nusk-invoices
//   GET    /nusk-invoices/:id
//   POST   /nusk-invoices        (withTransaction + postNuskJournalEntries)
//   PATCH  /nusk-invoices/:id     (withTransaction + postNuskJournalEntries)
//   DELETE /nusk-invoices/:id
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { emitEvent, auditFromRequest } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { postNuskJournalEntries } from "../lib/umrahImportEngine.js";

const router = Router();

router.get("/nusk-invoices", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, groupId } = req.query as Record<string, string | undefined>;
    let where = `ni."companyId" = $1 AND ni."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (groupId) { params.push(groupId); where += ` AND ni."groupId" = $${params.length}`; }
    if (seasonId) {
      params.push(seasonId);
      where += ` AND ni."groupId" IN (SELECT id FROM umrah_groups WHERE "seasonId" = $${params.length})`;
    }
    const rows = await rawQuery(
      `SELECT ni.*, a.name AS "agentName", sa.name AS "subAgentName", g."nuskGroupNumber"
       FROM umrah_nusk_invoices ni
       LEFT JOIN umrah_agents a ON ni."agentId" = a.id
       LEFT JOIN umrah_sub_agents sa ON ni."subAgentId" = sa.id
       LEFT JOIN umrah_groups g ON ni."groupId" = g.id
       WHERE ${where}
       ORDER BY ni."createdAt" DESC
       LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List nusk invoices"); }
});

router.get("/nusk-invoices/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT ni.*, a.name AS "agentName", sa.name AS "subAgentName", g."nuskGroupNumber"
       FROM umrah_nusk_invoices ni
       LEFT JOIN umrah_agents a ON ni."agentId" = a.id
       LEFT JOIN umrah_sub_agents sa ON ni."subAgentId" = sa.id
       LEFT JOIN umrah_groups g ON ni."groupId" = g.id
       WHERE ni.id = $1 AND ni."companyId" = $2 AND ni."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "فاتورة نسك غير موجودة" }); return; }
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Get nusk invoice"); }
});

const createNuskInvoiceSchema = z.object({
  nuskInvoiceNumber: z.string().min(1, "رقم فاتورة نسك مطلوب"),
  agentId: z.coerce.number({ required_error: "الوكيل مطلوب" }),
  subAgentId: z.coerce.number().optional(),
  groupId: z.coerce.number().optional(),
  mutamerCount: z.coerce.number().int().min(0).default(0),
  groundServices: z.coerce.number().default(0),
  visaFees: z.coerce.number().default(0),
  insuranceFees: z.coerce.number().default(0),
  transportTotal: z.coerce.number().default(0),
  hotelTotal: z.coerce.number().default(0),
  additionalServices: z.coerce.number().default(0),
  netCost: z.coerce.number().default(0),
  totalAmount: z.coerce.number().default(0),
  nuskStatus: z.enum(["pending", "paid", "in_progress", "expired", "refunded", "cancelled"]).default("pending"),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateNuskInvoiceSchema = z.object({
  mutamerCount: z.coerce.number().int().min(0).optional(),
  groundServices: z.coerce.number().optional(),
  visaFees: z.coerce.number().optional(),
  insuranceFees: z.coerce.number().optional(),
  transportTotal: z.coerce.number().optional(),
  hotelTotal: z.coerce.number().optional(),
  additionalServices: z.coerce.number().optional(),
  netCost: z.coerce.number().optional(),
  totalAmount: z.coerce.number().optional(),
  refundAmount: z.coerce.number().optional(),
  nuskStatus: z.enum(["pending", "paid", "in_progress", "expired", "refunded", "cancelled"]).optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
});

router.post("/nusk-invoices", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createNuskInvoiceSchema.safeParse(req.body));
    const [dup] = await rawQuery(
      `SELECT id FROM umrah_nusk_invoices WHERE "nuskInvoiceNumber" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [b.nuskInvoiceNumber, scope.companyId]
    );
    if (dup) throw new ConflictError("رقم فاتورة نسك مكرر");
    // Single transaction: invoice row + AP journal entry must land
    // together. The legacy code wrote the row only — so the NUSK
    // obligation (DR 5201 cost / CR 2101 AP) never posted, the
    // trial balance under-reported AP, and the reconciliation desk
    // couldn't match the NUSK supplier ledger. Mirrors what
    // confirmVouchersImport() does on every imported voucher.
    const created = await withTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO umrah_nusk_invoices ("companyId","branchId","nuskInvoiceNumber","agentId","subAgentId","groupId","mutamerCount",
         "groundServices","visaFees","insuranceFees","transportTotal","hotelTotal","additionalServices","netCost","totalAmount","nuskStatus","issueDate","expiryDate","createdBy")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [scope.companyId, scope.branchId || null, b.nuskInvoiceNumber, b.agentId, b.subAgentId || null, b.groupId || null, b.mutamerCount,
         b.groundServices, b.visaFees, b.insuranceFees, b.transportTotal, b.hotelTotal, b.additionalServices, b.netCost, b.totalAmount, b.nuskStatus,
         b.issueDate || null, b.expiryDate || null, scope.userId]
      );
      const row = res.rows[0];
      await postNuskJournalEntries(
        client,
        { companyId: scope.companyId, branchId: scope.branchId || 0, userId: scope.userId, seasonId: 0 },
        {
          nuskId: row.id,
          nuskInvoiceNumber: b.nuskInvoiceNumber,
          totalAmount: Number(b.totalAmount ?? 0),
          refundAmount: 0,
          nuskStatus: String(b.nuskStatus ?? "pending").toLowerCase(),
          existingApJeId: null,
          existingRefundJeId: null,
        },
      );
      return row;
    });
    auditFromRequest(req, "create", "umrah_nusk_invoices", created?.id ?? 0, { after: { nuskInvoiceNumber: b.nuskInvoiceNumber } }).catch((e) => logger.error(e, "nusk bg"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.nusk_invoice.created", entity: "umrah_nusk_invoices", entityId: created?.id }).catch((e) => logger.error(e, "nusk bg"));
    res.status(201).json(created);
  } catch (err) { handleRouteError(err, res, "Create nusk invoice"); }
});

router.patch("/nusk-invoices/:id", authorize({ feature: "umrah", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateNuskInvoiceSchema.safeParse(req.body));
    const [existing] = await rawQuery<{
      id: number; nuskStatus: string; nuskInvoiceNumber: string;
      totalAmount: number | string | null; refundAmount: number | string | null;
      purchaseInvoiceId: number | null; journalEntryId: number | null;
    }>(
      `SELECT id, "nuskStatus", "nuskInvoiceNumber", "totalAmount", "refundAmount",
              "purchaseInvoiceId", "journalEntryId"
       FROM umrah_nusk_invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "فاتورة نسك غير موجودة" }); return; }
    if (existing.nuskStatus === "paid" && b.nuskStatus !== "refunded") {
      throw new ConflictError("لا يمكن تعديل فاتورة نسك مدفوعة");
    }
    const fields = ["mutamerCount","groundServices","visaFees","insuranceFees","transportTotal","hotelTotal","additionalServices","netCost","totalAmount","refundAmount","nuskStatus","issueDate","expiryDate"] as const;
    // Single transaction: UPDATE row + (idempotent) re-evaluation
    // of the AP / refund-reversal journal entries. The legacy code
    // updated the row only — so transitioning a nusk invoice to
    // 'refunded' never posted the DR-AP / CR-cost reversal, the
    // trial balance over-reported AP, and finance had to manually
    // book the entry every refund. postNuskJournalEntries is
    // idempotent via sourceKey + existing-id guards: it backfills
    // legacy AP-less rows on first update AND posts the reversal
    // the first time status flips to 'refunded'. Mirrors the
    // confirmVouchersImport() update path.
    const updated = await withTransaction(async (client) => {
      const params: unknown[] = [];
      const sets: string[] = [];
      for (const key of fields) {
        // as-any-reason: justified-pragmatic - dynamic key access on Zod-parsed body whose generic does not expose indexer; key is bound to const whitelist (13 hardcoded columns)
        if ((b as any)[key] !== undefined) { params.push((b as any)[key]); sets.push(`"${key}"=$${params.length}`); }
      }
      let row = existing;
      if (sets.length > 0) {
        params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
        sets.push(`"updatedAt"=NOW()`);
        params.push(id); params.push(scope.companyId);
        const upd = await client.query(
          `UPDATE umrah_nusk_invoices SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL RETURNING *`,
          params
        );
        row = upd.rows[0];
      }
      await postNuskJournalEntries(
        client,
        { companyId: scope.companyId, branchId: scope.branchId || 0, userId: scope.userId, seasonId: 0 },
        {
          nuskId: row.id,
          nuskInvoiceNumber: String(row.nuskInvoiceNumber),
          totalAmount: Number(b.totalAmount ?? row.totalAmount ?? 0),
          refundAmount: Number(b.refundAmount ?? row.refundAmount ?? 0),
          nuskStatus: String(b.nuskStatus ?? row.nuskStatus ?? "pending").toLowerCase(),
          existingApJeId: row.purchaseInvoiceId ?? null,
          existingRefundJeId: row.journalEntryId ?? null,
        },
      );
      return row;
    });
    auditFromRequest(req, "update", "umrah_nusk_invoices", id, { after: b }).catch((e) => logger.error(e, "nusk bg"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.nusk_invoice.updated", entity: "umrah_nusk_invoices", entityId: id }).catch((e) => logger.error(e, "nusk bg"));
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "Update nusk invoice"); }
});

router.delete("/nusk-invoices/:id", authorize({ feature: "umrah", action: "delete" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number; nuskStatus: string }>(
      `SELECT id, "nuskStatus" FROM umrah_nusk_invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "فاتورة نسك غير موجودة" }); return; }
    if (existing.nuskStatus === "paid") throw new ConflictError("لا يمكن حذف فاتورة نسك مدفوعة");
    await rawExecute(
      `UPDATE umrah_nusk_invoices SET "deletedAt"=NOW(), "updatedBy"=$1 WHERE id=$2 AND "companyId"=$3`,
      [scope.userId, id, scope.companyId]
    );
    auditFromRequest(req, "delete", "umrah_nusk_invoices", id).catch((e) => logger.error(e, "nusk bg"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.nusk_invoice.deleted", entity: "umrah_nusk_invoices", entityId: id }).catch((e) => logger.error(e, "nusk bg"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete nusk invoice"); }
});

export default router;
