import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { checkFinancialPeriodOpen, updateAccountBalances, todayISO } from "../lib/businessHelpers.js";

export const financeAlgorithmsRouter = Router();
financeAlgorithmsRouter.use(authMiddleware);

const FINANCE_ROLES = ["finance_manager", "general_manager", "owner"];

function assertFinanceRole(scope: any): void {
  if (!FINANCE_ROLES.includes(scope.role)) {
    throw new ForbiddenError("هذه العملية مخصصة لموظفي المالية فقط", {
      fix: `الأدوار المسموحة: ${FINANCE_ROLES.join(", ")}`,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AR AGING — تقادم الذمم المدينة
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/ar-aging", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const asOfDate = (req.query.asOfDate as string) || todayISO();

    const invoices = await rawQuery<any>(
      `SELECT
         i.id, i.ref, i.status,
         i."dueDate",
         i.total,
         i."paidAmount",
         (i.total - i."paidAmount") AS outstanding,
         ($1::date - i."dueDate"::date) AS "daysOverdue",
         c.id AS "clientId",
         c.name AS "clientName",
         c.phone AS "clientPhone",
         c.email AS "clientEmail"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
       WHERE i."companyId" = $2
         AND i."deletedAt" IS NULL
         AND i.status NOT IN ('paid','cancelled','draft')
         AND (i.total - i."paidAmount") > 0.009
         AND i."dueDate" IS NOT NULL
         AND i."createdAt"::date <= $1::date
       ORDER BY c.name, i."dueDate" ASC`,
      [asOfDate, scope.companyId]
    );

    const clientMap: Record<number, any> = {};
    let totalCurrent = 0, total1_30 = 0, total31_60 = 0, total61_90 = 0, totalOver90 = 0;

    for (const inv of invoices) {
      const days = Number(inv.daysOverdue ?? 0);
      const outstanding = Number(inv.outstanding ?? 0);
      const cid: number = inv.clientId ?? 0;
      const clientName = inv.clientName || `عميل #${cid}`;

      if (!clientMap[cid]) {
        clientMap[cid] = {
          clientId: cid, clientName, clientPhone: inv.clientPhone, clientEmail: inv.clientEmail,
          current: 0, "1_30": 0, "31_60": 0, "61_90": 0, over90: 0, total: 0, invoices: [],
        };
      }

      const bucket =
        days <= 0 ? "current" :
        days <= 30 ? "1_30" :
        days <= 60 ? "31_60" :
        days <= 90 ? "61_90" : "over90";

      clientMap[cid][bucket] += outstanding;
      clientMap[cid].total += outstanding;
      clientMap[cid].invoices.push({
        id: inv.id, ref: inv.ref, dueDate: inv.dueDate,
        outstanding, daysOverdue: days, bucket,
      });

      if (bucket === "current") totalCurrent += outstanding;
      else if (bucket === "1_30") total1_30 += outstanding;
      else if (bucket === "31_60") total31_60 += outstanding;
      else if (bucket === "61_90") total61_90 += outstanding;
      else totalOver90 += outstanding;
    }

    const clients = Object.values(clientMap).sort((a: any, b: any) => b.total - a.total);
    const grandTotal = totalCurrent + total1_30 + total31_60 + total61_90 + totalOver90;

    res.json({
      asOfDate,
      clients,
      summary: {
        current: totalCurrent,
        "1_30": total1_30,
        "31_60": total31_60,
        "61_90": total61_90,
        over90: totalOver90,
        grandTotal,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "AR Aging error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AP AGING — تقادم الذمم الدائنة
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/ap-aging", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const asOfDate = (req.query.asOfDate as string) || todayISO();

    const orders = await rawQuery<any>(
      `SELECT
         po.id, po.ref, po.status,
         'purchase_order' AS "sourceType",
         po."createdAt" AS "orderDate",
         COALESCE(po."expectedDelivery", po."createdAt"::date + INTERVAL '30 days') AS "dueDate",
         po."totalAmount",
         0::numeric AS "paidAmount",
         po."totalAmount" AS outstanding,
         ($1::date - COALESCE(po."expectedDelivery", po."createdAt"::date + INTERVAL '30 days')::date) AS "daysOverdue",
         s.id AS "supplierId",
         s.name AS "supplierName",
         s.phone AS "supplierPhone",
         s.email AS "supplierEmail"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId"
       WHERE po."companyId" = $2
         AND po.status NOT IN ('cancelled','draft','delivered')
         AND po."totalAmount" > 0.009
         AND po."createdAt"::date <= $1::date
       UNION ALL
       SELECT
         pr.id, pr.ref, pr.status,
         'purchase_request' AS "sourceType",
         pr."createdAt" AS "orderDate",
         (pr."createdAt"::date + INTERVAL '30 days') AS "dueDate",
         COALESCE(pr."totalAmount", 0) AS "totalAmount",
         0::numeric AS "paidAmount",
         COALESCE(pr."totalAmount", 0) AS outstanding,
         ($1::date - (pr."createdAt"::date + INTERVAL '30 days')::date) AS "daysOverdue",
         s2.id AS "supplierId",
         s2.name AS "supplierName",
         s2.phone AS "supplierPhone",
         s2.email AS "supplierEmail"
       FROM purchase_requests pr
       LEFT JOIN suppliers s2 ON s2.id = pr."supplierId"
       WHERE pr."companyId" = $2
         AND pr.status NOT IN ('cancelled','rejected','completed','draft')
         AND pr."supplierId" IS NOT NULL
         AND COALESCE(pr."totalAmount", 0) > 0.009
         AND pr."createdAt"::date <= $1::date
       UNION ALL
       SELECT
         je.id, je.ref, je.status,
         'accrued_expense' AS "sourceType",
         je."createdAt" AS "orderDate",
         (je."createdAt"::date + INTERVAL '30 days') AS "dueDate",
         (SUM(jl.credit) - SUM(jl.debit)) AS "totalAmount",
         0::numeric AS "paidAmount",
         (SUM(jl.credit) - SUM(jl.debit)) AS outstanding,
         ($1::date - (je."createdAt"::date + INTERVAL '30 days')::date) AS "daysOverdue",
         NULL::integer AS "supplierId",
         je.description AS "supplierName",
         NULL::text AS "supplierPhone",
         NULL::text AS "supplierEmail"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $2
         AND je."deletedAt" IS NULL
         AND je.status = 'posted'
         AND (jl."accountCode" LIKE '21%' OR jl."accountCode" LIKE '23%')
         AND je."createdAt"::date <= $1::date
         AND COALESCE(je."sourceType",'') NOT IN ('purchase_order','purchase_request')
       GROUP BY je.id, je.ref, je.status, je."createdAt", je.description
       HAVING (SUM(jl.credit) - SUM(jl.debit)) > 0.009
       ORDER BY "supplierName", "orderDate" ASC`,
      [asOfDate, scope.companyId]
    );

    const supplierMap: Record<string, any> = {};
    let totalCurrent = 0, total1_30 = 0, total31_60 = 0, total61_90 = 0, totalOver90 = 0;

    for (const po of orders) {
      const days = Number(po.daysOverdue ?? 0);
      const outstanding = Number(po.outstanding ?? 0);
      const sid = po.supplierId != null ? String(po.supplierId) : `nosupp_${po.id}`;
      const supplierName = po.supplierName || `مورد #${po.supplierId}`;

      if (!supplierMap[sid]) {
        supplierMap[sid] = {
          supplierId: po.supplierId, supplierName, supplierPhone: po.supplierPhone, supplierEmail: po.supplierEmail,
          current: 0, "1_30": 0, "31_60": 0, "61_90": 0, over90: 0, total: 0, orders: [],
        };
      }

      const bucket =
        days <= 0 ? "current" :
        days <= 30 ? "1_30" :
        days <= 60 ? "31_60" :
        days <= 90 ? "61_90" : "over90";

      supplierMap[sid][bucket] += outstanding;
      supplierMap[sid].total += outstanding;
      supplierMap[sid].orders.push({
        id: po.id, ref: po.ref, dueDate: po.dueDate, sourceType: po.sourceType,
        outstanding, daysOverdue: days, bucket,
      });

      if (bucket === "current") totalCurrent += outstanding;
      else if (bucket === "1_30") total1_30 += outstanding;
      else if (bucket === "31_60") total31_60 += outstanding;
      else if (bucket === "61_90") total61_90 += outstanding;
      else totalOver90 += outstanding;
    }

    const suppliers = Object.values(supplierMap).sort((a: any, b: any) => b.total - a.total);
    const grandTotal = totalCurrent + total1_30 + total31_60 + total61_90 + totalOver90;

    res.json({
      asOfDate,
      suppliers,
      summary: {
        current: totalCurrent,
        "1_30": total1_30,
        "31_60": total31_60,
        "61_90": total61_90,
        over90: totalOver90,
        grandTotal,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "AP Aging error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BANK RECONCILIATION — التسوية البنكية
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.post("/bank-reconciliation/import", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);

    const { rows, accountCode = "1120", statementDate } = req.body as any;
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ValidationError("لا توجد بيانات في الكشف البنكي");
    }

    const batchId = `BANK-${Date.now().toString(36).toUpperCase()}`;
    let imported = 0;

    await withTransaction(async (client) => {
      for (const row of rows) {
        const amount = Math.abs(Number(row.amount ?? row.debit ?? row.credit ?? 0));
        const type = Number(row.credit ?? 0) > 0 ? "credit" :
                     Number(row.debit ?? 0) > 0 ? "debit" :
                     Number(row.amount ?? 0) >= 0 ? "debit" : "credit";
        let date = statementDate;
        if (row.date) {
          const parsed = new Date(row.date);
          if (!isNaN(parsed.getTime())) {
            date = parsed.toISOString().split("T")[0];
          }
        }
        if (!amount || amount <= 0) continue;

        await client.query(
          `INSERT INTO bank_statements ("companyId","branchId","accountCode","statementDate",reference,description,amount,type,"importBatchId")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [scope.companyId, scope.branchId, accountCode, date,
           row.reference ?? row.ref ?? null, row.description ?? row.narration ?? null,
           amount, type, batchId]
        );
        imported++;
      }
    });

    res.status(201).json({ batchId, imported, message: `تم استيراد ${imported} سطر من الكشف البنكي` });
  } catch (err) {
    handleRouteError(err, res, "Bank reconciliation import error:");
  }
});

financeAlgorithmsRouter.post("/bank-reconciliation/auto-match", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);

    const { batchId, accountCode = "1120", toleranceDays = 3 } = req.body as any;
    if (!batchId) {
      throw new ValidationError("معرف الدفعة مطلوب", { field: "batchId" });
    }

    const bankRows = await rawQuery<any>(
      `SELECT * FROM bank_statements
       WHERE "companyId" = $1
         AND "importBatchId" = $2
         AND "matchStatus" = 'unmatched'`,
      [scope.companyId, batchId]
    );

    let matched = 0;

    for (const bRow of bankRows) {
      const amount = Number(bRow.amount);
      const date = new Date(bRow.statementDate);
      const minDate = new Date(date);
      minDate.setDate(minDate.getDate() - Number(toleranceDays));
      const maxDate = new Date(date);
      maxDate.setDate(maxDate.getDate() + Number(toleranceDays));

      const creditOrDebit = bRow.type === "credit" ? "debit" : "credit";

      const [jLine] = await rawQuery<any>(
        `SELECT jl.id, je."createdAt"
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId"
         WHERE je."companyId" = $1
           AND jl."accountCode" = $2
           AND je."deletedAt" IS NULL
           AND jl.${creditOrDebit} BETWEEN $3 AND $4
           AND je."createdAt"::date BETWEEN $5 AND $6
           AND NOT EXISTS (
             SELECT 1 FROM bank_statements bs
             WHERE bs."matchedJournalLineId" = jl.id
           )
         ORDER BY ABS(jl.${creditOrDebit} - $7), ABS(je."createdAt"::date - $8::date)
         LIMIT 1`,
        [scope.companyId, accountCode,
         amount * 0.99, amount * 1.01,
         minDate.toISOString().split("T")[0], maxDate.toISOString().split("T")[0],
         amount, bRow.statementDate]
      );

      if (jLine) {
        await rawExecute(
          `UPDATE bank_statements SET "matchStatus" = 'matched', "matchedJournalLineId" = $1 WHERE id = $2`,
          [jLine.id, bRow.id]
        );
        matched++;
      }
    }

    const unmatched = bankRows.length - matched;
    res.json({ matched, unmatched, total: bankRows.length, message: `تمت المطابقة التلقائية: ${matched} متطابق، ${unmatched} غير متطابق` });
  } catch (err) {
    handleRouteError(err, res, "Auto-match error:");
  }
});

financeAlgorithmsRouter.get("/bank-reconciliation/:batchId", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { batchId } = req.params;

    const bankRows = await rawQuery<any>(
      `SELECT bs.*,
              jl.debit AS "jeDebit", jl.credit AS "jeCredit",
              je.ref AS "jeRef", je.description AS "jeDescription", je."createdAt" AS "jeDate"
       FROM bank_statements bs
       LEFT JOIN journal_lines jl ON jl.id = bs."matchedJournalLineId"
       LEFT JOIN journal_entries je ON je.id = jl."journalId"
       WHERE bs."companyId" = $1 AND bs."importBatchId" = $2
       ORDER BY bs."statementDate" ASC`,
      [scope.companyId, batchId]
    );

    const matched = bankRows.filter((r: any) => r.matchStatus === "matched");
    const unmatched = bankRows.filter((r: any) => r.matchStatus !== "matched");
    const totalDebits = bankRows.filter((r: any) => r.type === "debit").reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalCredits = bankRows.filter((r: any) => r.type === "credit").reduce((s: number, r: any) => s + Number(r.amount), 0);

    res.json({
      batchId,
      rows: bankRows,
      matched,
      unmatched,
      summary: {
        total: bankRows.length,
        matchedCount: matched.length,
        unmatchedCount: unmatched.length,
        totalDebits,
        totalCredits,
        netBalance: totalDebits - totalCredits,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Bank reconciliation fetch error:");
  }
});

financeAlgorithmsRouter.post("/bank-reconciliation/manual-match", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const { bankStatementId, journalLineId } = req.body as any;
    if (!bankStatementId || !journalLineId) {
      throw new ValidationError("bankStatementId و journalLineId مطلوبان");
    }
    const [bs] = await rawQuery<any>(
      `SELECT * FROM bank_statements WHERE id=$1 AND "companyId"=$2 AND "matchStatus"='unmatched'`,
      [bankStatementId, scope.companyId]
    );
    if (!bs) { throw new NotFoundError("سطر الكشف البنكي غير موجود أو تمت مطابقته مسبقاً"); return; }

    const [jl] = await rawQuery<any>(
      `SELECT jl.id FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId"
       WHERE jl.id=$1 AND je."companyId"=$2
         AND jl."accountCode"=$3
         AND NOT EXISTS (SELECT 1 FROM bank_statements bs2 WHERE bs2."matchedJournalLineId"=jl.id)`,
      [journalLineId, scope.companyId, bs.accountCode]
    );
    if (!jl) throw new NotFoundError("سطر القيد غير موجود أو لا يتبع نفس الشركة/الحساب أو تمت مطابقته");

    await rawExecute(
      `UPDATE bank_statements SET "matchStatus"='matched', "matchedJournalLineId"=$1 WHERE id=$2 AND "companyId"=$3`,
      [journalLineId, bankStatementId, scope.companyId]
    );
    res.json({ success: true, message: "تمت المطابقة اليدوية" });
  } catch (err) {
    handleRouteError(err, res, "Manual match error:");
  }
});

financeAlgorithmsRouter.get("/journal-lines/search", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { accountCode: acc, search, amount, pageSize = "20" } = req.query as any;

    let conditions = [`je."companyId"=$1`, `je."deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];

    if (acc) { params.push(acc); conditions.push(`jl."accountCode"=$${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(je.ref ILIKE $${params.length} OR je.description ILIKE $${params.length})`); }
    if (amount) {
      const amt = Number(amount);
      params.push(amt * 0.99, amt * 1.01);
      conditions.push(`(jl.debit BETWEEN $${params.length - 1} AND $${params.length} OR jl.credit BETWEEN $${params.length - 1} AND $${params.length})`);
    }
    conditions.push(`NOT EXISTS (SELECT 1 FROM bank_statements bs WHERE bs."matchedJournalLineId"=jl.id)`);

    params.push(Math.min(Number(pageSize), 50));
    const rows = await rawQuery<any>(
      `SELECT jl.id, jl."accountCode", jl.debit, jl.credit, jl.description,
              je.ref AS "jeRef", je.description AS "jeDescription", je."createdAt" AS "jeDate"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id=jl."journalId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY je."createdAt" DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "Journal lines search error:");
  }
});

financeAlgorithmsRouter.get("/bank-reconciliation", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const batches = await rawQuery<any>(
      `SELECT "importBatchId" AS "batchId",
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE "matchStatus"='matched') AS matched,
              MIN("statementDate") AS "fromDate",
              MAX("statementDate") AS "toDate",
              "accountCode",
              MIN("createdAt") AS "importedAt"
       FROM bank_statements
       WHERE "companyId" = $1
       GROUP BY "importBatchId", "accountCode"
       ORDER BY MIN("createdAt") DESC`,
      [scope.companyId]
    );
    res.json({ data: batches });
  } catch (err) {
    handleRouteError(err, res, "List bank reconciliation batches error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FIXED ASSETS & DEPRECIATION — الأصول الثابتة والإهلاك
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/fixed-assets", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM fixed_assets WHERE "companyId" = $1 ORDER BY "purchaseDate" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List fixed assets error:");
  }
});

financeAlgorithmsRouter.post("/fixed-assets", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const b = req.body as any;
    if (!b.name || !b.purchaseCost || !b.purchaseDate) {
      throw new ValidationError("الاسم والتكلفة وتاريخ الشراء مطلوبة");
    }
    const usefulYears = Number(b.usefulLifeYears ?? 5);
    if (!usefulYears || usefulYears <= 0) {
      throw new ValidationError("العمر الإنتاجي يجب أن يكون أكبر من صفر");
    }
    const purchaseCost = Number(b.purchaseCost);
    const salvageValue = Number(b.salvageValue ?? 0);

    const { insertId } = await rawExecute(
      `INSERT INTO fixed_assets (
         "companyId","branchId",code,name,description,category,
         "purchaseDate","purchaseCost","salvageValue","usefulLifeYears",
         "depreciationMethod","currentBookValue","accumulatedDepreciation",
         "assetAccountCode","depreciationAccountCode","accDepreciationAccountCode",status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14,$15,'active')`,
      [scope.companyId, b.branchId ?? scope.branchId, b.code ?? null, b.name,
       b.description ?? null, b.category ?? null, b.purchaseDate,
       purchaseCost, salvageValue, usefulYears,
       b.depreciationMethod ?? "straight_line", purchaseCost,
       b.assetAccountCode ?? "1500", b.depreciationAccountCode ?? "6100",
       b.accDepreciationAccountCode ?? "1590"]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM fixed_assets WHERE id = $1 AND "companyId" = $2`, [insertId, scope.companyId]);
    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create fixed asset error:");
  }
});

financeAlgorithmsRouter.get("/fixed-assets/:id", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [asset] = await rawQuery<any>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2`,
      [Number(req.params.id), scope.companyId]
    );
    if (!asset) { throw new NotFoundError("الأصل غير موجود"); return; }
    const schedule = await rawQuery<any>(
      `SELECT * FROM depreciation_entries WHERE "assetId"=$1 ORDER BY period ASC`,
      [asset.id]
    );
    res.json({ ...asset, schedule });
  } catch (err) {
    handleRouteError(err, res, "Get fixed asset error:");
  }
});

financeAlgorithmsRouter.patch("/fixed-assets/:id", requirePermission("finance:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const id = Number(req.params.id);
    const b = req.body as any;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.usefulLifeYears !== undefined && Number(b.usefulLifeYears) <= 0) {
      throw new ValidationError("العمر الإنتاجي يجب أن يكون أكبر من صفر");
    }
    const f = (col: string, val: any) => { if (val !== undefined) { params.push(val); sets.push(`"${col}"=$${params.length}`); } };
    f("name", b.name); f("description", b.description); f("category", b.category);
    f("salvageValue", b.salvageValue); f("usefulLifeYears", b.usefulLifeYears);
    f("depreciationMethod", b.depreciationMethod); f("status", b.status);
    if (sets.length === 1) { throw new ValidationError("لا توجد تغييرات"); return; }
    params.push(id, scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE fixed_assets SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (!row) { throw new NotFoundError("الأصل غير موجود"); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Update fixed asset error:");
  }
});

/**
 * Calculate monthly depreciation for an asset, capped at remaining
 * depreciable amount. Supports:
 *   * straight_line           — (cost - salvage) / lifeMonths
 *   * declining_balance       — 200% DB on current book value
 *   * declining_balance_150   — 150% DB
 *   * sum_of_years_digits     — SYD weighted each year, split by month
 *   * units_of_production     — pass unitsThisPeriod + totalLifetimeUnits
 * Falls back to straight-line for unknown methods.
 */
function calcDepreciationAmount(asset: any, _period: string, opts?: { unitsThisPeriod?: number }): number {
  const purchaseCost = Number(asset.purchaseCost);
  const salvageValue = Number(asset.salvageValue);
  const usefulLife = Number(asset.usefulLifeYears);
  const currentBookValue = Number(asset.currentBookValue ?? purchaseCost);
  const remainingDepreciable = Math.max(0, currentBookValue - salvageValue);

  if (remainingDepreciable <= 0) return 0;
  if (!usefulLife || usefulLife <= 0) return 0;

  const method = asset.depreciationMethod || "straight_line";
  const depreciable = purchaseCost - salvageValue;
  let monthlyAmount: number;

  if (method === "declining_balance" || method === "declining_balance_200") {
    const annualRate = 2 / usefulLife;
    monthlyAmount = Math.round(currentBookValue * (annualRate / 12) * 100) / 100;
  } else if (method === "declining_balance_150") {
    const annualRate = 1.5 / usefulLife;
    monthlyAmount = Math.round(currentBookValue * (annualRate / 12) * 100) / 100;
  } else if (method === "sum_of_years_digits") {
    // SYD: weight of year n = (life - n + 1) / (life*(life+1)/2)
    // We need to know which year of the asset's life we're in.
    const monthsElapsed = Math.max(0,
      Math.round((Number(asset.accumulatedDepreciation) / depreciable) * (usefulLife * 12))
    );
    const yearIndex = Math.min(usefulLife - 1, Math.floor(monthsElapsed / 12));
    const weight = (usefulLife - yearIndex) / ((usefulLife * (usefulLife + 1)) / 2);
    const yearAmount = depreciable * weight;
    monthlyAmount = Math.round((yearAmount / 12) * 100) / 100;
  } else if (method === "units_of_production") {
    const total = Number(asset.totalLifetimeUnits || 0);
    const units = Number(opts?.unitsThisPeriod || 0);
    if (total <= 0 || units <= 0) return 0;
    monthlyAmount = Math.round(((depreciable * units) / total) * 100) / 100;
  } else {
    monthlyAmount = Math.round((depreciable / (usefulLife * 12)) * 100) / 100;
  }

  return Math.min(monthlyAmount, remainingDepreciable);
}

financeAlgorithmsRouter.get("/fixed-assets/:id/schedule", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [asset] = await rawQuery<any>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2`,
      [Number(req.params.id), scope.companyId]
    );
    if (!asset) { throw new NotFoundError("الأصل غير موجود"); return; }

    const purchaseCost = Number(asset.purchaseCost);
    const salvageValue = Number(asset.salvageValue);
    const usefulLifeYears = Number(asset.usefulLifeYears);
    if (!usefulLifeYears || usefulLifeYears <= 0) {
      throw new ValidationError("العمر الإنتاجي غير محدد لهذا الأصل — لا يمكن حساب جدول الإهلاك");
    }
    const usefulLifeMonths = usefulLifeYears * 12;
    const depreciable = purchaseCost - salvageValue;
    const scheduleRows: any[] = [];
    let bookValue = purchaseCost;
    let accumulated = 0;

    const method = asset.depreciationMethod || "straight_line";
    const sydDenom = (usefulLifeYears * (usefulLifeYears + 1)) / 2;

    if (method === "units_of_production") {
      res.json({
        assetId: asset.id,
        assetName: asset.name,
        schedule: [],
        totalDepreciable: depreciable,
        note: "طريقة وحدات الإنتاج لا يمكن جدولتها مسبقاً — يتم تسجيلها شهرياً حسب الوحدات المنتجة فعلياً",
      });
      return;
    }

    const purchaseDate = new Date(asset.purchaseDate);
    for (let m = 0; m < usefulLifeMonths; m++) {
      const d = new Date(purchaseDate);
      d.setMonth(d.getMonth() + m + 1);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      let monthlyDep: number;
      if (method === "declining_balance" || method === "declining_balance_200") {
        const annualRate = 2 / usefulLifeYears;
        monthlyDep = Math.max(0, Math.round(bookValue * (annualRate / 12) * 100) / 100);
      } else if (method === "declining_balance_150") {
        const annualRate = 1.5 / usefulLifeYears;
        monthlyDep = Math.max(0, Math.round(bookValue * (annualRate / 12) * 100) / 100);
      } else if (method === "sum_of_years_digits") {
        const yearIndex = Math.min(usefulLifeYears - 1, Math.floor(m / 12));
        const weight = (usefulLifeYears - yearIndex) / sydDenom;
        const yearAmount = depreciable * weight;
        monthlyDep = Math.round((yearAmount / 12) * 100) / 100;
      } else {
        monthlyDep = Math.round((depreciable / usefulLifeMonths) * 100) / 100;
      }

      if (bookValue - monthlyDep < salvageValue) {
        monthlyDep = Math.max(0, bookValue - salvageValue);
      }
      if (monthlyDep <= 0) break;

      accumulated += monthlyDep;
      bookValue -= monthlyDep;

      scheduleRows.push({ period, depreciationAmount: monthlyDep, accumulatedDepreciation: accumulated, bookValue: Math.max(bookValue, salvageValue) });
    }

    res.json({ assetId: asset.id, assetName: asset.name, method, schedule: scheduleRows, totalDepreciable: depreciable });
  } catch (err) {
    handleRouteError(err, res, "Depreciation schedule error:");
  }
});

financeAlgorithmsRouter.post("/fixed-assets/:id/depreciate", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const id = Number(req.params.id);
    const { period, unitsThisPeriod } = req.body as any;
    if (!period) {
      throw new ValidationError("الفترة المحاسبية مطلوبة", { field: "period" });
    }
    const targetPeriod = period;

    const [asset] = await rawQuery<any>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2 AND status='active'`,
      [id, scope.companyId]
    );
    if (!asset) { throw new NotFoundError("الأصل غير موجود أو غير نشط"); return; }

    const [existing] = await rawQuery<any>(
      `SELECT id FROM depreciation_entries WHERE "assetId"=$1 AND period=$2`,
      [id, targetPeriod]
    );
    if (existing) {
      throw new ConflictError(`تم إهلاك هذا الأصل لفترة ${targetPeriod} مسبقاً`);
    }

    const depAmount = calcDepreciationAmount(asset, targetPeriod, { unitsThisPeriod: Number(unitsThisPeriod) || 0 });
    if (depAmount <= 0) {
      throw new ValidationError("لا يوجد إهلاك متبقي لهذا الأصل");
    }

    const newAccumulated = Number(asset.accumulatedDepreciation) + depAmount;
    const newBookValue = Math.max(Number(asset.purchaseCost) - newAccumulated, Number(asset.salvageValue));

    let entryId: number | undefined;

    const { financialEngine } = await import("../lib/engines/index.js");
    const { journalId } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId ?? asset.branchId,
      createdBy: scope.activeAssignmentId,
      ref: `DEP-${asset.code ?? asset.id}-${targetPeriod}`,
      description: `إهلاك شهري: ${asset.name} — ${targetPeriod}`,
      type: "depreciation",
      sourceType: "depreciation",
      sourceId: asset.id,
      sourceKey: `finance:depreciation:${asset.id}:${targetPeriod}`,
      lines: [
        { accountCode: asset.depreciationAccountCode ?? "6100", debit: depAmount, credit: 0, description: `إهلاك ${asset.name}` },
        { accountCode: asset.accDepreciationAccountCode ?? "1590", debit: 0, credit: depAmount, description: `مجمع إهلاك ${asset.name}` },
      ],
    });

    const entRes = await rawQuery<any>(
      `INSERT INTO depreciation_entries ("assetId","companyId",period,"depreciationAmount","bookValueAfter","journalEntryId",status,"postedAt")
       VALUES ($1,$2,$3,$4,$5,$6,'posted',NOW()) RETURNING id`,
      [id, scope.companyId, targetPeriod, depAmount, newBookValue, journalId]
    );
    entryId = entRes[0].id;

    await rawExecute(
      `UPDATE fixed_assets SET "accumulatedDepreciation"=$1, "currentBookValue"=$2, "updatedAt"=NOW() WHERE id=$3 AND "companyId"=$4`,
      [newAccumulated, newBookValue, id, scope.companyId]
    );

    res.status(201).json({
      entryId,
      period: targetPeriod,
      depreciationAmount: depAmount,
      newBookValue,
      newAccumulatedDepreciation: newAccumulated,
      message: `تم تسجيل إهلاك ${depAmount.toFixed(2)} ﷼ للفترة ${targetPeriod}`,
    });
  } catch (err) {
    handleRouteError(err, res, "Depreciate asset error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY DEPRECIATION BATCH — إهلاك دفعي لجميع الأصول
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.post("/fixed-assets/depreciate-all", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const { period } = req.body as any;
    if (!period) {
      throw new ValidationError("الفترة المحاسبية مطلوبة", { field: "period" });
    }
    const targetPeriod = period;

    const assets = await rawQuery<any>(
      `SELECT fa.* FROM fixed_assets fa WHERE fa."companyId"=$1 AND fa.status='active'
       AND NOT EXISTS (SELECT 1 FROM depreciation_entries de WHERE de."assetId"=fa.id AND de.period=$2)`,
      [scope.companyId, targetPeriod]
    );

    let processed = 0, skipped = 0;
    const results: any[] = [];

    for (const asset of assets) {
      const depAmount = calcDepreciationAmount(asset, targetPeriod);
      if (depAmount <= 0) { skipped++; continue; }

      const newAccumulated = Number(asset.accumulatedDepreciation) + depAmount;
      const newBookValue = Math.max(Number(asset.purchaseCost) - newAccumulated, Number(asset.salvageValue));

      const { financialEngine } = await import("../lib/engines/index.js");
      const { journalId } = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: asset.branchId ?? scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `DEP-${asset.code ?? asset.id}-${targetPeriod}`,
        description: `إهلاك شهري: ${asset.name} — ${targetPeriod}`,
        type: "depreciation",
        sourceType: "depreciation",
        sourceId: asset.id,
        sourceKey: `finance:depreciation:${asset.id}:${targetPeriod}`,
        lines: [
          { accountCode: asset.depreciationAccountCode ?? "6100", debit: depAmount, credit: 0 },
          { accountCode: asset.accDepreciationAccountCode ?? "1590", debit: 0, credit: depAmount },
        ],
      });

      await rawExecute(
        `INSERT INTO depreciation_entries ("assetId","companyId",period,"depreciationAmount","bookValueAfter","journalEntryId",status,"postedAt")
         VALUES ($1,$2,$3,$4,$5,$6,'posted',NOW())`,
        [asset.id, scope.companyId, targetPeriod, depAmount, newBookValue, journalId]
      );
      await rawExecute(
        `UPDATE fixed_assets SET "accumulatedDepreciation"=$1, "currentBookValue"=$2, "updatedAt"=NOW() WHERE id=$3 AND "companyId"=$4`,
        [newAccumulated, newBookValue, asset.id, scope.companyId]
      );

      results.push({ assetId: asset.id, assetName: asset.name, depAmount, newBookValue });
      processed++;
    }

    res.json({
      period: targetPeriod,
      processed,
      skipped,
      total: assets.length,
      results,
      message: `تم تسجيل إهلاك ${processed} أصل للفترة ${targetPeriod}`,
    });
  } catch (err) {
    handleRouteError(err, res, "Depreciate all error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WEIGHTED AVERAGE INVENTORY COST — المتوسط المرجح للمخزون
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/inventory-costing", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const products = await rawQuery<any>(
      `SELECT p.id, p.sku, p.name, p."currentStock", p."costPrice", p."lastWaCost",
              p."costingMethod", p."sellPrice",
              c.name AS "categoryName",
              (p."currentStock" * p."costPrice") AS "stockValue"
       FROM warehouse_products p
       LEFT JOIN warehouse_categories c ON c.id = p."categoryId"
       WHERE p."companyId" = $1 AND p.status = 'active' AND p."deletedAt" IS NULL
       ORDER BY p.name`,
      [scope.companyId]
    );

    const totalValue = products.reduce((s: number, p: any) => s + Number(p.stockValue ?? 0), 0);
    const totalItems = products.reduce((s: number, p: any) => s + Number(p.currentStock ?? 0), 0);

    res.json({
      products,
      summary: { totalProducts: products.length, totalValue, totalItems },
    });
  } catch (err) {
    handleRouteError(err, res, "Inventory costing error:");
  }
});

financeAlgorithmsRouter.get("/inventory-costing/:productId", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const productId = Number(req.params.productId);

    const [product] = await rawQuery<any>(
      `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [productId, scope.companyId]
    );
    if (!product) { throw new NotFoundError("المنتج غير موجود"); return; }

    const movements = await rawQuery<any>(
      `SELECT m.*, m."createdAt" AS date
       FROM warehouse_movements m
       WHERE m."productId"=$1
       ORDER BY m."createdAt" ASC`,
      [productId]
    );

    let runningQty = 0;
    let runningValue = 0;
    let waHistory: any[] = [];

    for (const mv of movements) {
      const qty = Number(mv.quantity ?? 0);
      const cost = Number(mv.unitCost ?? 0);
      const isIn = ["in", "return", "transfer_in"].includes(mv.type);
      const isOut = ["out", "transfer_out"].includes(mv.type);

      if (isIn) {
        const addValue = qty * cost;
        runningQty += qty;
        runningValue += addValue;
        const waCost = runningQty > 0 ? runningValue / runningQty : cost;
        waHistory.push({
          date: mv.date, type: mv.type, quantity: qty, unitCost: cost,
          totalCost: addValue, runningQty, runningValue, waCost: Math.round(waCost * 10000) / 10000,
        });
      } else if (isOut) {
        const waCost = runningQty > 0 ? runningValue / runningQty : 0;
        const cogsValue = qty * waCost;
        runningQty = Math.max(0, runningQty - qty);
        runningValue = runningQty * waCost;
        waHistory.push({
          date: mv.date, type: mv.type, quantity: -qty, unitCost: waCost,
          totalCost: -cogsValue, runningQty, runningValue, waCost: Math.round(waCost * 10000) / 10000,
        });
      }
    }

    const currentWa = runningQty > 0 ? Math.round((runningValue / runningQty) * 10000) / 10000 : 0;

    res.json({
      product,
      currentWaCost: currentWa,
      currentStockValue: Math.round(currentWa * Number(product.currentStock) * 100) / 100,
      movements: waHistory,
    });
  } catch (err) {
    handleRouteError(err, res, "Product inventory costing error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ROUNDING DIFFERENCES — فروقات التقريب
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/rounding-account", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [account] = await rawQuery<any>(
      `SELECT * FROM chart_of_accounts WHERE "companyId"=$1 AND (code='9999' OR name LIKE '%تقريب%') ORDER BY code LIMIT 1`,
      [scope.companyId]
    );
    res.json({ account: account ?? null });
  } catch (err) {
    handleRouteError(err, res, "Rounding account error:");
  }
});

financeAlgorithmsRouter.post("/rounding-account/setup", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);

    const [existing] = await rawQuery<any>(
      `SELECT * FROM chart_of_accounts WHERE "companyId"=$1 AND code='9999'`,
      [scope.companyId]
    );
    if (existing) {
      res.json({ account: existing, message: "حساب فروقات التقريب موجود مسبقاً" });
      return;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO chart_of_accounts ("companyId",code,name,"nameEn",type,level,"parentCode","isActive")
       VALUES ($1,'9999','فروقات التقريب','Rounding Differences','expense',2,null,true)`,
      [scope.companyId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM chart_of_accounts WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json({ account: row, message: "تم إنشاء حساب فروقات التقريب (9999)" });
  } catch (err) {
    handleRouteError(err, res, "Setup rounding account error:");
  }
});

financeAlgorithmsRouter.post("/rounding-differences/apply", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);

    const { journalEntryId, roundingAmount, description } = req.body as any;
    if (!journalEntryId || Math.abs(Number(roundingAmount ?? 0)) === 0) {
      throw new ValidationError("معرف القيد وفرق التقريب مطلوبان");
    }
    const diff = Math.round(Number(roundingAmount) * 100) / 100;
    if (Math.abs(diff) > 0.05) {
      throw new ValidationError("فرق التقريب يتجاوز الحد المسموح (0.05 ﷼)");
    }

    const [roundingAcc] = await rawQuery<any>(
      `SELECT code FROM chart_of_accounts WHERE "companyId"=$1 AND code='9999' LIMIT 1`,
      [scope.companyId]
    );
    if (!roundingAcc) {
      throw new ValidationError("يجب إنشاء حساب فروقات التقريب أولاً");
    }

    const [je] = await rawQuery<any>(
      `SELECT id FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [journalEntryId, scope.companyId]
    );
    if (!je) throw new NotFoundError("القيد اليومي غير موجود أو لا يتبع هذه الشركة");

    await rawExecute(
      `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description)
       VALUES ($1,'9999',$2,$3,$4)`,
      [journalEntryId, diff > 0 ? diff : 0, diff < 0 ? Math.abs(diff) : 0,
       description ?? "فرق تقريب تلقائي"]
    );

    await updateAccountBalances(scope.companyId, [
      { accountCode: "9999", debit: diff > 0 ? diff : 0, credit: diff < 0 ? Math.abs(diff) : 0 },
    ]);

    res.json({ message: `تم تسجيل فرق التقريب (${diff.toFixed(2)} ﷼) في حساب 9999` });
  } catch (err) {
    handleRouteError(err, res, "Apply rounding difference error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FX RATES & REVALUATION — إعادة تقييم العملات الأجنبية
// ─────────────────────────────────────────────────────────────────────────────
//
// Functional currency = SAR. Foreign-currency-denominated monetary balances
// (invoices, POs, bank accounts) must be restated at period-end using the
// closing rate. The difference vs. the booked value is posted as unrealized
// FX gain/loss.
//
// Tables are created lazily so no extra migration is needed:
//   fx_rates(id, companyId, rateDate, fromCurrency, toCurrency, rate, type)
//   fx_revaluations(id, companyId, period, journalEntryId, postedAt, ...)

async function ensureFxTables(client?: any) {
  const exec = client ? (sql: string, params?: any[]) => client.query(sql, params) : rawExecute;
  await exec(`
    CREATE TABLE IF NOT EXISTS fx_rates (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      "rateDate" DATE NOT NULL,
      "fromCurrency" VARCHAR(8) NOT NULL,
      "toCurrency" VARCHAR(8) NOT NULL DEFAULT 'SAR',
      rate NUMERIC(18,8) NOT NULL,
      type VARCHAR(16) NOT NULL DEFAULT 'spot',
      "createdAt" TIMESTAMP DEFAULT NOW(),
      UNIQUE ("companyId","rateDate","fromCurrency","toCurrency","type")
    )
  `);
  await exec(`
    CREATE TABLE IF NOT EXISTS fx_revaluations (
      id SERIAL PRIMARY KEY,
      "companyId" INTEGER NOT NULL,
      period VARCHAR(7) NOT NULL,
      "journalEntryId" INTEGER,
      "totalGain" NUMERIC(18,2) DEFAULT 0,
      "totalLoss" NUMERIC(18,2) DEFAULT 0,
      details JSONB,
      "postedBy" INTEGER,
      "postedAt" TIMESTAMP DEFAULT NOW(),
      UNIQUE ("companyId",period)
    )
  `);
  // Ensure foreign-currency columns exist on invoices & purchase_orders
  await exec(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'SAR'`);
  await exec(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "exchangeRate" NUMERIC(18,8) DEFAULT 1`);
  await exec(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS currency VARCHAR(8) DEFAULT 'SAR'`);
  await exec(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS "exchangeRate" NUMERIC(18,8) DEFAULT 1`);
}

// List FX rates
financeAlgorithmsRouter.get("/fx/rates", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureFxTables();
    const { from, to, type } = req.query as any;
    const params: any[] = [scope.companyId];
    let where = `"companyId"=$1`;
    if (from) { params.push(from); where += ` AND "fromCurrency"=$${params.length}`; }
    if (to) { params.push(to); where += ` AND "toCurrency"=$${params.length}`; }
    if (type) { params.push(type); where += ` AND type=$${params.length}`; }
    const rows = await rawQuery<any>(
      `SELECT * FROM fx_rates WHERE ${where} ORDER BY "rateDate" DESC, "fromCurrency" ASC LIMIT 500`,
      params
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "FX rates list error:");
  }
});

// Upsert FX rate
financeAlgorithmsRouter.post("/fx/rates", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const { rateDate, fromCurrency, toCurrency = "SAR", rate, type = "spot" } = req.body as any;
    if (!rateDate || !fromCurrency || !rate || Number(rate) <= 0) {
      throw new ValidationError("rateDate / fromCurrency / rate مطلوبة", { field: "rate", fix: "أدخل قيمة موجبة للسعر والعملة والتاريخ" });
    }
    await ensureFxTables();
    const [row] = await rawQuery<any>(
      `INSERT INTO fx_rates ("companyId","effectiveDate","fromCurrency","toCurrency",rate,source)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("companyId","effectiveDate","fromCurrency","toCurrency","source")
       DO UPDATE SET rate=EXCLUDED.rate
       RETURNING *`,
      [scope.companyId, rateDate, String(fromCurrency).toUpperCase(), String(toCurrency).toUpperCase(), Number(rate), type]
    );
    res.status(201).json({ data: row });
  } catch (err) {
    handleRouteError(err, res, "FX rate upsert error:");
  }
});

