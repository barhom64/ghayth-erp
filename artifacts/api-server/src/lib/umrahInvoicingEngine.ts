import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { createJournalEntry, getAccountCodeFromMapping, emitEvent, createAuditLog } from "./businessHelpers.js";
import { NotFoundError, ConflictError, ValidationError } from "./errorHandler.js";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

interface Scope {
  companyId: number;
  branchId?: number | null;
  userId: number;
}

interface GenerateInvoiceInput {
  subAgentId: number;
  groupIds: number[];
  seasonId: number;
}

interface RegisterPaymentInput {
  subAgentId: number;
  amount: number;
  currency?: string;
  exchangeRate?: number | null;
  sarAmount: number;
  method?: string;
  reference?: string;
  invoiceIds?: number[];
}

interface InvoiceLineItem {
  itemType: "group" | "penalty";
  groupId: number | null;
  violationId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Invoice Generation
// ────────────────────────────────────────────────────────────────────────────

export async function generateSalesInvoice(scope: Scope, input: GenerateInvoiceInput) {
  const { subAgentId, groupIds, seasonId } = input;

  if (!groupIds?.length) throw new ValidationError("يجب تحديد مجموعة واحدة على الأقل");

  const [subAgent] = await rawQuery<any>(
    `SELECT sa.*, c.name AS "clientName"
     FROM umrah_sub_agents sa
     LEFT JOIN clients c ON c.id = sa."clientId"
     WHERE sa.id = $1 AND sa."companyId" = $2 AND sa."deletedAt" IS NULL`,
    [subAgentId, scope.companyId]
  );
  if (!subAgent) throw new NotFoundError("الوكيل الفرعي غير موجود");
  if (!subAgent.clientId) throw new ConflictError("الوكيل الفرعي غير مربوط بعميل — يرجى ربطه أولاً", { field: "clientId" });

  const groups = await rawQuery<any>(
    `SELECT g.id, g."nuskGroupNumber", g.name, g."mutamerCount",
            g."subAgentId", g."agentId",
            (SELECT MIN(p."arrivalDate") FROM umrah_pilgrims p
             WHERE p."groupId" = g.id AND p."deletedAt" IS NULL) AS "entryDate"
     FROM umrah_groups g
     WHERE g.id = ANY($1) AND g."companyId" = $2 AND g."deletedAt" IS NULL`,
    [groupIds, scope.companyId]
  );
  if (groups.length !== groupIds.length) {
    throw new NotFoundError("بعض المجموعات غير موجودة");
  }

  const lineItems: InvoiceLineItem[] = [];
  let subtotal = 0;
  let totalPilgrims = 0;
  const nuskInvoiceRefs: string[] = [];
  const groupRefs: string[] = [];

  for (const grp of groups) {
    const mutamerCount = grp.mutamerCount || 0;
    const entryDate = grp.entryDate;

    const [pricing] = await rawQuery<any>(
      `SELECT "pricePerMutamer" FROM umrah_pricing
       WHERE "companyId" = $1 AND "deletedAt" IS NULL
         AND ("subAgentId" = $2 OR ("subAgentId" IS NULL AND "agentId" = $3))
         AND ("seasonId" = $4 OR "seasonId" IS NULL)
         AND "validFrom" <= $5 AND "validTo" >= $5
       ORDER BY "subAgentId" DESC NULLS LAST, "validFrom" DESC
       LIMIT 1`,
      [scope.companyId, subAgentId, subAgent.agentId, seasonId, entryDate || new Date()]
    );

    if (!pricing) {
      throw new NotFoundError(`لا يوجد سعر ساري للفترة للمجموعة ${grp.nuskGroupNumber}`);
    }

    const price = Number(pricing.pricePerMutamer);
    const lineTotal = mutamerCount * price;
    subtotal += lineTotal;
    totalPilgrims += mutamerCount;
    groupRefs.push(grp.nuskGroupNumber);

    lineItems.push({
      itemType: "group",
      groupId: grp.id,
      violationId: null,
      description: `مجموعة ${grp.nuskGroupNumber} — ${grp.name || ""}`.trim(),
      quantity: mutamerCount,
      unitPrice: price,
      lineTotal,
    });

    const nuskInvs = await rawQuery<any>(
      `SELECT "nuskInvoiceNumber" FROM umrah_nusk_invoices
       WHERE "groupId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [grp.id, scope.companyId]
    );
    for (const ni of nuskInvs) {
      if (ni.nuskInvoiceNumber && !nuskInvoiceRefs.includes(ni.nuskInvoiceNumber)) {
        nuskInvoiceRefs.push(ni.nuskInvoiceNumber);
      }
    }
  }

  const violations = await rawQuery<any>(
    `SELECT v.id, v.type, v.description, v."penaltyAmount", v."groupId"
     FROM umrah_violations v
     WHERE v."subAgentId" = $1 AND v."companyId" = $2
       AND v."groupId" = ANY($3)
       AND v.status IN ('open','detected')
       AND v."deletedAt" IS NULL`,
    [subAgentId, scope.companyId, groupIds]
  );

  let penaltiesTotal = 0;
  for (const v of violations) {
    const amount = Number(v.penaltyAmount) || 0;
    if (amount <= 0) continue;
    penaltiesTotal += amount;
    lineItems.push({
      itemType: "penalty",
      groupId: v.groupId,
      violationId: v.id,
      description: v.type === "overstay" ? `غرامة تجاوز — ${v.description || ""}`.trim()
                 : v.type === "absconded" ? `غرامة متغيّب — ${v.description || ""}`.trim()
                 : `غرامة — ${v.description || ""}`.trim(),
      quantity: 1,
      unitPrice: amount,
      lineTotal: amount,
    });
  }

  const total = subtotal + penaltiesTotal;

  const [seqRow] = await rawQuery<any>(`SELECT nextval('umrah_sales_invoice_seq') AS seq`);
  const seqNum = Number(seqRow.seq);
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const ref = `UINV-${year}${month}-${String(seqNum).padStart(4, "0")}`;

  let invoiceId!: number;
  await withTransaction(async (client) => {
    const invRes = await client.query(
      `INSERT INTO umrah_sales_invoices
       ("companyId","branchId","subAgentId","clientId","seasonId",ref,"invoiceDate",
        subtotal,"penaltiesTotal","vatRate","vatAmount",total,"paidAmount",status,
        "dueDate","nuskInvoiceRefs","groupRefs","pilgrimCount","createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,CURRENT_DATE,$7,$8,0,0,$9,0,'draft',
               CURRENT_DATE + INTERVAL '30 days',$10,$11,$12,$13,NOW(),NOW())
       RETURNING id`,
      [
        scope.companyId, scope.branchId || null, subAgentId, subAgent.clientId, seasonId,
        ref, subtotal, penaltiesTotal, total,
        nuskInvoiceRefs.join(","), groupRefs.join(","), totalPilgrims, scope.userId,
      ]
    );
    invoiceId = invRes.rows[0].id;

    if (lineItems.length > 0) {
      const cols = 7;
      const valuesSql: string[] = [];
      const params: any[] = [];
      for (const li of lineItems) {
        const base = params.length;
        valuesSql.push(`(${Array.from({ length: cols }, (_, i) => `$${base + i + 1}`).join(",")})`);
        params.push(invoiceId, li.itemType, li.groupId, li.violationId, li.description, li.quantity, li.lineTotal);
      }
      await client.query(
        `INSERT INTO umrah_sales_invoice_items
         ("invoiceId","itemType","groupId","violationId",description,quantity,"lineTotal")
         VALUES ${valuesSql.join(",")}`,
        params
      );
    }

    for (const v of violations) {
      await client.query(
        `UPDATE umrah_violations SET status = 'invoiced', "linkedInvoiceId" = $1, "updatedBy" = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [invoiceId, scope.userId, v.id]
      );
    }

    for (const grp of groups) {
      await client.query(
        `UPDATE umrah_groups SET "salesInvoiceId" = $1, "updatedBy" = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [invoiceId, scope.userId, grp.id]
      );
    }
  });

  emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.invoice.generated", entity: "umrah_sales_invoices", entityId: invoiceId, details: JSON.stringify({ ref, total, subAgentId, groupCount: groups.length, pilgrimCount: totalPilgrims }) }).catch(console.error);
  createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_sales_invoices", entityId: invoiceId, after: { ref, total } }).catch(console.error);

  return { invoiceId, ref, subtotal, penaltiesTotal, total, pilgrimCount: totalPilgrims, lineItems: lineItems.length, nuskInvoiceRefs, groupRefs };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Payment Registration with FIFO
// ────────────────────────────────────────────────────────────────────────────

export async function registerPayment(scope: Scope, input: RegisterPaymentInput) {
  const { subAgentId, amount, currency = "SAR", exchangeRate, sarAmount, method = "bank_transfer", reference, invoiceIds } = input;

  if (!sarAmount || sarAmount <= 0) throw new ValidationError("المبلغ بالريال مطلوب");

  const [subAgent] = await rawQuery<any>(
    `SELECT id, "clientId" FROM umrah_sub_agents WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [subAgentId, scope.companyId]
  );
  if (!subAgent) throw new NotFoundError("الوكيل الفرعي غير موجود");

  const [seqRow] = await rawQuery<any>(`SELECT nextval('umrah_payment_seq') AS seq`);
  const seqNum = Number(seqRow.seq);
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, "0");
  const payRef = `UPAY-${year}${month}-${String(seqNum).padStart(4, "0")}`;

  let paymentId!: number;
  const allocations: { invoiceId: number; invoiceRef: string; allocated: number }[] = [];
  let remaining = sarAmount;

  await withTransaction(async (client) => {
    const payRes = await client.query(
      `INSERT INTO umrah_payments
       ("companyId","branchId","subAgentId",ref,amount,currency,"exchangeRate","sarAmount",
        method,"externalReference","paymentDate","createdBy","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_DATE,$11,NOW(),NOW())
       RETURNING id`,
      [
        scope.companyId, scope.branchId || null, subAgentId, payRef,
        amount, currency, exchangeRate || null, sarAmount,
        method, reference || null, scope.userId,
      ]
    );
    paymentId = payRes.rows[0].id;

    let invoicesToPay: any[];
    if (invoiceIds && invoiceIds.length > 0) {
      const invRes = await client.query(
        `SELECT id, ref, total, "paidAmount", status FROM umrah_sales_invoices
         WHERE id = ANY($1) AND "companyId" = $2 AND "subAgentId" = $3 AND "deletedAt" IS NULL
           AND status NOT IN ('paid','cancelled')
         ORDER BY "invoiceDate" ASC, id ASC
         FOR UPDATE`,
        [invoiceIds, scope.companyId, subAgentId]
      );
      invoicesToPay = invRes.rows;
    } else {
      const invRes = await client.query(
        `SELECT id, ref, total, "paidAmount", status FROM umrah_sales_invoices
         WHERE "companyId" = $1 AND "subAgentId" = $2 AND "deletedAt" IS NULL
           AND status NOT IN ('paid','cancelled')
         ORDER BY "invoiceDate" ASC, id ASC
         FOR UPDATE`,
        [scope.companyId, subAgentId]
      );
      invoicesToPay = invRes.rows;
    }

    for (const inv of invoicesToPay) {
      if (remaining <= 0) break;
      const invRemaining = Number(inv.total) - Number(inv.paidAmount);
      if (invRemaining <= 0) continue;

      const allocAmount = Math.min(remaining, invRemaining);
      remaining = Math.round((remaining - allocAmount) * 100) / 100;

      await client.query(
        `INSERT INTO umrah_payment_allocations ("paymentId","invoiceId",amount)
         VALUES ($1,$2,$3)`,
        [paymentId, inv.id, allocAmount]
      );

      const newPaid = Math.round((Number(inv.paidAmount) + allocAmount) * 100) / 100;
      const newStatus = newPaid >= Number(inv.total) - 0.01 ? "paid" : "partially_paid";
      const paidAt = newStatus === "paid" ? "NOW()" : null;

      if (paidAt) {
        await client.query(
          `UPDATE umrah_sales_invoices SET "paidAmount" = $1, status = $2, "updatedAt" = NOW() WHERE id = $3`,
          [newPaid, newStatus, inv.id]
        );
      } else {
        await client.query(
          `UPDATE umrah_sales_invoices SET "paidAmount" = $1, status = $2, "updatedAt" = NOW() WHERE id = $3`,
          [newPaid, newStatus, inv.id]
        );
      }

      allocations.push({ invoiceId: inv.id, invoiceRef: inv.ref, allocated: allocAmount });
    }
  });

  try {
    const [cashCode, arCode] = await Promise.all([
      getAccountCodeFromMapping(scope.companyId, "invoice_payment_cash", "debit", method === "cash" ? "1100" : "1110"),
      getAccountCodeFromMapping(scope.companyId, "invoice_payment_ar", "credit", "1200"),
    ]);
    await createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId || 0,
      createdBy: scope.userId,
      ref: `JE-${payRef}`,
      description: `سداد وكيل فرعي — ${payRef}`,
      type: "payment",
      sourceType: "umrah_payments",
      sourceId: paymentId,
      lines: [
        { accountCode: cashCode, debit: sarAmount, credit: 0 },
        { accountCode: arCode, debit: 0, credit: sarAmount },
      ],
    });
  } catch (err) {
    console.error("[umrah-payment] Journal entry failed (non-blocking):", err);
  }

  emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.payment.received", entity: "umrah_payments", entityId: paymentId, details: JSON.stringify({ ref: payRef, sarAmount, method, allocations }) }).catch(console.error);
  createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_payments", entityId: paymentId, after: { ref: payRef, sarAmount } }).catch(console.error);

  return { paymentId, ref: payRef, sarAmount, currency, method, allocations, unallocated: remaining };
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Statement Generation
// ────────────────────────────────────────────────────────────────────────────

