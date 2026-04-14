import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
} from "../lib/errorHandler.js";
import { assertRole } from "../lib/roleGuards.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  createNotification,
  emitEvent,
  createAuditLog,
  createJournalEntry,
  initiateApprovalChain,
  processApprovalStep,
  haversineDistance,
  validateBudget,
  updateBudgetUsed,
  getManagerAssignmentId,
  getDirectorAssignmentId,
  checkFinancialPeriodOpen,
  getAccountCodeFromMapping,
} from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { submitWorkflow } from "../lib/workflowEngine.js";

const router = Router();
router.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// Role-based access helpers
// ─────────────────────────────────────────────────────────────────────────────
/** Finance-capable roles: finance_manager, general_manager, owner */
const FINANCE_ROLES = ["finance_manager", "general_manager", "owner"];
/** Procurement roles: procurement, finance_manager, general_manager, owner */
const PROCUREMENT_ROLES = ["procurement", "finance_manager", "general_manager", "owner"];
/** Approval roles for purchase requests: branch_manager, general_manager, owner */
const PR_APPROVAL_ROLES = ["branch_manager", "general_manager", "owner"];
/** Payroll roles: hr_manager, finance_manager, general_manager, owner */
const PAYROLL_ROLES = ["hr_manager", "finance_manager", "general_manager", "owner"];

// Role-gate helper is imported from lib/roleGuards.js as `assertRole`.
// The older local `requireRole(scope, allowedRoles, res): boolean` helper
// was removed when every callsite was migrated to `assertRole(scope, allowedRoles)`.

// ─────────────────────────────────────────────────────────────────────────────
// COLLECTION PIPELINE – 6 stages for overdue invoices
// ─────────────────────────────────────────────────────────────────────────────

const COLLECTION_STAGES = [
  { stage: 1, name: "sms_email_reminder", label: "تذكير SMS + إيميل", daysOverdue: 1 },
  { stage: 2, name: "accountant_notification", label: "إشعار محاسب + إيميل ثاني", daysOverdue: 7 },
  { stage: 3, name: "field_collection", label: "مهمة تحصيل ميداني", daysOverdue: 14 },
  { stage: 4, name: "cfo_escalation", label: "تصعيد للمدير المالي", daysOverdue: 21 },
  { stage: 5, name: "gm_penalty", label: "إشعار GM + غرامة 2%", daysOverdue: 30 },
  { stage: 6, name: "legal_churned", label: "إشعار القانونية + تصنيف churned", daysOverdue: 60 },
];

// Get collection history for a specific invoice
// ─────────────────────────────────────────────────────────────────────────────
// BUDGET – 4-level validation
// ─────────────────────────────────────────────────────────────────────────────

