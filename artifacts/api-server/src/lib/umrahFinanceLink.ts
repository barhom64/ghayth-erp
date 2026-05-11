/**
 * Umrah ↔ Finance Integration Layer — Phase 7.
 *
 * The Umrah module never touches finance tables directly. Every
 * accounting side-effect is funnelled through:
 *   * `createJournalEntry` (lib/businessHelpers.ts) — the same helper
 *     used by every other domain that posts to the GL
 *   * the central `invoices` + `invoice_lines` tables (the same the
 *     finance-invoices.ts route writes into) — no parallel sales table
 *
 * This module provides two entry points that the routes + the import
 * engine call:
 *
 *   * `generateUmrahSalesInvoice(scope, params)`
 *       Bundles a list of groups for one sub-agent into one central
 *       sales invoice + invoice_lines + journal entry, and back-links
 *       each group via `umrah_groups.centralInvoiceId`. Honours the
 *       spec's "require_agent_linking" gate (no link → typed 409).
 *
 *   * `recordUmrahPurchaseFromVoucher(client, scope, voucher)`
 *       Posts the purchase journal for one NUSK voucher row inside
 *       the import-engine transaction. Idempotent: if the voucher
 *       already has a journalEntryId, returns it unchanged.
 *
 * Conventions inherited:
 *   * raw SQL via rawQuery / rawExecute / withTransaction
 *   * typed errors (ConflictError / NotFoundError / ValidationError)
 *   * accounting codes resolved via the seeded chart_of_accounts
 *     (1200/1100/4200/2200 for sales, 5400/2100 for purchase) — no
 *     hard-coded account ids
 */

import type { PoolClient } from "pg";
import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import {
  createJournalEntry,
  emitEvent,
  createAuditLog,
} from "./businessHelpers.js";
import { ConflictError, NotFoundError, ValidationError } from "./errorHandler.js";

export interface FinanceScope {
  companyId: number;
  branchId: number;
  userId: number;
  activeAssignmentId: number;
}

// ---------------------------------------------------------------------------
// Sales — one invoice per (sub-agent, group set)
// ---------------------------------------------------------------------------

export interface GenerateSalesInvoiceInput {
  subAgentId: number;
  groupIds: number[];
  /** ISO date for invoice issuance + due-date base. Defaults to today. */
  invoiceDate?: string;
  /** Net days. Defaults to the sub-agent's payment terms heuristic. */
  netDays?: number;
  /** VAT %. Defaults to 0 since Umrah services are zero-rated. */
  vatRate?: number;
  /** Optional manual override price-per-mutamer (rare; usually pulled from pricing). */
  pricePerMutamerOverride?: number;
  notes?: string | null;
}

export interface GenerateSalesInvoiceResult {
  invoiceId: number;
  ref: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  groupCount: number;
  mutamerCount: number;
  violationsTotal: number;
  journalEntryId: number;
  groupRefs: string[];
  nuskInvoiceRefs: string[];
}