export async function generateStatement(scope: Scope, subAgentId: number, type: "detailed" | "summary", from?: string, to?: string) {
  const dateFilter = from && to
    ? { fromDate: from, toDate: to }
    : { fromDate: "1970-01-01", toDate: "2099-12-31" };

  const invoices = await rawQuery<any>(
    `SELECT id, ref, "invoiceDate" AS date, total, "penaltiesTotal", "groupRefs", "nuskInvoiceRefs", "pilgrimCount"
     FROM umrah_sales_invoices
     WHERE "companyId" = $1 AND "subAgentId" = $2 AND "deletedAt" IS NULL
       AND "invoiceDate" >= $3 AND "invoiceDate" <= $4
     ORDER BY "invoiceDate" ASC, id ASC`,
    [scope.companyId, subAgentId, dateFilter.fromDate, dateFilter.toDate]
  );

  const payments = await rawQuery<any>(
    `SELECT p.id, p.ref, p."paymentDate" AS date, p."sarAmount", p.method
     FROM umrah_payments p
     WHERE p."companyId" = $1 AND p."subAgentId" = $2 AND p."deletedAt" IS NULL
       AND p."paymentDate" >= $3 AND p."paymentDate" <= $4
     ORDER BY p."paymentDate" ASC, p.id ASC`,
    [scope.companyId, subAgentId, dateFilter.fromDate, dateFilter.toDate]
  );

  const violations = await rawQuery<any>(
    `SELECT v.id, v.type, v."penaltyAmount", v."createdAt"::date AS date, v."groupId"
     FROM umrah_violations v
     WHERE v."subAgentId" = $1 AND v."companyId" = $2 AND v."deletedAt" IS NULL
       AND v.status NOT IN ('closed')
       AND v."linkedInvoiceId" IS NULL
       AND v."createdAt"::date >= $3 AND v."createdAt"::date <= $4
     ORDER BY v."createdAt" ASC`,
    [subAgentId, scope.companyId, dateFilter.fromDate, dateFilter.toDate]
  );

  const openingInvoices = await rawQuery<any>(
    `SELECT COALESCE(SUM(total), 0) AS total FROM umrah_sales_invoices
     WHERE "companyId" = $1 AND "subAgentId" = $2 AND "deletedAt" IS NULL
       AND "invoiceDate" < $3`,
    [scope.companyId, subAgentId, dateFilter.fromDate]
  );
  const openingPayments = await rawQuery<any>(
    `SELECT COALESCE(SUM("sarAmount"), 0) AS total FROM umrah_payments
     WHERE "companyId" = $1 AND "subAgentId" = $2 AND "deletedAt" IS NULL
       AND "paymentDate" < $3`,
    [scope.companyId, subAgentId, dateFilter.fromDate]
  );
  const openingViolations = await rawQuery<any>(
    `SELECT COALESCE(SUM("penaltyAmount"), 0) AS total FROM umrah_violations
     WHERE "subAgentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
       AND "linkedInvoiceId" IS NULL AND "createdAt"::date < $3`,
    [subAgentId, scope.companyId, dateFilter.fromDate]
  );

  let openingBalance = Number(openingInvoices[0]?.total || 0) + Number(openingViolations[0]?.total || 0) - Number(openingPayments[0]?.total || 0);

  if (type === "detailed") {
    return buildDetailedStatement(invoices, payments, violations, openingBalance);
  }
  return buildSummaryStatement(invoices, payments, violations, openingBalance);
}