// Budget validation endpoint: check if expense can be approved
// ─────────────────────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// AUTO-DESCRIPTION GENERATOR – smart description based on operation type
// ─────────────────────────────────────────────────────────────────────────────
function generateAutoDescription(params: {
  operationType: string;
  relatedEntityName?: string;
  period?: string;
  branchName?: string;
  amount?: number;
  expenseType?: string;
}): string {
  const { operationType, relatedEntityName, period, branchName, amount, expenseType } = params;
  const periodLabel = period ? ` / شهر ${period}` : "";
  const branchLabel = branchName ? ` / فرع ${branchName}` : "";
  const entityLabel = relatedEntityName ? ` / ${relatedEntityName}` : "";
  const amountLabel = amount ? ` / ${amount.toLocaleString("ar-SA")} ريال` : "";

  const typeMap: Record<string, string> = {
    salary: `صرف راتب${entityLabel}${periodLabel}${branchLabel}`,
    advance: `صرف سلفة للموظف${entityLabel}${periodLabel}${branchLabel}`,
    fuel: `مصروف وقود${entityLabel}${branchLabel}${amountLabel}`,
    maintenance: `مصروف صيانة مركبة${entityLabel}${branchLabel}${amountLabel}`,
    rent: `تحصيل إيجار${entityLabel}${branchLabel}${periodLabel}`,
    vendor_invoice: `فاتورة مورد${entityLabel}${amountLabel}`,
    legal_fee: `أتعاب قانونية${entityLabel}${amountLabel}`,
    purchase: `مشتريات${entityLabel}${amountLabel}`,
    custody: `عهدة${entityLabel}${periodLabel}`,
    insurance: `تأمين${entityLabel}${amountLabel}`,
    receipt: `قبض إيراد${entityLabel}${amountLabel}`,
    payment: `صرف مبلغ${entityLabel}${amountLabel}`,
    expense: `مصروف ${expenseType || "عام"}${entityLabel}${branchLabel}${amountLabel}`,
  };

  return typeMap[operationType] || `عملية مالية${entityLabel}${branchLabel}${amountLabel}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTACHMENT REQUIREMENT CHECKER
// ─────────────────────────────────────────────────────────────────────────────
function checkAttachmentRequired(params: {
  operationType: string;
  amount?: number;
  hasAttachment?: boolean;
}): { required: boolean; reason?: string } {
  const { operationType, amount = 0, hasAttachment } = params;
  const HIGH_VALUE_THRESHOLD = 5000;
  const attachmentRequiredTypes = ["vendor_invoice", "purchase", "custody_settlement", "advance_claim", "legal_fee"];

  if (attachmentRequiredTypes.includes(operationType)) {
    return { required: true, reason: `المرفقات إلزامية لعمليات من نوع: ${operationType}` };
  }
  if (amount >= HIGH_VALUE_THRESHOLD && operationType === "payment") {
    return { required: true, reason: `المرفقات إلزامية لسندات الصرف الكبيرة (أكثر من ${HIGH_VALUE_THRESHOLD.toLocaleString()} ريال)` };
  }
  return { required: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCUREMENT P2P – 8-step pipeline
// ─────────────────────────────────────────────────────────────────────────────

// Convert approved PR to Purchase Order
router.post("/purchase-requests/:id/convert-to-po", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, PROCUREMENT_ROLES);
    const { id } = req.params;
    const { expectedDelivery, notes } = req.body as any;

    const [pr] = await rawQuery<any>(
      `SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!pr) {
      throw new NotFoundError("طلب الشراء غير موجود");
    }
    if (pr.status !== "approved") {
      throw new ValidationError("يجب الموافقة على طلب الشراء أولاً");
    }

    // Auto-generate PO ref using DB sequence (race-safe)
    const [poSeqRow] = await rawQuery<any>(`SELECT nextval('po_number_seq') AS seq`);
    const poRef = `PO-${new Date().getFullYear()}-${String(Number(poSeqRow.seq)).padStart(4, "0")}`;

    const { insertId: poId } = await rawExecute(
      `INSERT INTO purchase_orders ("companyId",ref,"supplierId","requestId",status,"totalAmount","expectedDelivery","createdBy",notes,"branchId")
       VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9)`,
      [
        scope.companyId,
        poRef,
        pr.supplierId,
        Number(id),
        Number(pr.totalAmount),
        expectedDelivery ?? null,
        scope.activeAssignmentId,
        notes ?? null,
        scope.branchId || null,
      ]
    );

    await rawExecute(
      `UPDATE purchase_requests SET status = 'converted' WHERE id = $1`,
      [Number(id)]
    );

    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId, branchId: scope.branchId,
      chainType: "purchases", refType: "purchase_order", refId: poId,
      amount: Number(pr.totalAmount),
    });

    if (approvalResult.requiresApproval) {
      await rawExecute(
        `UPDATE purchase_orders SET status = 'pending_approval' WHERE id = $1`,
        [poId]
      );
    }

    if (pr.supplierId) {
      const [supplier] = await rawQuery<any>(
        `SELECT name, email, phone FROM suppliers WHERE id = $1`,
        [pr.supplierId]
      );
      if (supplier?.email) {
        console.log(`[P2P] Supplier email → ${supplier.email} for PO ${poRef}`);
      }
      if (supplier?.phone) {
        console.log(`[P2P] Supplier SMS → ${supplier.phone} for PO ${poRef}`);
      }
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "purchase_order.created",
      entity: "purchase_orders",
      entityId: poId,
      details: JSON.stringify({ poRef, prId: id, approvalRequired: approvalResult.requiresApproval, supplierNotified: !!pr.supplierId }),
    }).catch(console.error);

    const [po] = await rawQuery<any>(
      `SELECT po.*, s.name AS "supplierName", s.email AS "supplierEmail"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId"
       WHERE po.id = $1`,
      [poId]
    );

    res.status(201).json({ ...po, approval: approvalResult, supplierNotified: !!pr.supplierId });
  } catch (err) {
    handleRouteError(err, res, "Finance error:");
  }
});