// Preview FX revaluation for a period (no posting)
financeAlgorithmsRouter.get("/fx/revaluation/preview", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const period = (req.query.period as string) ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new ValidationError("period يجب أن يكون بصيغة YYYY-MM", { field: "period", fix: "استخدم صيغة YYYY-MM مثل 2026-04" });
    }
    await ensureFxTables();

    // Period-end date = last day of month
    const [y, m] = period.split("-").map(Number);
    const periodEnd = new Date(y, m, 0).toISOString().slice(0, 10);

    // Open foreign-currency invoices
    const openInvoices = await rawQuery<any>(
      `SELECT id, "invoiceNumber", currency, "exchangeRate", total, "paidAmount", "clientId"
       FROM invoices
       WHERE "companyId"=$1
         AND currency IS NOT NULL AND currency <> 'SAR'
         AND status <> 'paid' AND status <> 'cancelled'
         AND COALESCE("deletedAt", NULL) IS NULL
         AND "invoiceDate"::date <= $2::date`,
      [scope.companyId, periodEnd]
    );

    // Open foreign-currency POs (AP proxy)
    const openPOs = await rawQuery<any>(
      `SELECT id, "poNumber", currency, "exchangeRate", total, status, "supplierId"
       FROM purchase_orders
       WHERE "companyId"=$1
         AND currency IS NOT NULL AND currency <> 'SAR'
         AND status NOT IN ('paid','cancelled','draft')
         AND "orderDate"::date <= $2::date`,
      [scope.companyId, periodEnd]
    );

    // Find closing rate per currency (latest rate_date <= periodEnd with type='period_end' or 'spot')
    const currencies = Array.from(
      new Set<string>([...openInvoices.map((i: any) => i.currency), ...openPOs.map((p: any) => p.currency)])
    );
    const rateMap: Record<string, number> = {};
    for (const cur of currencies) {
      const [r] = await rawQuery<any>(
        `SELECT rate FROM fx_rates
         WHERE "companyId"=$1 AND "fromCurrency"=$2 AND "toCurrency"='SAR'
           AND "rateDate"::date <= $3::date
         ORDER BY (type='period_end') DESC, "rateDate" DESC LIMIT 1`,
        [scope.companyId, cur, periodEnd]
      );
      rateMap[cur] = r ? Number(r.rate) : 0;
    }

    let totalGain = 0;
    let totalLoss = 0;
    const details: any[] = [];

    for (const inv of openInvoices) {
      const booked = Number(inv.exchangeRate) || 1;
      const closing = rateMap[inv.currency] || 0;
      if (!closing) continue;
      const outstandingFc = Number(inv.total) - Number(inv.paidAmount ?? 0); // foreign currency
      const bookedSar = Math.round(outstandingFc * booked * 100) / 100;
      const revaluedSar = Math.round(outstandingFc * closing * 100) / 100;
      const diff = Math.round((revaluedSar - bookedSar) * 100) / 100; // AR asset → gain if positive
      if (Math.abs(diff) < 0.01) continue;
      if (diff > 0) totalGain += diff; else totalLoss += -diff;
      details.push({
        kind: "AR",
        refType: "invoice",
        refId: inv.id,
        refNumber: inv.invoiceNumber,
        currency: inv.currency,
        outstandingFc,
        bookedRate: booked,
        closingRate: closing,
        bookedSar,
        revaluedSar,
        diff,
      });
    }

    for (const po of openPOs) {
      const booked = Number(po.exchangeRate) || 1;
      const closing = rateMap[po.currency] || 0;
      if (!closing) continue;
      const outstandingFc = Number(po.total);
      const bookedSar = Math.round(outstandingFc * booked * 100) / 100;
      const revaluedSar = Math.round(outstandingFc * closing * 100) / 100;
      // AP liability → loss if closing > booked (liability grew)
      const diff = Math.round((revaluedSar - bookedSar) * 100) / 100;
      if (Math.abs(diff) < 0.01) continue;
      if (diff > 0) totalLoss += diff; else totalGain += -diff;
      details.push({
        kind: "AP",
        refType: "purchase_order",
        refId: po.id,
        refNumber: po.poNumber,
        currency: po.currency,
        outstandingFc,
        bookedRate: booked,
        closingRate: closing,
        bookedSar,
        revaluedSar,
        diff,
      });
    }

    res.json({
      period,
      periodEnd,
      rates: rateMap,
      totalGain: Math.round(totalGain * 100) / 100,
      totalLoss: Math.round(totalLoss * 100) / 100,
      netImpact: Math.round((totalGain - totalLoss) * 100) / 100,
      lineCount: details.length,
      details,
    });
  } catch (err) {
    handleRouteError(err, res, "FX revaluation preview error:");
  }
});