function buildDetailedStatement(
  invoices: any[], payments: any[], violations: any[], openingBalance: number
) {
  const entries: any[] = [];
  let balance = openingBalance;

  if (openingBalance !== 0) {
    entries.push({
      date: null, description: "رصيد افتتاحي", reference: "", debit: openingBalance > 0 ? openingBalance : 0, credit: openingBalance < 0 ? Math.abs(openingBalance) : 0, balance: openingBalance,
    });
  }

  const all: { date: string; sort: number; entry: any }[] = [];

  for (const inv of invoices) {
    all.push({
      date: inv.date, sort: 1,
      entry: { date: inv.date, description: `فاتورة — ${inv.groupRefs || ""}`, reference: inv.ref, debit: Number(inv.total), credit: 0 },
    });
  }
  for (const v of violations) {
    all.push({
      date: v.date, sort: 2,
      entry: { date: v.date, description: v.type === "absconded" ? "غرامة متغيّب" : "غرامة تجاوز", reference: `VIO-${v.id}`, debit: Number(v.penaltyAmount), credit: 0 },
    });
  }
  for (const p of payments) {
    const methodLabel = p.method === "cash" ? "نقدي" : p.method === "bank_transfer" ? "تحويل بنكي" : p.method === "cheque" ? "شيك" : p.method;
    all.push({
      date: p.date, sort: 3,
      entry: { date: p.date, description: `دفعة — ${methodLabel}`, reference: p.ref, debit: 0, credit: Number(p.sarAmount) },
    });
  }

  all.sort((a, b) => {
    const d = String(a.date).localeCompare(String(b.date));
    return d !== 0 ? d : a.sort - b.sort;
  });

  for (const item of all) {
    balance = Math.round((balance + item.entry.debit - item.entry.credit) * 100) / 100;
    entries.push({ ...item.entry, balance });
  }

  return { openingBalance, entries, closingBalance: balance };
}