router.get("/purchase-orders/pending-grn", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT po.id, po.ref, po.status, po."totalAmount" AS total, s.name AS "supplierName",
              po."createdAt", po."expectedDelivery"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId"
       WHERE po."companyId" = $1 AND po.status IN ('approved','sent','partial_received')
         AND po."deletedAt" IS NULL
       ORDER BY po."createdAt" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "PO pending GRN error:"); }
});

router.get("/purchase-orders/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const [po] = await rawQuery<any>(
      `SELECT po.*, s.name AS "supplierName", s.phone AS "supplierPhone", s.email AS "supplierEmail",
              b.name AS "branchName", b."nameEn" AS "branchNameEn", b."logoUrl" AS "branchLogoUrl",
              b.address AS "branchAddress", b.phone AS "branchPhone", b.email AS "branchEmail",
              b.website AS "branchWebsite", b."taxNumber" AS "branchTaxNumber", b."crNumber" AS "branchCrNumber",
              b."footerText" AS "branchFooterText", b.city AS "branchCity"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId"
       LEFT JOIN branches b ON b.id = po."branchId"
       WHERE po.id = $1 AND po."companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!po) throw new NotFoundError("أمر الشراء غير موجود");

    let lines: any[] = [];
    try {
      lines = await rawQuery<any>(
        `SELECT * FROM purchase_order_lines WHERE "purchaseOrderId" = $1 ORDER BY id`,
        [Number(id)]
      );
    } catch { }

    res.json({ ...po, lines });
  } catch (err) {
    handleRouteError(err, res, "PO detail error:");
  }
});

// Vendor confirmation – vendor acknowledges the PO
router.patch("/purchase-orders/:id/vendor-confirm", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, PROCUREMENT_ROLES);
    const { id } = req.params;
    const { confirmedDelivery, notes } = req.body as any;

    const [po] = await rawQuery<any>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!po) {
      throw new NotFoundError("أمر الشراء غير موجود");
    }
    if (!["pending", "sent"].includes(po.status)) {
      throw new ValidationError("لا يمكن تأكيد أمر الشراء في هذه الحالة");
    }

    await rawExecute(
      `UPDATE purchase_orders
       SET status = 'confirmed', "expectedDelivery" = COALESCE($1, "expectedDelivery"), notes = COALESCE($2, notes)
       WHERE id = $3`,
      [confirmedDelivery ?? null, notes ?? null, Number(id)]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "purchase_order.vendor_confirmed",
      entity: "purchase_orders",
      entityId: Number(id),
      details: JSON.stringify({ confirmedDelivery }),
    }).catch(console.error);

    res.json({ message: "تم تأكيد أمر الشراء من المورد", status: "confirmed" });
  } catch (err) {
    handleRouteError(err, res, "Finance error:");
  }
});

router.post("/purchase-orders/:id/match-invoice", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const { id } = req.params;
    const { supplierInvoiceRef, invoicedAmount, invoicedDate } = req.body as any;

    if (!supplierInvoiceRef || !invoicedAmount) {
      throw new ValidationError("رقم فاتورة المورد والمبلغ مطلوبان");
    }

    const [po] = await rawQuery<any>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!po) {
      throw new NotFoundError("أمر الشراء غير موجود");
    }
    if (!["received", "partial_received"].includes(po.status)) {
      throw new ValidationError("يجب استلام البضاعة قبل مطابقة الفاتورة");
    }

    const poTotal = Number(po.totalAmount);
    const invAmount = Number(invoicedAmount);

    let prTotal = poTotal;
    if (po.requestId) {
      const [prRow] = await rawQuery<any>(
        `SELECT "totalAmount" FROM purchase_requests WHERE id = $1`,
        [po.requestId]
      );
      if (prRow) prTotal = Number(prRow.totalAmount);
    }

    let receivedTotal = poTotal;
    const grMovements = await rawQuery<any>(
      `SELECT COALESCE(SUM(quantity * "unitCost"), 0) AS total
       FROM warehouse_movements
       WHERE "companyId" = $1 AND reference = $2 AND type = 'in'`,
      [scope.companyId, `GR-${po.ref}`]
    );
    if (grMovements[0]?.total) receivedTotal = Number(grMovements[0].total);

    const poVariance = Math.abs(poTotal - invAmount);
    const poVariancePct = poTotal > 0 ? (poVariance / poTotal) * 100 : 0;
    const prVariance = Math.abs(prTotal - invAmount);
    const prVariancePct = prTotal > 0 ? (prVariance / prTotal) * 100 : 0;
    const grVariance = Math.abs(receivedTotal - invAmount);
    const grVariancePct = receivedTotal > 0 ? (grVariance / receivedTotal) * 100 : 0;

    const isMatched = poVariancePct <= 5 && prVariancePct <= 5 && grVariancePct <= 5;

    await rawExecute(
      `UPDATE purchase_orders SET status = $1, notes = CONCAT(COALESCE(notes,''), $2) WHERE id = $3`,
      [
        isMatched ? "invoice_matched" : "invoice_mismatch",
        ` | مطابقة ثلاثية: فاتورة=${invAmount} طلب=${prTotal} أمر=${poTotal} استلام=${receivedTotal}`,
        Number(id),
      ]
    );

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: isMatched ? "purchase_order.three_way_matched" : "purchase_order.three_way_mismatch",
      entity: "purchase_orders",
      entityId: Number(id),
      details: JSON.stringify({ supplierInvoiceRef, invoicedAmount: invAmount, poTotal, prTotal, receivedTotal }),
    }).catch(console.error);

    if (!isMatched) {
      createNotification({
        companyId: scope.companyId,
        assignmentId: scope.activeAssignmentId,
        type: "three_way_mismatch",
        title: `عدم تطابق ثلاثي – ${po.ref}`,
        body: `فاتورة=${invAmount} | طلب=${prTotal} | أمر=${poTotal} | استلام=${receivedTotal}`,
        priority: "high",
        refType: "purchase_orders",
        refId: Number(id),
      }).catch(console.error);
    }

    res.json({
      message: isMatched ? "تمت المطابقة الثلاثية بنجاح" : "عدم تطابق في المطابقة الثلاثية",
      isMatched,
      threeWayMatch: {
        purchaseRequest: prTotal,
        purchaseOrder: poTotal,
        goodsReceipt: receivedTotal,
        supplierInvoice: invAmount,
      },
      variances: {
        poVsInvoice: { amount: poVariance, pct: Math.round(poVariancePct) },
        prVsInvoice: { amount: prVariance, pct: Math.round(prVariancePct) },
        grVsInvoice: { amount: grVariance, pct: Math.round(grVariancePct) },
      },
      status: isMatched ? "invoice_matched" : "invoice_mismatch",
    });
  } catch (err) {
    handleRouteError(err, res, "Finance error:");
  }
});

// Payment scheduling – schedule payment to supplier after invoice match
router.post("/purchase-orders/:id/schedule-payment", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, FINANCE_ROLES);
    const { id } = req.params;
    const { paymentDate, amount, method = "bank_transfer", notes } = req.body as any;

    if (!paymentDate || !amount) {
      throw new ValidationError("تاريخ الدفع والمبلغ مطلوبان");
    }

    const [po] = await rawQuery<any>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`,
      [Number(id), scope.companyId]
    );
    if (!po) {
      throw new NotFoundError("أمر الشراء غير موجود");
    }

    await rawExecute(
      `UPDATE purchase_orders
       SET status = 'payment_scheduled',
           notes = CONCAT(COALESCE(notes,''), $1)
       WHERE id = $2`,
      [` | دفعة مجدولة ${paymentDate}: ${amount} (${method})`, Number(id)]
    );

    // Create a scheduled journal entry for the payment
    createJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: `SCHED-PAY-${po.ref}`,
      description: `دفعة مجدولة لأمر الشراء ${po.ref} بتاريخ ${paymentDate}`,
      lines: [
        { accountCode: "2100", debit: Number(amount), credit: 0 },
        { accountCode: "1100", debit: 0, credit: Number(amount) },
      ],
    }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "purchase_order.payment_scheduled",
      entity: "purchase_orders",
      entityId: Number(id),
      details: JSON.stringify({ paymentDate, amount, method }),
    }).catch(console.error);

    res.json({
      message: "تم جدولة الدفعة بنجاح",
      paymentDate,
      amount,
      method,
      status: "payment_scheduled",
    });
  } catch (err) {
    handleRouteError(err, res, "Finance error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CHART OF ACCOUNTS & JOURNAL
// ─────────────────────────────────────────────────────────────────────────────

router.get("/vendors/:id", async (req, res) => {
  try {
    const scope = (req as any).scope!;
    const id = Number(req.params.id);
    if (!id || isNaN(id)) { throw new ValidationError("معرف غير صالح"); return; }
    const [vendor] = await rawQuery<any>(
      `SELECT s.*,
              COALESCE((SELECT SUM(total) FROM purchase_orders po WHERE po."supplierId" = s.id), 0)::numeric AS "totalPurchases",
              COALESCE((SELECT COUNT(*) FROM purchase_orders po WHERE po."supplierId" = s.id AND po.status IN ('pending','approved','sent')), 0)::int AS "activeOrders",
              (SELECT MAX(po."createdAt") FROM purchase_orders po WHERE po."supplierId" = s.id) AS "lastOrderAt"
       FROM suppliers s
       WHERE s.id = $1 AND s."companyId" = ANY($2) AND s."deletedAt" IS NULL`,
      [id, scope.allowedCompanies]
    );
    if (!vendor) throw new NotFoundError("المورد غير موجود");
    res.json(vendor);
  } catch (err) {
    handleRouteError(err, res, "Get vendor error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// TAX SYSTEM (VAT)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// RECEIVABLES
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENTS (outgoing)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL COMMITMENTS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL REQUESTS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// CUSTODIES (العهد)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// FISCAL PERIODS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SALARY ADVANCES
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// UPGRADED VENDORS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// EXPENSE PATCH / DELETE
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// VOUCHER PATCH / DELETE
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// VENDOR PATCH / DELETE
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// FINANCE SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// GENERAL LEDGER
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SUBSIDIARY LEDGER — دفتر الأستاذ المساعد
// GET /finance/subsidiary-ledger/:entityType/:entityId
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// ADVANCED FINANCIAL REPORTS
// ─────────────────────────────────────────────────────────────────────────────

// Entity Statement (Employee / Client / Supplier)
router.get("/reports/entity-statement", async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId, startDate, endDate } = req.query as any;

    let rows: any[] = [];
    let entityName = "";

    if (entityType === "employee" && entityId) {
      const [emp] = await rawQuery<any>(
        `SELECT e.name, ea.id AS aid FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1
         WHERE e.id = $2 LIMIT 1`,
        [scope.companyId, Number(entityId)]
      );
      entityName = emp?.name || "";
      const aid = emp?.aid;
      if (aid) {
        const qParams: any[] = [aid, scope.companyId];
        let dateFilter = "";
        if (startDate) { qParams.push(startDate); dateFilter += ` AND pr."createdAt" >= $${qParams.length}`; }
        if (endDate) { qParams.push(endDate); dateFilter += ` AND pr."createdAt" <= $${qParams.length}`; }
        rows = await rawQuery<any>(
          `SELECT pr.period AS ref, CONCAT('راتب ', pr.period) AS description,
                  pr."grossSalary" AS debit, pr."totalDeductions" AS credit,
                  pr."netSalary" AS net, pr."createdAt" AS date, 'payroll' AS type
           FROM payroll_records pr
           WHERE pr."employeeAssignmentId" = $1 AND pr."companyId" = $2 ${dateFilter}
           ORDER BY pr."createdAt" DESC LIMIT 100`,
          qParams
        );
      }
    } else if (entityType === "client" && entityId) {
      const [cl] = await rawQuery<any>(`SELECT name FROM clients WHERE id = $1 AND "companyId" = $2`, [Number(entityId), scope.companyId]);
      entityName = cl?.name || "";
      const qParams: any[] = [Number(entityId), scope.companyId];
      let dateFilter = "";
      if (startDate) { qParams.push(startDate); dateFilter += ` AND i."createdAt" >= $${qParams.length}`; }
      if (endDate) { qParams.push(endDate); dateFilter += ` AND i."createdAt" <= $${qParams.length}`; }
      rows = await rawQuery<any>(
        `SELECT i.ref, COALESCE(i.description, i.ref) AS description,
                i.total AS debit, i."paidAmount" AS credit,
                (i.total - i."paidAmount") AS net,
                i."createdAt" AS date, i.status AS type
         FROM invoices i WHERE i."clientId" = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL ${dateFilter}
         ORDER BY i."createdAt" DESC LIMIT 100`,
        qParams
      );
    } else if (entityType === "supplier" && entityId) {
      const [sup] = await rawQuery<any>(`SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2`, [Number(entityId), scope.companyId]);
      entityName = sup?.name || "";
      const qParams: any[] = [Number(entityId), scope.companyId];
      let dateFilter = "";
      if (startDate) { qParams.push(startDate); dateFilter += ` AND po."createdAt" >= $${qParams.length}`; }
      if (endDate) { qParams.push(endDate); dateFilter += ` AND po."createdAt" <= $${qParams.length}`; }
      rows = await rawQuery<any>(
        `SELECT po.ref, CONCAT('أمر شراء: ', po.ref) AS description,
                po."totalAmount" AS debit, 0 AS credit,
                po."totalAmount" AS net,
                po."createdAt" AS date, po.status AS type
         FROM purchase_orders po WHERE po."supplierId" = $1 AND po."companyId" = $2 ${dateFilter}
         ORDER BY po."createdAt" DESC LIMIT 100`,
        qParams
      );
    }

    const totalDebit = rows.reduce((s: number, r: any) => s + Number(r.debit || 0), 0);
    const totalCredit = rows.reduce((s: number, r: any) => s + Number(r.credit || 0), 0);

    res.json({ entityName, entityType, rows, summary: { totalDebit, totalCredit, balance: totalDebit - totalCredit, count: rows.length } });
  } catch (err) {
    handleRouteError(err, res, "Entity statement error:");
  }
});

// Custody & Advances Report
router.get("/reports/custody-advances", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }

    const custodies = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date, je.status,
              e.name AS "employeeName", 'custody' AS type
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1400'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%' ${dateFilter}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, e.name
       ORDER BY je."createdAt" DESC`,
      params
    );

    const advances = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description,
              COALESCE(SUM(jl.debit), 0) AS amount,
              je."createdAt" AS date, je.status,
              e.name AS "employeeName", 'advance' AS type
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" = '1410'
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'ADV%' ${dateFilter}
       GROUP BY je.id, je.ref, je.description, je."createdAt", je.status, e.name
       ORDER BY je."createdAt" DESC`,
      params
    );

    const totalCustodies = custodies.reduce((s: number, r: any) => s + Number(r.amount), 0);
    const totalAdvances = advances.reduce((s: number, r: any) => s + Number(r.amount), 0);

    res.json({
      custodies, advances,
      summary: {
        totalCustodies, custodyCount: custodies.length,
        totalAdvances, advanceCount: advances.length,
        total: totalCustodies + totalAdvances,
      }
    });
  } catch (err) {
    handleRouteError(err, res, "Custody advances report error:");
  }
});