// Post FX revaluation journal entry for the period
financeAlgorithmsRouter.post("/fx/revaluation/post", requirePermission("finance:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    assertFinanceRole(scope);
    const period = (req.body?.period as string) ?? new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(period)) {
      throw new ValidationError("period يجب أن يكون بصيغة YYYY-MM", { field: "period", fix: "استخدم صيغة YYYY-MM مثل 2026-04" });
    }
    await ensureFxTables();
    const [yPeriod, mPeriod] = period.split("-").map(Number);
    const periodEndDate = new Date(yPeriod, mPeriod, 0).toISOString().slice(0, 10);
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, periodEndDate);
    if (!periodCheck.open) {
      throw new ValidationError(`لا يمكن الترحيل — الفترة ${periodCheck.periodName ?? period} مقفلة`);
    }

    const [existing] = await rawQuery<any>(
      `SELECT id FROM fx_revaluations WHERE "companyId"=$1 AND period=$2`,
      [scope.companyId, period]
    );
    if (existing) {
      throw new ConflictError(`تم تسجيل إعادة تقييم العملات لفترة ${period} مسبقاً`);
    }

    // Reuse preview logic by calling it inline via the same query shape
    const [y, m] = period.split("-").map(Number);
    const periodEnd = new Date(y, m, 0).toISOString().slice(0, 10);

    const openInvoices = await rawQuery<any>(
      `SELECT id, "invoiceNumber", currency, "exchangeRate", total, "paidAmount"
       FROM invoices
       WHERE "companyId"=$1 AND currency IS NOT NULL AND currency<>'SAR'
         AND status NOT IN ('paid','cancelled') AND COALESCE("deletedAt",NULL) IS NULL
         AND "invoiceDate"::date <= $2::date`,
      [scope.companyId, periodEnd]
    );
    const openPOs = await rawQuery<any>(
      `SELECT id, "poNumber", currency, "exchangeRate", total
       FROM purchase_orders
       WHERE "companyId"=$1 AND currency IS NOT NULL AND currency<>'SAR'
         AND status NOT IN ('paid','cancelled','draft')
         AND "orderDate"::date <= $2::date`,
      [scope.companyId, periodEnd]
    );

    const currencies = Array.from(new Set<string>([
      ...openInvoices.map((i: any) => i.currency),
      ...openPOs.map((p: any) => p.currency),
    ]));
    const rateMap: Record<string, number> = {};
    for (const cur of currencies) {
      const [r] = await rawQuery<any>(
        `SELECT rate FROM fx_rates
         WHERE "companyId"=$1 AND "fromCurrency"=$2 AND "toCurrency"='SAR'
           AND "rateDate"::date <= $3::date
         ORDER BY (type='period_end') DESC, "rateDate" DESC LIMIT 1`,
        [scope.companyId, cur, periodEnd]
      );
      rateMap[cur] = r ? Number(r.rate) : 0;
    }

    let arDiff = 0; // net AR adjustment (DR if positive → asset up)
    let apDiff = 0; // net AP adjustment (CR if positive → liability up)
    const details: any[] = [];

    for (const inv of openInvoices) {
      const closing = rateMap[inv.currency] || 0;
      if (!closing) continue;
      const booked = Number(inv.exchangeRate) || 1;
      const outstandingFc = Number(inv.total) - Number(inv.paidAmount ?? 0);
      const diff = Math.round(outstandingFc * (closing - booked) * 100) / 100;
      if (Math.abs(diff) < 0.01) continue;
      arDiff += diff;
      details.push({ kind: "AR", refId: inv.id, refNumber: inv.invoiceNumber, currency: inv.currency, diff });
    }
    for (const po of openPOs) {
      const closing = rateMap[po.currency] || 0;
      if (!closing) continue;
      const booked = Number(po.exchangeRate) || 1;
      const outstandingFc = Number(po.total);
      const diff = Math.round(outstandingFc * (closing - booked) * 100) / 100;
      if (Math.abs(diff) < 0.01) continue;
      apDiff += diff;
      details.push({ kind: "AP", refId: po.id, refNumber: po.poNumber, currency: po.currency, diff });
    }

    arDiff = Math.round(arDiff * 100) / 100;
    apDiff = Math.round(apDiff * 100) / 100;

    if (arDiff === 0 && apDiff === 0) {
      throw new ValidationError("لا توجد فروق إعادة تقييم لهذه الفترة");
    }

    // Account codes (configurable via accounting_mappings)
    const { financialEngine } = await import("../lib/engines/index.js");
    const arCode = await financialEngine.resolveAccountCode(scope.companyId, "fx_revaluation_ar", "debit", "1200");
    const apCode = await financialEngine.resolveAccountCode(scope.companyId, "fx_revaluation_ap", "credit", "2100");
    const gainCode = await financialEngine.resolveAccountCode(scope.companyId, "fx_revaluation_gain", "credit", "4910");
    const lossCode = await financialEngine.resolveAccountCode(scope.companyId, "fx_revaluation_loss", "debit", "5910");

    // Build JE lines
    const lines: Array<{ accountCode: string; debit: number; credit: number; description: string }> = [];
    // AR adjustment
    if (arDiff > 0) {
      lines.push({ accountCode: arCode, debit: arDiff, credit: 0, description: `إعادة تقييم ذمم مدينة — ${period}` });
      lines.push({ accountCode: gainCode, debit: 0, credit: arDiff, description: `ربح صرف غير محقق — AR` });
    } else if (arDiff < 0) {
      const v = -arDiff;
      lines.push({ accountCode: lossCode, debit: v, credit: 0, description: `خسارة صرف غير محققة — AR` });
      lines.push({ accountCode: arCode, debit: 0, credit: v, description: `إعادة تقييم ذمم مدينة — ${period}` });
    }
    // AP adjustment
    if (apDiff > 0) {
      // Liability up → DR loss / CR AP
      lines.push({ accountCode: lossCode, debit: apDiff, credit: 0, description: `خسارة صرف غير محققة — AP` });
      lines.push({ accountCode: apCode, debit: 0, credit: apDiff, description: `إعادة تقييم ذمم دائنة — ${period}` });
    } else if (apDiff < 0) {
      const v = -apDiff;
      lines.push({ accountCode: apCode, debit: v, credit: 0, description: `إعادة تقييم ذمم دائنة — ${period}` });
      lines.push({ accountCode: gainCode, debit: 0, credit: v, description: `ربح صرف غير محقق — AP` });
    }

    const { journalId: journalEntryId } = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId ?? 0,
      createdBy: scope.activeAssignmentId,
      ref: `FX-REVAL-${period}`,
      description: `إعادة تقييم العملات الأجنبية — ${period}`,
      type: "fx_revaluation",
      sourceType: "fx_revaluation",
      sourceId: 0,
      sourceKey: `finance:fx_reval:${scope.companyId}:${period}`,
      lines,
    });

    const totalGain = lines.filter(l => l.accountCode === gainCode).reduce((s, l) => s + l.credit, 0);
    const totalLoss = lines.filter(l => l.accountCode === lossCode).reduce((s, l) => s + l.debit, 0);

    const [revRow] = await rawQuery<any>(
      `INSERT INTO fx_revaluations ("companyId","revaluationDate","journalEntryId","totalImpact","createdBy")
       VALUES ($1,$2::date,$3,$4,$5) RETURNING id`,
      [scope.companyId, period, journalEntryId, totalGain - totalLoss, scope.activeAssignmentId]
    );
    const revalId = revRow?.id;

    res.status(201).json({
      revaluationId: revalId,
      journalEntryId,
      period,
      arDiff,
      apDiff,
      lineCount: details.length,
      message: `تم تسجيل إعادة تقييم العملات لفترة ${period}`,
    });
  } catch (err) {
    handleRouteError(err, res, "FX revaluation post error:");
  }
});