function buildSummaryStatement(
  invoices: any[], payments: any[], violations: any[], openingBalance: number
) {
  const entries: any[] = [];
  let balance = openingBalance;

  if (openingBalance !== 0) {
    entries.push({ period: null, description: "رصيد افتتاحي", amount: openingBalance, balance: openingBalance });
  }

  const monthlyInv: Record<string, { count: number; total: number }> = {};
  for (const inv of invoices) {
    const m = String(inv.date).slice(0, 7);
    if (!monthlyInv[m]) monthlyInv[m] = { count: 0, total: 0 };
    monthlyInv[m].count++;
    monthlyInv[m].total += Number(inv.total);
  }

  const monthlyVio: Record<string, { count: number; total: number }> = {};
  for (const v of violations) {
    const m = String(v.date).slice(0, 7);
    if (!monthlyVio[m]) monthlyVio[m] = { count: 0, total: 0 };
    monthlyVio[m].count++;
    monthlyVio[m].total += Number(v.penaltyAmount);
  }

  const allMonths = [...new Set([...Object.keys(monthlyInv), ...Object.keys(monthlyVio)])].sort();

  const allEntries: { date: string; sort: number; entry: any }[] = [];
  for (const m of allMonths) {
    if (monthlyInv[m]) {
      allEntries.push({
        date: m + "-01", sort: 1,
        entry: { period: m, description: `إجمالي فواتير (${monthlyInv[m].count} فاتورة)`, amount: monthlyInv[m].total },
      });
    }
    if (monthlyVio[m]) {
      allEntries.push({
        date: m + "-01", sort: 2,
        entry: { period: m, description: `إجمالي غرامات (${monthlyVio[m].count})`, amount: monthlyVio[m].total },
      });
    }
  }

  for (const p of payments) {
    const methodLabel = p.method === "cash" ? "نقدي" : p.method === "bank_transfer" ? "تحويل بنكي" : p.method === "cheque" ? "شيك" : p.method;
    allEntries.push({
      date: p.date, sort: 3,
      entry: { period: p.date, description: `دفعة — ${methodLabel}`, amount: -Number(p.sarAmount) },
    });
  }

  allEntries.sort((a, b) => {
    const d = String(a.date).localeCompare(String(b.date));
    return d !== 0 ? d : a.sort - b.sort;
  });

  for (const item of allEntries) {
    balance = Math.round((balance + item.entry.amount) * 100) / 100;
    entries.push({ ...item.entry, balance });
  }

  return { openingBalance, entries, closingBalance: balance };
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Enhanced Dashboard
// ────────────────────────────────────────────────────────────────────────────

export async function getDashboard(scope: Scope, seasonId: number) {
  const pilgrimStats = await rawQuery<any>(
    `SELECT
       COUNT(*)::int AS "totalMutamers",
       COUNT(*) FILTER (WHERE "isInsideKingdom" = TRUE)::int AS "insideKingdom",
       COUNT(*) FILTER (WHERE status IN ('overstayed','overstay'))::int AS "overstayCount",
       COUNT(*) FILTER (WHERE status = 'absconded')::int AS "abscondedCount"
     FROM umrah_pilgrims
     WHERE "companyId" = $1 AND "seasonId" = $2 AND "deletedAt" IS NULL`,
    [scope.companyId, seasonId]
  );

  const revenueStats = await rawQuery<any>(
    `SELECT COALESCE(SUM(total), 0) AS "totalRevenue",
            COALESCE(SUM("paidAmount"), 0) AS "totalPaid"
     FROM umrah_sales_invoices
     WHERE "companyId" = $1 AND "seasonId" = $2 AND "deletedAt" IS NULL
       AND status != 'cancelled'`,
    [scope.companyId, seasonId]
  );

  const costStats = await rawQuery<any>(
    `SELECT COALESCE(SUM("netCost"), 0) AS "totalCost"
     FROM umrah_nusk_invoices ni
     JOIN umrah_groups g ON g.id = ni."groupId"
     WHERE ni."companyId" = $1 AND g."seasonId" = $2 AND ni."deletedAt" IS NULL`,
    [scope.companyId, seasonId]
  );

  const penaltyStats = await rawQuery<any>(
    `SELECT COALESCE(SUM("penaltyAmount"), 0) AS "unpaidPenalties"
     FROM umrah_violations
     WHERE "companyId" = $1 AND status IN ('open','detected') AND "deletedAt" IS NULL
       AND "groupId" IN (SELECT id FROM umrah_groups WHERE "seasonId" = $2 AND "companyId" = $1)`,
    [scope.companyId, seasonId]
  );

  const agentPerformance = await rawQuery<any>(
    `SELECT
       sa.id AS "subAgentId", sa.name AS "subAgentName",
       (SELECT COUNT(*)::int FROM umrah_groups g2
        WHERE g2."subAgentId" = sa.id AND g2."seasonId" = $2 AND g2."deletedAt" IS NULL) AS groups,
       (SELECT COUNT(*)::int FROM umrah_pilgrims p2
        WHERE p2."subAgentId" = sa.id AND p2."seasonId" = $2 AND p2."deletedAt" IS NULL) AS mutamers,
       COALESCE((SELECT SUM(si.total) FROM umrah_sales_invoices si
        WHERE si."subAgentId" = sa.id AND si."seasonId" = $2 AND si."deletedAt" IS NULL AND si.status != 'cancelled'), 0) AS invoiced,
       COALESCE((SELECT SUM(si."paidAmount") FROM umrah_sales_invoices si
        WHERE si."subAgentId" = sa.id AND si."seasonId" = $2 AND si."deletedAt" IS NULL AND si.status != 'cancelled'), 0) AS paid,
       COALESCE((SELECT SUM(v2."penaltyAmount") FROM umrah_violations v2
        WHERE v2."subAgentId" = sa.id AND v2."companyId" = $1 AND v2.status IN ('open','detected') AND v2."deletedAt" IS NULL
          AND v2."groupId" IN (SELECT id FROM umrah_groups WHERE "seasonId" = $2)), 0) AS penalties
     FROM umrah_sub_agents sa
     WHERE sa."companyId" = $1 AND sa."deletedAt" IS NULL AND sa."isActive" = TRUE
     ORDER BY mutamers DESC`,
    [scope.companyId, seasonId]
  );

  for (const a of agentPerformance) {
    a.balance = Number(a.invoiced) - Number(a.paid);
  }

  const stats = pilgrimStats[0] || {};
  const revenue = revenueStats[0] || {};
  const cost = costStats[0] || {};
  const penalties = penaltyStats[0] || {};

  return {
    totalMutamers: stats.totalMutamers || 0,
    insideKingdom: stats.insideKingdom || 0,
    overstayCount: stats.overstayCount || 0,
    abscondedCount: stats.abscondedCount || 0,
    totalRevenue: Number(revenue.totalRevenue || 0),
    totalCost: Number(cost.totalCost || 0),
    profit: Number(revenue.totalRevenue || 0) - Number(cost.totalCost || 0),
    unpaidPenalties: Number(penalties.unpaidPenalties || 0),
    agentPerformance,
  };
}