// Expenses by account / branch / employee
router.get("/reports/expenses-analysis", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId, departmentId, projectId, costCenterId, groupBy = "account" } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }
    if (projectId) { params.push(projectId); dateFilter += ` AND je."projectId" = $${params.length}`; }

    let selectCol = "coa.code AS key, coa.name AS label";
    let groupCol = "coa.code, coa.name";
    if (groupBy === "branch") {
      selectCol = "b.id AS key, COALESCE(b.name, 'غير محدد') AS label";
      groupCol = "b.id, b.name";
    } else if (groupBy === "employee") {
      selectCol = "e.id AS key, COALESCE(e.name, 'غير محدد') AS label";
      groupCol = "e.id, e.name";
    }

    const rows = await rawQuery<any>(
      `SELECT ${selectCol},
              COALESCE(SUM(jl.debit) - SUM(jl.credit), 0) AS amount,
              COUNT(DISTINCT je.id) AS "entryCount"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'expense'
       LEFT JOIN branches b ON b.id = je."branchId"
       LEFT JOIN employee_assignments ea ON ea.id = je."createdBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE jl.debit > jl.credit
       GROUP BY ${groupCol}
       ORDER BY amount DESC`,
      params
    );

    const total = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ data: rows, summary: { total, count: rows.length, groupBy } });
  } catch (err) {
    handleRouteError(err, res, "Expenses analysis error:");
  }
});