// List past revaluations
financeAlgorithmsRouter.get("/fx/revaluation", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    await ensureFxTables();
    const rows = await rawQuery<any>(
      `SELECT * FROM fx_revaluations WHERE "companyId"=$1 ORDER BY period DESC LIMIT 120`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "FX revaluation list error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TREASURY — الخزينة وإدارة السيولة
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/treasury", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;

    const cashAccounts = await rawQuery<any>(
      `SELECT ca.id, ca.code, ca.name, ca.nature, ca."currentBalance",
              ca."allowPosting", ca."parentCode", ca.level
       FROM chart_of_accounts ca
       WHERE ca."companyId" = $1
         AND ca."deletedAt" IS NULL
         AND ca."allowPosting" = true
         AND (ca.code LIKE '11%' OR ca.code LIKE '12%')
       ORDER BY ca.code`,
      [scope.companyId]
    );

    const totalCash = cashAccounts.reduce((s: number, a: any) => s + Number(a.currentBalance ?? 0), 0);
    const cashOnHand = cashAccounts.filter((a: any) => a.code?.startsWith("110")).reduce((s: number, a: any) => s + Number(a.currentBalance ?? 0), 0);
    const bankBalances = cashAccounts.filter((a: any) => a.code?.startsWith("11") && !a.code?.startsWith("110")).reduce((s: number, a: any) => s + Number(a.currentBalance ?? 0), 0);
    const receivables = cashAccounts.filter((a: any) => a.code?.startsWith("12")).reduce((s: number, a: any) => s + Number(a.currentBalance ?? 0), 0);

    const today = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const recentMovements = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je.type, je."createdAt",
              json_agg(json_build_object(
                'accountCode', jl."accountCode", 'debit', jl.debit, 'credit', jl.credit
              )) AS lines,
              SUM(CASE WHEN jl.debit > 0 AND (jl."accountCode" LIKE '11%' OR jl."accountCode" LIKE '12%') THEN jl.debit ELSE 0 END) AS "cashIn",
              SUM(CASE WHEN jl.credit > 0 AND (jl."accountCode" LIKE '11%' OR jl."accountCode" LIKE '12%') THEN jl.credit ELSE 0 END) AS "cashOut"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1
         AND je."deletedAt" IS NULL
         AND je.status = 'posted'
         AND je."createdAt" >= $2
         AND EXISTS (
           SELECT 1 FROM journal_lines jl2
           WHERE jl2."journalId" = je.id AND (jl2."accountCode" LIKE '11%' OR jl2."accountCode" LIKE '12%')
         )
       GROUP BY je.id
       ORDER BY je."createdAt" DESC
       LIMIT 50`,
      [scope.companyId, thirtyDaysAgo]
    );

    const dailySummary = await rawQuery<any>(
      `SELECT DATE(je."createdAt") AS day,
              SUM(CASE WHEN jl.debit > 0 AND (jl."accountCode" LIKE '11%' OR jl."accountCode" LIKE '12%') THEN jl.debit ELSE 0 END) AS "totalIn",
              SUM(CASE WHEN jl.credit > 0 AND (jl."accountCode" LIKE '11%' OR jl."accountCode" LIKE '12%') THEN jl.credit ELSE 0 END) AS "totalOut"
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
         AND je.status = 'posted'
         AND je."createdAt" >= $2
         AND (jl."accountCode" LIKE '11%' OR jl."accountCode" LIKE '12%')
       GROUP BY DATE(je."createdAt")
       ORDER BY day DESC`,
      [scope.companyId, thirtyDaysAgo]
    );

    const custodySummary = await rawQuery<any>(
      `SELECT COUNT(*) FILTER (WHERE remaining > 0) AS "activeCustodies",
              COALESCE(SUM(remaining) FILTER (WHERE remaining > 0), 0) AS "totalOutstanding"
       FROM (
         SELECT je.id,
                SUM(CASE WHEN jl.debit > 0 THEN jl.debit ELSE 0 END)
                - COALESCE((SELECT SUM(jl2.credit) FROM journal_lines jl2 JOIN journal_entries je2 ON je2.id = jl2."journalId"
                   WHERE je2."companyId" = $1 AND je2."deletedAt" IS NULL AND je2.status = 'posted' AND je2.ref LIKE 'CUSTODY-SETTLE%'
                   AND je2.description LIKE '%' || je.ref || '%'), 0) AS remaining
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id
         WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
           AND je.status = 'posted'
           AND je.ref LIKE 'CUSTODY-%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'
         GROUP BY je.id, je.ref
       ) sub`,
      [scope.companyId]
    );

    res.json({
      accounts: cashAccounts,
      summary: {
        totalCash,
        cashOnHand,
        bankBalances,
        receivables,
        activeCustodies: Number(custodySummary[0]?.activeCustodies ?? 0),
        outstandingCustodies: Number(custodySummary[0]?.totalOutstanding ?? 0),
      },
      recentMovements,
      dailySummary,
    });
  } catch (err) {
    handleRouteError(err, res, "Treasury overview error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY FINANCIAL PROFILE — الملف المالي الشامل لأي كيان
// Returns all GL transactions, subsidiary accounts, and cost breakdown
// for a given entity (vehicle, employee, property, project, product, vendor)
// ─────────────────────────────────────────────────────────────────────────────
financeAlgorithmsRouter.get("/entity-financial-profile", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.query as { entityType: string; entityId: string };
    if (!entityType || !entityId) throw new ValidationError("entityType و entityId مطلوبان");
    const eid = Number(entityId);
    const cid = scope.companyId;

    const safeColumns: Record<string, string> = {
      vehicle: 'jl."vehicleId"',
      employee: 'jl."employeeId"',
      property: 'jl."propertyId"',
      project: 'jl."projectId"',
      contract: 'jl."contractId"',
      product: 'jl."productId"',
      vendor: 'jl."vendorId"',
      client: 'jl."clientId"',
      driver: 'jl."driverId"',
    };
    const safeCol = safeColumns[entityType];

    if (!safeCol) throw new ValidationError("نوع الكيان غير مدعوم", { field: "entityType" });

    const [subsidiaryAccounts, transactions, costBreakdown, totalSummary] = await Promise.all([
      rawQuery<any>(
        `SELECT sa.*, ca.code AS "accountCode", ca.name AS "accountName", ca.type AS "accountType",
                COALESCE((SELECT SUM(jl.debit) - SUM(jl.credit) FROM journal_lines jl
                  JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1
                  WHERE jl."accountCode" = ca.code AND je.status = 'posted'), 0) AS balance
         FROM subsidiary_accounts sa
         JOIN chart_of_accounts ca ON ca.id = sa."accountId"
         WHERE sa."companyId" = $1 AND sa."entityType" = $2 AND sa."entityId" = $3`,
        [cid, entityType, eid]
      ),

      rawQuery<any>(
        `SELECT je.id, je.ref, je.description, je."createdAt", je.type AS "journalType",
                je."sourceType", je."sourceId",
                jl."accountCode", ca.name AS "accountName",
                jl.debit, jl.credit
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1
         LEFT JOIN chart_of_accounts ca ON ca.code = jl."accountCode" AND ca."companyId" = $1
         WHERE ${safeCol} = $2
         ORDER BY je."createdAt" DESC
         LIMIT 50`,
        [cid, eid]
      ),

      rawQuery<any>(
        `SELECT ca.code, ca.name,
                SUM(jl.debit) AS "totalDebit",
                SUM(jl.credit) AS "totalCredit",
                SUM(jl.debit) - SUM(jl.credit) AS "netAmount",
                COUNT(*) AS "transactionCount"
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1
         LEFT JOIN chart_of_accounts ca ON ca.code = jl."accountCode" AND ca."companyId" = $1
         WHERE ${safeCol} = $2 AND je.status = 'posted'
         GROUP BY ca.code, ca.name
         ORDER BY SUM(jl.debit) DESC`,
        [cid, eid]
      ),

      rawQuery<any>(
        `SELECT
           COUNT(DISTINCT je.id) AS "journalCount",
           SUM(jl.debit) AS "totalDebit",
           SUM(jl.credit) AS "totalCredit",
           MIN(je."createdAt") AS "firstTransaction",
           MAX(je."createdAt") AS "lastTransaction"
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1
         WHERE ${safeCol} = $2 AND je.status = 'posted'`,
        [cid, eid]
      ),
    ]);

    res.json({
      entityType,
      entityId: eid,
      subsidiaryAccounts,
      summary: totalSummary[0] || { journalCount: 0, totalDebit: 0, totalCredit: 0 },
      costBreakdown,
      recentTransactions: transactions,
    });
  } catch (err) {
    handleRouteError(err, res, "Entity financial profile error:");
  }
});

export default financeAlgorithmsRouter;