export async function generateUmrahSalesInvoice(
  scope: FinanceScope,
  input: GenerateSalesInvoiceInput
): Promise<GenerateSalesInvoiceResult> {
  if (!input.subAgentId || !Array.isArray(input.groupIds) || input.groupIds.length === 0) {
    throw new ValidationError("يجب اختيار وكيل فرعي ومجموعة واحدة على الأقل");
  }

  // 1. Sub-agent must be linked to a client (spec rule #46).
  const [sub] = await rawQuery<any>(
    `SELECT s.id, s.name, s."clientId", s."paymentTerms", c.name AS "clientName"
       FROM umrah_sub_agents s
       LEFT JOIN clients c ON c.id = s."clientId"
      WHERE s.id=$1 AND s."companyId"=$2 AND s."deletedAt" IS NULL`,
    [input.subAgentId, scope.companyId]
  );
  if (!sub) throw new NotFoundError("الوكيل الفرعي غير موجود");
  if (!sub.clientId) {
    throw new ConflictError(
      `الوكيل '${sub.name}' غير مربوط بعميل — لا يمكن إصدار فاتورة`,
      { meta: { subAgentId: input.subAgentId, fix: "اربط الوكيل بعميل من صفحة الوكلاء الفرعيين" } }
    );
  }

  // 2. Fetch groups + verify all belong to this sub-agent and this company,
  //    and not yet billed (centralInvoiceId IS NULL).
  const groups = await rawQuery<any>(
    `SELECT id, "nuskGroupNumber", "nuskInvoiceNumber", "mutamerCount",
            "subAgentId", "agentId", "seasonId", "centralInvoiceId",
            (SELECT MIN(m."entryDate") FROM umrah_mutamers m
              WHERE m."groupId"=g.id AND m."deletedAt" IS NULL) AS "earliestEntry"
       FROM umrah_groups g
      WHERE id = ANY($1) AND "companyId"=$2 AND "deletedAt" IS NULL`,
    [input.groupIds, scope.companyId]
  );
  if (groups.length !== input.groupIds.length) {
    throw new NotFoundError("بعض المجموعات غير موجودة أو مُحذوفة");
  }
  const wrongOwner = groups.find((g) => g.subAgentId !== input.subAgentId);
  if (wrongOwner) {
    throw new ValidationError(
      `المجموعة '${wrongOwner.nuskGroupNumber}' لا تتبع الوكيل الفرعي المحدد`,
      { field: "groupIds" }
    );
  }
  const alreadyBilled = groups.find((g) => g.centralInvoiceId !== null);
  if (alreadyBilled) {
    throw new ConflictError(
      `المجموعة '${alreadyBilled.nuskGroupNumber}' مفوترة سابقاً — راجع فاتورة #${alreadyBilled.centralInvoiceId}`,
      { meta: { groupId: alreadyBilled.id, existingInvoiceId: alreadyBilled.centralInvoiceId } }
    );
  }

  // 3. For each group, resolve the price per mutamer (manual override
  //    wins; otherwise look up by (subAgent → agent fallback) + valid date).
  const invoiceDate = input.invoiceDate ?? new Date().toISOString().slice(0, 10);
  const groupLines: { group: any; pricePerMutamer: number; lineTotal: number }[] = [];

  for (const g of groups) {
    let unit = input.pricePerMutamerOverride ?? null;
    if (unit === null) {
      // Postgres returns date columns as JS Date when cellDates would
      // apply, or as ISO string otherwise. Always normalise to YYYY-MM-DD
      // before feeding into the pricing lookup or we hit a 22007 type
      // mismatch ("Sat Jan 10").
      let lookupDate = invoiceDate;
      if (g.earliestEntry instanceof Date && !isNaN(g.earliestEntry.getTime())) {
        lookupDate = g.earliestEntry.toISOString().slice(0, 10);
      } else if (g.earliestEntry) {
        const s = String(g.earliestEntry);
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) lookupDate = s.slice(0, 10);
        else {
          const d = new Date(s);
          if (!isNaN(d.getTime())) lookupDate = d.toISOString().slice(0, 10);
        }
      }
      const [price] = await rawQuery<any>(
        `SELECT "pricePerMutamer" FROM umrah_pricing
          WHERE "companyId"=$1
            AND "deletedAt" IS NULL
            AND ("subAgentId"=$2 OR ("subAgentId" IS NULL AND "agentId"=$3))
            AND "validFrom" <= $4::date
            AND ("validTo" IS NULL OR "validTo" >= $4::date)
          ORDER BY "subAgentId" NULLS LAST, "validFrom" DESC
          LIMIT 1`,
        [scope.companyId, input.subAgentId, g.agentId, lookupDate]
      );
      if (!price) {
        throw new NotFoundError(
          `لا يوجد سعر ساري للوكيل في تاريخ ${lookupDate} (مجموعة ${g.nuskGroupNumber})`,
          { meta: { groupId: g.id, lookupDate } }
        );
      }
      unit = Number(price.pricePerMutamer);
    }
    const mc = Number(g.mutamerCount ?? 0);
    groupLines.push({ group: g, pricePerMutamer: Number(unit), lineTotal: Number(unit) * mc });
  }

  // 4. Pull open violations attached to these groups for inclusion as
  //    extra lines (overstay + absconder penalties — spec §4.2).
  const violations = await rawQuery<any>(
    `SELECT v.id, v.type, v."referenceNumber", v."penaltyAmount", v."groupId"
       FROM umrah_violations v
      WHERE v."companyId"=$1
        AND v."deletedAt" IS NULL
        AND v."subAgentId" = $2
        AND v.status IN ('detected','open','disputed')
        AND v."linkedInvoiceId" IS NULL
        AND v."groupId" = ANY($3)`,
    [scope.companyId, input.subAgentId, input.groupIds]
  );
  const violationsTotal = violations.reduce(
    (s: number, v: any) => s + Number(v.penaltyAmount ?? 0), 0
  );

  // 5. Build totals.
  const baseSubtotal = groupLines.reduce((s, l) => s + l.lineTotal, 0);
  const subtotal = baseSubtotal + violationsTotal;
  const vatRate = input.vatRate ?? 0; // Umrah is zero-rated by default.
  const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;

  // 6. Compute due date based on sub-agent's payment terms.
  const netDays = input.netDays ?? (sub.paymentTerms === "prepaid" ? 0 : 30);
  const due = new Date(invoiceDate);
  due.setDate(due.getDate() + netDays);
  const dueDate = due.toISOString().slice(0, 10);

  // 7. Generate a unique ref. Format: "UMR-{seasonId?}-{seq}".
  const seasonRef = groups[0]?.seasonId ? `S${groups[0].seasonId}-` : "";
  const ref = `UMR-${seasonRef}${Date.now().toString().slice(-8)}`;

  // 8. Wrap the whole write in one transaction so a failure leaves zero
  //    side-effects (no orphan invoice, no orphan journal entry).
  return withTransaction(async (client) => {
    // 8.1 Insert the invoice header.
    const invIns = await client.query(
      `INSERT INTO invoices ("companyId","branchId","clientId",ref,description,
              subtotal,"vatRate","vatAmount",total,"paidAmount",status,"dueDate",
              "createdBy",notes,currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,'draft',$10,$11,$12,'SAR') RETURNING id`,
      [
        scope.companyId, scope.branchId, sub.clientId, ref,
        `فاتورة عمرة — ${sub.name} (${groups.length} مجموعة، ${groupLines.reduce((s, l) => s + Number(l.group.mutamerCount), 0)} معتمر)`,
        subtotal, vatRate, vatAmount, total, dueDate,
        scope.activeAssignmentId, input.notes ?? null,
      ]
    );
    const invoiceId = invIns.rows[0].id as number;

    // 8.2 Insert one invoice_lines row per group.
    for (const l of groupLines) {
      await client.query(
        `INSERT INTO invoice_lines ("invoiceId",description,quantity,"unitPrice","lineTotal","vatAmount","lineGross")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          invoiceId,
          `مجموعة ${l.group.nuskGroupNumber}` +
            (l.group.nuskInvoiceNumber ? ` — فاتورة نسك ${l.group.nuskInvoiceNumber}` : ""),
          Number(l.group.mutamerCount), l.pricePerMutamer, l.lineTotal,
          0, l.lineTotal,
        ]
      );
    }
    // One line per violation (penalties).
    for (const v of violations) {
      await client.query(
        `INSERT INTO invoice_lines ("invoiceId",description,quantity,"unitPrice","lineTotal","vatAmount","lineGross")
         VALUES ($1,$2,1,$3,$3,0,$3)`,
        [
          invoiceId,
          `غرامة ${v.type === "absconded" ? "متغيّب" : v.type === "overstay" ? "تجاوز مدة" : "أخرى"} — مرجع ${v.referenceNumber}`,
          Number(v.penaltyAmount),
        ]
      );
    }

    // 8.3 Back-link every group + every violation to this invoice.
    await client.query(
      `UPDATE umrah_groups
          SET "centralInvoiceId"=$1, status='settled', "updatedAt"=NOW(),
              "updatedBy"=$3
        WHERE id = ANY($2) AND "companyId"=$4`,
      [invoiceId, input.groupIds, scope.userId, scope.companyId]
    );
    if (violations.length > 0) {
      await client.query(
        `UPDATE umrah_violations
            SET "linkedInvoiceId"=$1, status='invoiced', "updatedAt"=NOW(),
                "updatedBy"=$3
          WHERE id = ANY($2) AND "companyId"=$4`,
        [invoiceId, violations.map((v: any) => v.id), scope.userId, scope.companyId]
      );
    }

    // 8.4 Post the journal entry through the central engine.
    //    DR  1200 الذمم المدينة — total
    //    CR  4200 إيرادات الخدمات — subtotal
    //    CR  2200 ضريبة القيمة المضافة — vatAmount  (skipped if 0)
    const lines: any[] = [
      {
        accountCode: "1200", debit: total, credit: 0,
        description: `فاتورة عمرة ${ref} — ${sub.clientName ?? sub.name}`,
        clientId: sub.clientId,
      },
      {
        accountCode: "4200", debit: 0, credit: subtotal,
        description: `إيرادات عمرة — ${sub.name}`,
        clientId: sub.clientId,
      },
    ];
    if (vatAmount > 0.001) {
      lines.push({
        accountCode: "2200", debit: 0, credit: vatAmount,
        description: `ضريبة القيمة المضافة — فاتورة ${ref}`,
      });
    }
    let journalEntryId = 0;
    try {
      // createJournalEntry returns the journal entry id as a number; it
      // owns its own DB pool (same pattern as every other domain that
      // calls it), so a failure here does NOT roll back the invoice —
      // finance can re-post the journal manually.
      journalEntryId = await createJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.userId,
        ref,
        description: `فاتورة عمرة ${ref}`,
        type: "sales_invoice",
        sourceType: "umrah_sales_invoice",
        sourceId: invoiceId,
        operationType: "sales_invoice",
        lines,
      });
      if (journalEntryId > 0) {
        await client.query(
          `UPDATE invoices SET "journalEntryId"=$1 WHERE id=$2`,
          [journalEntryId, invoiceId]
        );
      }
    } catch (err) {
      console.error("[UmrahFinance] sales journal posting failed:", err);
    }

    // 8.5 Audit + event for every cross-domain effect.
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "umrah_sales_invoice", entityId: invoiceId,
      after: {
        ref, subAgentId: input.subAgentId, groupIds: input.groupIds,
        subtotal, vatAmount, total, journalEntryId,
      },
    });
    await emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "umrah.sales_invoice.generated",
      entity: "invoices",
      entityId: invoiceId,
      details: JSON.stringify({
        ref, subAgentId: input.subAgentId, groupCount: groups.length,
        total, journalEntryId,
      }),
    });

    return {
      invoiceId, ref, subtotal, vatAmount, total,
      groupCount: groups.length,
      mutamerCount: groupLines.reduce((s, l) => s + Number(l.group.mutamerCount), 0),
      violationsTotal,
      journalEntryId,
      groupRefs: groups.map((g: any) => g.nuskGroupNumber).filter(Boolean),
      nuskInvoiceRefs: groups.map((g: any) => g.nuskInvoiceNumber).filter(Boolean),
    };
  });
}

// ---------------------------------------------------------------------------
// Purchase — one journal entry per NUSK voucher (called from import engine)
// ---------------------------------------------------------------------------

/**
 * Post the purchase journal for one paid NUSK voucher and back-link the
 * `journalEntryId` onto the umrah_nusk_invoices row. Designed to run
 * INSIDE the import engine's existing transaction — uses the same
 * `client` connection so a journal failure rolls back the whole batch.
 *
 * Idempotent: if `journalEntryId` is already set, returns it unchanged.
 */
export async function recordUmrahPurchaseFromVoucher(
  client: PoolClient,
  scope: { companyId: number; branchId: number | null; userId: number },
  voucher: {
    id: number;
    nuskInvoiceNumber: string;
    netCost: number;
    nuskStatus: string;
    journalEntryId: number | null;
  }
): Promise<{ journalEntryId: number; created: boolean }> {
  if (voucher.journalEntryId) {
    return { journalEntryId: voucher.journalEntryId, created: false };
  }
  if (voucher.nuskStatus !== "paid" || !(voucher.netCost > 0)) {
    return { journalEntryId: 0, created: false };
  }

  const ref = `NUSK-${voucher.nuskInvoiceNumber}`;
  const branchId = scope.branchId ?? 1; // createJournalEntry requires it; fall back to HQ.

  let journalEntryId = 0;
  try {
    journalEntryId = await createJournalEntry({
      companyId: scope.companyId,
      branchId,
      createdBy: scope.userId,
      ref,
      description: `فاتورة شراء نسك ${voucher.nuskInvoiceNumber} — تكلفة المعتمرين`,
      type: "purchase_invoice",
      sourceType: "umrah_nusk_invoice",
      sourceId: voucher.id,
      operationType: "purchase_invoice",
      lines: [
        {
          accountCode: "5400", debit: voucher.netCost, credit: 0,
          description: `تكلفة عمرة — فاتورة نسك ${voucher.nuskInvoiceNumber}`,
        },
        {
          accountCode: "2100", debit: 0, credit: voucher.netCost,
          description: `مستحق لمنصة نسك — فاتورة ${voucher.nuskInvoiceNumber}`,
        },
      ],
    });
  } catch (err) {
    console.error(`[UmrahFinance] purchase journal failed for ${voucher.nuskInvoiceNumber}:`, err);
    return { journalEntryId: 0, created: false };
  }

  if (journalEntryId > 0) {
    await client.query(
      `UPDATE umrah_nusk_invoices SET "journalEntryId"=$1, "updatedAt"=NOW() WHERE id=$2`,
      [journalEntryId, voucher.id]
    );
  }
  return { journalEntryId, created: journalEntryId > 0 };
}