// Revenue by activity
router.get("/reports/revenue-analysis", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, branchId } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }

    const byAccount = await rawQuery<any>(
      `SELECT coa.code, coa.name,
              COALESCE(SUM(jl.credit) - SUM(jl.debit), 0) AS amount,
              COUNT(DISTINCT je.id) AS "entryCount"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       JOIN chart_of_accounts coa ON coa.code = jl."accountCode" AND coa.type = 'revenue'
       GROUP BY coa.code, coa.name
       ORDER BY amount DESC`,
      params
    );

    const byMonth = await rawQuery<any>(
      `SELECT to_char(i."createdAt", 'YYYY-MM') AS period,
              COALESCE(SUM(i."paidAmount"), 0) AS collected,
              COALESCE(SUM(i.total), 0) AS invoiced,
              COUNT(*) AS "invoiceCount"
       FROM invoices i
       WHERE i."companyId" = $1 AND i."deletedAt" IS NULL ${dateFilter.replace(/je\./g, 'i.')}
       GROUP BY to_char(i."createdAt", 'YYYY-MM')
       ORDER BY period ASC`,
      params
    );

    const totalRevenue = byAccount.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ byAccount, byMonth, summary: { totalRevenue, accountCount: byAccount.length } });
  } catch (err) {
    handleRouteError(err, res, "Revenue analysis error:");
  }
});

