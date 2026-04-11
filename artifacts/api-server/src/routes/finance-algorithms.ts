import { handleRouteError, validationError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { createJournalEntry } from "../lib/businessHelpers.js";

export const financeAlgorithmsRouter = Router();
financeAlgorithmsRouter.use(authMiddleware);

const FINANCE_ROLES = ["finance_manager", "general_manager", "owner"];

function requireFinance(scope: any, res: any): boolean {
  if (!FINANCE_ROLES.includes(scope.role)) {
    res.status(403).json({ error: "هذه العملية مخصصة لموظفي المالية فقط" });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// AR AGING — تقادم الذمم المدينة
// ─────────────────────────────────────────────────────────────────────────────

financeAlgorithmsRouter.get("/ar-aging", async (req, res) => {
  try {
    const scope = req.scope!;
    const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split("T")[0];

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

financeAlgorithmsRouter.get("/ap-aging", async (req, res) => {
  try {
    const scope = req.scope!;
    const asOfDate = (req.query.asOfDate as string) || new Date().toISOString().split("T")[0];

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

financeAlgorithmsRouter.post("/bank-reconciliation/import", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;

    const { rows, accountCode = "1120", statementDate } = req.body as any;
    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "لا توجد بيانات في الكشف البنكي" });
      return;
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

financeAlgorithmsRouter.post("/bank-reconciliation/auto-match", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;

    const { batchId, accountCode = "1120", toleranceDays = 3 } = req.body as any;

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

financeAlgorithmsRouter.get("/bank-reconciliation/:batchId", async (req, res) => {
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

financeAlgorithmsRouter.post("/bank-reconciliation/manual-match", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const { bankStatementId, journalLineId } = req.body as any;
    if (!bankStatementId || !journalLineId) {
      res.status(400).json({ error: "bankStatementId و journalLineId مطلوبان" });
      return;
    }
    const [bs] = await rawQuery<any>(
      `SELECT * FROM bank_statements WHERE id=$1 AND "companyId"=$2 AND "matchStatus"='unmatched'`,
      [bankStatementId, scope.companyId]
    );
    if (!bs) { res.status(404).json({ error: "سطر الكشف البنكي غير موجود أو تمت مطابقته مسبقاً" }); return; }

    const [jl] = await rawQuery<any>(
      `SELECT jl.id FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId"
       WHERE jl.id=$1 AND je."companyId"=$2
         AND jl."accountCode"=$3
         AND NOT EXISTS (SELECT 1 FROM bank_statements bs2 WHERE bs2."matchedJournalLineId"=jl.id)`,
      [journalLineId, scope.companyId, bs.accountCode]
    );
    if (!jl) {
      res.status(403).json({ error: "سطر القيد غير موجود أو لا يتبع نفس الشركة/الحساب أو تمت مطابقته" });
      return;
    }

    await rawExecute(
      `UPDATE bank_statements SET "matchStatus"='matched', "matchedJournalLineId"=$1 WHERE id=$2`,
      [journalLineId, bankStatementId]
    );
    res.json({ success: true, message: "تمت المطابقة اليدوية" });
  } catch (err) {
    handleRouteError(err, res, "Manual match error:");
  }
});

financeAlgorithmsRouter.get("/journal-lines/search", async (req, res) => {
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

financeAlgorithmsRouter.get("/bank-reconciliation", async (req, res) => {
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

financeAlgorithmsRouter.get("/fixed-assets", async (req, res) => {
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

financeAlgorithmsRouter.post("/fixed-assets", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const b = req.body as any;
    if (!b.name || !b.purchaseCost || !b.purchaseDate) {
      res.status(400).json({ error: "الاسم والتكلفة وتاريخ الشراء مطلوبة" });
      return;
    }
    const usefulYears = Number(b.usefulLifeYears ?? 5);
    if (!usefulYears || usefulYears <= 0) {
      res.status(400).json({ error: "العمر الإنتاجي يجب أن يكون أكبر من صفر" });
      return;
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
    const [row] = await rawQuery<any>(`SELECT * FROM fixed_assets WHERE id = $1`, [insertId]);
    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create fixed asset error:");
  }
});

financeAlgorithmsRouter.get("/fixed-assets/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [asset] = await rawQuery<any>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2`,
      [Number(req.params.id), scope.companyId]
    );
    if (!asset) { res.status(404).json({ error: "الأصل غير موجود" }); return; }
    const schedule = await rawQuery<any>(
      `SELECT * FROM depreciation_entries WHERE "assetId"=$1 ORDER BY period ASC`,
      [asset.id]
    );
    res.json({ ...asset, schedule });
  } catch (err) {
    handleRouteError(err, res, "Get fixed asset error:");
  }
});

financeAlgorithmsRouter.patch("/fixed-assets/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const id = Number(req.params.id);
    const b = req.body as any;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.usefulLifeYears !== undefined && Number(b.usefulLifeYears) <= 0) {
      res.status(400).json({ error: "العمر الإنتاجي يجب أن يكون أكبر من صفر" });
      return;
    }
    const f = (col: string, val: any) => { if (val !== undefined) { params.push(val); sets.push(`"${col}"=$${params.length}`); } };
    f("name", b.name); f("description", b.description); f("category", b.category);
    f("salvageValue", b.salvageValue); f("usefulLifeYears", b.usefulLifeYears);
    f("depreciationMethod", b.depreciationMethod); f("status", b.status);
    if (sets.length === 1) { res.status(400).json({ error: "لا توجد تغييرات" }); return; }
    params.push(id, scope.companyId);
    const [row] = await rawQuery<any>(
      `UPDATE fixed_assets SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} RETURNING *`,
      params
    );
    if (!row) { res.status(404).json({ error: "الأصل غير موجود" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Update fixed asset error:");
  }
});

/** Calculate depreciation for an asset for a given period, capped by remaining depreciable amount */
function calcDepreciationAmount(asset: any, _period: string): number {
  const purchaseCost = Number(asset.purchaseCost);
  const salvageValue = Number(asset.salvageValue);
  const usefulLife = Number(asset.usefulLifeYears);
  const currentBookValue = Number(asset.currentBookValue ?? purchaseCost);
  const remainingDepreciable = Math.max(0, currentBookValue - salvageValue);

  if (remainingDepreciable <= 0) return 0;
  if (!usefulLife || usefulLife <= 0) return 0;

  let monthlyAmount: number;
  if (asset.depreciationMethod === "declining_balance") {
    const annualRate = 2 / usefulLife;
    monthlyAmount = Math.round(currentBookValue * (annualRate / 12) * 100) / 100;
  } else {
    const depreciable = purchaseCost - salvageValue;
    monthlyAmount = Math.round((depreciable / (usefulLife * 12)) * 100) / 100;
  }

  return Math.min(monthlyAmount, remainingDepreciable);
}

financeAlgorithmsRouter.get("/fixed-assets/:id/schedule", async (req, res) => {
  try {
    const scope = req.scope!;
    const [asset] = await rawQuery<any>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2`,
      [Number(req.params.id), scope.companyId]
    );
    if (!asset) { res.status(404).json({ error: "الأصل غير موجود" }); return; }

    const purchaseCost = Number(asset.purchaseCost);
    const salvageValue = Number(asset.salvageValue);
    const usefulLifeYears = Number(asset.usefulLifeYears);
    if (!usefulLifeYears || usefulLifeYears <= 0) {
      res.status(400).json({ error: "العمر الإنتاجي غير محدد لهذا الأصل — لا يمكن حساب جدول الإهلاك" });
      return;
    }
    const usefulLifeMonths = usefulLifeYears * 12;
    const depreciable = purchaseCost - salvageValue;
    const scheduleRows: any[] = [];
    let bookValue = purchaseCost;
    let accumulated = 0;

    const purchaseDate = new Date(asset.purchaseDate);
    for (let m = 0; m < usefulLifeMonths; m++) {
      const d = new Date(purchaseDate);
      d.setMonth(d.getMonth() + m + 1);
      const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

      let monthlyDep: number;
      if (asset.depreciationMethod === "declining_balance") {
        const annualRate = 2 / Number(asset.usefulLifeYears);
        monthlyDep = Math.max(0, Math.round(bookValue * (annualRate / 12) * 100) / 100);
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

    res.json({ assetId: asset.id, assetName: asset.name, schedule: scheduleRows, totalDepreciable: depreciable });
  } catch (err) {
    handleRouteError(err, res, "Depreciation schedule error:");
  }
});

financeAlgorithmsRouter.post("/fixed-assets/:id/depreciate", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const id = Number(req.params.id);
    const { period } = req.body as any;
    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);

    const [asset] = await rawQuery<any>(
      `SELECT * FROM fixed_assets WHERE id=$1 AND "companyId"=$2 AND status='active'`,
      [id, scope.companyId]
    );
    if (!asset) { res.status(404).json({ error: "الأصل غير موجود أو غير نشط" }); return; }

    const [existing] = await rawQuery<any>(
      `SELECT id FROM depreciation_entries WHERE "assetId"=$1 AND period=$2`,
      [id, targetPeriod]
    );
    if (existing) {
      res.status(409).json({ error: `تم إهلاك هذا الأصل لفترة ${targetPeriod} مسبقاً` });
      return;
    }

    const depAmount = calcDepreciationAmount(asset, targetPeriod);
    if (depAmount <= 0) {
      res.status(400).json({ error: "لا يوجد إهلاك متبقي لهذا الأصل" });
      return;
    }

    const newAccumulated = Number(asset.accumulatedDepreciation) + depAmount;
    const newBookValue = Math.max(Number(asset.purchaseCost) - newAccumulated, Number(asset.salvageValue));

    let entryId: number | undefined;
    await withTransaction(async (client) => {
      const jeRes = await client.query(
        `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type)
         VALUES ($1,$2,$3,$4,$5,'depreciation') RETURNING id`,
        [scope.companyId, scope.branchId ?? asset.branchId, scope.activeAssignmentId,
         `DEP-${asset.code ?? asset.id}-${targetPeriod}`,
         `إهلاك شهري: ${asset.name} — ${targetPeriod}`]
      );
      const journalId = jeRes.rows[0].id;

      await client.query(
        `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description) VALUES ($1,$2,$3,0,$4)`,
        [journalId, asset.depreciationAccountCode ?? "6100", depAmount, `إهلاك ${asset.name}`]
      );
      await client.query(
        `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description) VALUES ($1,$2,0,$3,$4)`,
        [journalId, asset.accDepreciationAccountCode ?? "1590", depAmount, `مجمع إهلاك ${asset.name}`]
      );

      const entRes = await client.query(
        `INSERT INTO depreciation_entries ("assetId","companyId",period,"depreciationAmount","bookValueAfter","journalEntryId",status,"postedAt")
         VALUES ($1,$2,$3,$4,$5,$6,'posted',NOW()) RETURNING id`,
        [id, scope.companyId, targetPeriod, depAmount, newBookValue, journalId]
      );
      entryId = entRes.rows[0].id;

      await client.query(
        `UPDATE fixed_assets SET "accumulatedDepreciation"=$1, "currentBookValue"=$2, "updatedAt"=NOW() WHERE id=$3`,
        [newAccumulated, newBookValue, id]
      );
    });

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

financeAlgorithmsRouter.post("/fixed-assets/depreciate-all", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;
    const { period } = req.body as any;
    const targetPeriod = period ?? new Date().toISOString().slice(0, 7);

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

      await withTransaction(async (client) => {
        const jeRes = await client.query(
          `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type)
           VALUES ($1,$2,$3,$4,$5,'depreciation') RETURNING id`,
          [scope.companyId, asset.branchId ?? scope.branchId, scope.activeAssignmentId,
           `DEP-${asset.code ?? asset.id}-${targetPeriod}`, `إهلاك شهري: ${asset.name} — ${targetPeriod}`]
        );
        const journalId = jeRes.rows[0].id;
        await client.query(
          `INSERT INTO journal_lines ("journalId","accountCode",debit,credit) VALUES ($1,$2,$3,0)`,
          [journalId, asset.depreciationAccountCode ?? "6100", depAmount]
        );
        await client.query(
          `INSERT INTO journal_lines ("journalId","accountCode",debit,credit) VALUES ($1,$2,0,$3)`,
          [journalId, asset.accDepreciationAccountCode ?? "1590", depAmount]
        );
        await client.query(
          `INSERT INTO depreciation_entries ("assetId","companyId",period,"depreciationAmount","bookValueAfter","journalEntryId",status,"postedAt")
           VALUES ($1,$2,$3,$4,$5,$6,'posted',NOW())`,
          [asset.id, scope.companyId, targetPeriod, depAmount, newBookValue, journalId]
        );
        await client.query(
          `UPDATE fixed_assets SET "accumulatedDepreciation"=$1, "currentBookValue"=$2, "updatedAt"=NOW() WHERE id=$3`,
          [newAccumulated, newBookValue, asset.id]
        );
      });

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

financeAlgorithmsRouter.get("/inventory-costing", async (req, res) => {
  try {
    const scope = req.scope!;
    const products = await rawQuery<any>(
      `SELECT p.id, p.sku, p.name, p."currentStock", p."costPrice", p."lastWaCost",
              p."costingMethod", p."sellPrice",
              c.name AS "categoryName",
              (p."currentStock" * p."costPrice") AS "stockValue"
       FROM warehouse_products p
       LEFT JOIN warehouse_categories c ON c.id = p."categoryId"
       WHERE p."companyId" = $1 AND p.status = 'active'
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

financeAlgorithmsRouter.get("/inventory-costing/:productId", async (req, res) => {
  try {
    const scope = req.scope!;
    const productId = Number(req.params.productId);

    const [product] = await rawQuery<any>(
      `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2`,
      [productId, scope.companyId]
    );
    if (!product) { res.status(404).json({ error: "المنتج غير موجود" }); return; }

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

financeAlgorithmsRouter.get("/rounding-account", async (req, res) => {
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

financeAlgorithmsRouter.post("/rounding-account/setup", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;

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
    const [row] = await rawQuery<any>(`SELECT * FROM chart_of_accounts WHERE id=$1`, [insertId]);
    res.status(201).json({ account: row, message: "تم إنشاء حساب فروقات التقريب (9999)" });
  } catch (err) {
    handleRouteError(err, res, "Setup rounding account error:");
  }
});

financeAlgorithmsRouter.post("/rounding-differences/apply", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireFinance(scope, res)) return;

    const { journalEntryId, roundingAmount, description } = req.body as any;
    if (!journalEntryId || Math.abs(Number(roundingAmount ?? 0)) === 0) {
      res.status(400).json({ error: "معرف القيد وفرق التقريب مطلوبان" });
      return;
    }
    const diff = Math.round(Number(roundingAmount) * 100) / 100;
    if (Math.abs(diff) > 0.05) {
      res.status(400).json({ error: "فرق التقريب يتجاوز الحد المسموح (0.05 ﷼)" });
      return;
    }

    const [roundingAcc] = await rawQuery<any>(
      `SELECT code FROM chart_of_accounts WHERE "companyId"=$1 AND code='9999' LIMIT 1`,
      [scope.companyId]
    );
    if (!roundingAcc) {
      res.status(400).json({ error: "يجب إنشاء حساب فروقات التقريب أولاً" });
      return;
    }

    const [je] = await rawQuery<any>(
      `SELECT id FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [journalEntryId, scope.companyId]
    );
    if (!je) {
      res.status(403).json({ error: "القيد اليومي غير موجود أو لا يتبع هذه الشركة" });
      return;
    }

    await rawExecute(
      `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description)
       VALUES ($1,'9999',$2,$3,$4)`,
      [journalEntryId, diff > 0 ? diff : 0, diff < 0 ? Math.abs(diff) : 0,
       description ?? "فرق تقريب تلقائي"]
    );

    res.json({ message: `تم تسجيل فرق التقريب (${diff.toFixed(2)} ﷼) في حساب 9999` });
  } catch (err) {
    handleRouteError(err, res, "Apply rounding difference error:");
  }
});

export default financeAlgorithmsRouter;