// Budget vs Actual Variance Report
router.get("/reports/budget-variance", async (req, res) => {
  try {
    const scope = req.scope!;
    const { period, branchId } = req.query as any;

    const targetPeriod = period || new Date().toISOString().slice(0, 7);
    const params: any[] = [scope.companyId, targetPeriod];
    const branchFilter = branchId ? ` AND b."branchId" = $${params.length + 1}` : "";
    if (branchId) params.push(branchId);

    const rows = await rawQuery<any>(
      `SELECT b."accountCode", b.amount AS budget,
              coa.name AS "accountName", coa.type,
              COALESCE(b.used, 0) AS actual,
              b.amount - COALESCE(b.used, 0) AS variance,
              CASE WHEN b.amount > 0 THEN ROUND(COALESCE(b.used, 0)::numeric / b.amount * 100, 1) ELSE 0 END AS "usagePct"
       FROM budgets b
       LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = $1
       WHERE b."companyId" = $1 AND b.period = $2 ${branchFilter}
       ORDER BY b."accountCode"`,
      params
    );

    const totalBudget = rows.reduce((s: number, r: any) => s + Number(r.budget || 0), 0);
    const totalActual = rows.reduce((s: number, r: any) => s + Number(r.actual || 0), 0);
    const totalVariance = totalBudget - totalActual;

    res.json({ data: rows, summary: { totalBudget, totalActual, totalVariance, period: targetPeriod } });
  } catch (err) {
    handleRouteError(err, res, "Budget variance error:");
  }
});

// Cash/Bank Movement Statement
router.get("/reports/cash-bank-statement", async (req, res) => {
  try {
    const scope = req.scope!;
    const { startDate, endDate, accountCode = "1100", branchId } = req.query as any;

    let dateFilter = "";
    const params: any[] = [scope.companyId, accountCode];
    if (startDate) { params.push(startDate); dateFilter += ` AND je."createdAt" >= $${params.length}`; }
    if (endDate) { params.push(endDate); dateFilter += ` AND je."createdAt" <= $${params.length}`; }
    if (branchId) { params.push(branchId); dateFilter += ` AND je."branchId" = $${params.length}`; }

    const [accountInfo] = await rawQuery<any>(
      `SELECT code, name, type FROM chart_of_accounts WHERE "companyId" = $1 AND code = $2`,
      [scope.companyId, accountCode]
    );

    const entries = await rawQuery<any>(
      `SELECT jl.id, je.ref, je.description,
              jl.debit, jl.credit, je."createdAt" AS date,
              b.name AS "branchName"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL ${dateFilter}
       LEFT JOIN branches b ON b.id = je."branchId"
       WHERE jl."accountCode" = $2
       ORDER BY je."createdAt" ASC`,
      params
    );

    let runningBalance = 0;
    const enriched = entries.map((e: any) => {
      runningBalance += Number(e.debit) - Number(e.credit);
      return { ...e, runningBalance };
    });

    const totalDebit = entries.reduce((s: number, e: any) => s + Number(e.debit), 0);
    const totalCredit = entries.reduce((s: number, e: any) => s + Number(e.credit), 0);

    res.json({
      account: accountInfo,
      entries: enriched,
      summary: { totalDebit, totalCredit, closingBalance: runningBalance, count: entries.length }
    });
  } catch (err) {
    handleRouteError(err, res, "Cash bank statement error:");
  }
});

export default router;
