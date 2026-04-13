import { handleRouteError, validationError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { haversineKm } from "../lib/algorithms.js";
import { createNotification, createAuditLog, createJournalEntry } from "../lib/businessHelpers.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";

const router = Router();
router.use(authMiddleware);

const VALID_CASE_TRANSITIONS: Record<string, string[]> = {
  open: ['in_progress'],
  in_progress: ['judgment', 'closed'],
  judgment: ['execution', 'closed'],
  execution: ['closed'],
  closed: [],
};

router.get("/contracts", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    conditions.push(`"deletedAt" IS NULL`);
    const rows = await rawQuery<any>(`SELECT *, ("endDate"::date - CURRENT_DATE) AS "daysToExpiry" FROM legal_contracts WHERE ${conditions.join(" AND ")} ORDER BY id DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Legal contracts error:"); }
});

router.post("/contracts", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;

    if (!b.startDate) {
      validationError(res, "لا يمكن إنشاء عقد بدون تاريخ بداية", "startDate", "حدد تاريخ بداية العقد");
      return;
    }
    if (!b.endDate) {
      validationError(res, "لا يمكن إنشاء عقد بدون تاريخ نهاية", "endDate", "حدد تاريخ نهاية العقد");
      return;
    }
    if (new Date(b.endDate) <= new Date(b.startDate)) {
      validationError(res, "تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية", "endDate", "تأكد من أن تاريخ النهاية أحدث من تاريخ البداية");
      return;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO legal_contracts ("companyId",ref,title,"contractType","partyName","partyContact","startDate","endDate",value,status,notes,"createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [scope.companyId, b.ref, b.title, b.contractType, b.partyName, b.partyContact, b.startDate, b.endDate, b.value, b.status || 'draft', b.notes, scope.userId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM legal_contracts WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create legal contract error:"); }
});

router.get("/contracts/renewal-alerts", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const alerts90 = await rawQuery<any>(
      `SELECT id, title, "partyName", "endDate", ("endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM legal_contracts WHERE "companyId"=$1 AND status='active'
       AND "endDate" BETWEEN CURRENT_DATE + INTERVAL '31 days' AND CURRENT_DATE + INTERVAL '90 days'`,
      [cid]
    );
    const alerts30 = await rawQuery<any>(
      `SELECT id, title, "partyName", "endDate", ("endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM legal_contracts WHERE "companyId"=$1 AND status='active'
       AND "endDate" BETWEEN CURRENT_DATE + INTERVAL '15 days' AND CURRENT_DATE + INTERVAL '30 days'`,
      [cid]
    );
    const alerts14 = await rawQuery<any>(
      `SELECT id, title, "partyName", "endDate", ("endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM legal_contracts WHERE "companyId"=$1 AND status='active'
       AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'`,
      [cid]
    );

    const all = [...alerts90, ...alerts30, ...alerts14].map((r: any) => {
      const daysLeft = Number(r.daysLeft);
      let severity = 'low';
      if (daysLeft <= 14) severity = 'critical';
      else if (daysLeft <= 30) severity = 'high';
      else severity = 'medium';
      return {
        ...r, daysLeft, severity,
        message: `عقد "${r.title}" مع ${r.partyName} ينتهي خلال ${daysLeft} يوم`,
      };
    });

    res.json({ data: all, total: all.length, page: 1, pageSize: all.length });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/contracts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT *, ("endDate"::date - CURRENT_DATE) AS "daysToExpiry" FROM legal_contracts WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "العقد غير موجود" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get contract error:"); }
});

router.patch("/contracts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id, "startDate", "endDate" FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "العقد غير موجود" }); return; }
    const b = req.body;
    const effectiveStart = b.startDate || existing.startDate;
    const effectiveEnd = b.endDate || existing.endDate;
    if (effectiveStart && effectiveEnd && new Date(effectiveEnd) <= new Date(effectiveStart)) {
      validationError(res, "تاريخ نهاية العقد يجب أن يكون بعد تاريخ البداية", "endDate", "تأكد من أن تاريخ النهاية أحدث من تاريخ البداية");
      return;
    }
    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.partyName !== undefined) { params.push(b.partyName); sets.push(`"partyName"=$${params.length}`); }
    if (b.partyContact !== undefined) { params.push(b.partyContact); sets.push(`"partyContact"=$${params.length}`); }
    if (b.contractType !== undefined) { params.push(b.contractType); sets.push(`"contractType"=$${params.length}`); }
    if (b.value !== undefined) { params.push(b.value); sets.push(`value=$${params.length}`); }
    if (b.startDate !== undefined) { params.push(b.startDate); sets.push(`"startDate"=$${params.length}`); }
    if (b.endDate !== undefined) { params.push(b.endDate); sets.push(`"endDate"=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id);
    await rawExecute(`UPDATE legal_contracts SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM legal_contracts WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update contract error:"); }
});

router.delete("/contracts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "العقد غير موجود" }); return; }
    await rawExecute(`UPDATE legal_contracts SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف العقد بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete contract error:"); }
});

// ---------------------------------------------------------------------------
// Lifecycle endpoints: renew and terminate
// ---------------------------------------------------------------------------

router.post("/contracts/:id/renew", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { newEndDate, newValue, notes } = req.body ?? {};
    if (!newEndDate) {
      validationError(res, "تاريخ نهاية التجديد مطلوب", "newEndDate", "حدد تاريخ النهاية الجديد");
      return;
    }
    const [current] = await rawQuery<any>(
      `SELECT id, "endDate", value, "renewalCount" FROM legal_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!current) { res.status(404).json({ error: "العقد غير موجود" }); return; }
    if (new Date(newEndDate) <= new Date(current.endDate)) {
      validationError(res, "تاريخ نهاية التجديد يجب أن يكون بعد تاريخ النهاية الحالي", "newEndDate", "اختر تاريخاً لاحقاً لتاريخ النهاية الحالي");
      return;
    }

    const setExtras: Record<string, any> = {
      endDate: newEndDate,
      renewedAt: { raw: "NOW()" },
      renewalCount: { raw: `COALESCE("renewalCount", 0) + 1` },
    };
    if (newValue !== undefined && newValue !== null) {
      setExtras.value = newValue;
    }
    if (notes) {
      setExtras.notes = notes;
    }

    const updated = await applyTransition({
      entity: "legal_contracts",
      id,
      scope,
      action: "legal.contract.renewed",
      fromStates: ["active", "draft", "expired"],
      toState: "active",
      reason: notes ?? null,
      setExtras,
      extraWhere: `"deletedAt" IS NULL`,
      after: {
        endDate: newEndDate,
        value: newValue ?? current.value,
        renewalCount: (current.renewalCount ?? 0) + 1,
      },
    });
    res.json({ ...updated, event: "legal.contract.renewed" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Renew contract error:");
  }
});

router.post("/contracts/:id/terminate", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { reason, effectiveDate } = req.body ?? {};
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      validationError(res, "سبب إنهاء العقد مطلوب", "reason", "اكتب سبب الإنهاء");
      return;
    }

    const updated = await applyTransition({
      entity: "legal_contracts",
      id,
      scope,
      action: "legal.contract.terminated",
      fromStates: ["active", "draft"],
      toState: "terminated",
      reason,
      setExtras: {
        terminationDate: effectiveDate ?? { raw: "NOW()" },
        terminationReason: reason,
        endDate: effectiveDate ?? { raw: "CURRENT_DATE" },
      },
      extraWhere: `"deletedAt" IS NULL`,
      after: {
        terminationReason: reason,
        terminationDate: effectiveDate ?? new Date().toISOString(),
      },
    });
    res.json({ ...updated, event: "legal.contract.terminated" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Terminate contract error:");
  }
});

router.get("/cases", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
    conditions.push(`"deletedAt" IS NULL`);
    const rows = await rawQuery<any>(`SELECT * FROM legal_cases WHERE ${conditions.join(" AND ")} ORDER BY id DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Legal cases error:"); }
});

router.post("/cases", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const { insertId } = await rawExecute(
      `INSERT INTO legal_cases ("companyId","caseNumber",title,"caseType",court,"filingDate","opposingParty","lawyerName",status,priority,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [scope.companyId, b.caseNumber, b.title, b.caseType, b.court, b.filingDate, b.opposingParty, b.lawyerName, b.status || 'open', b.priority || 'medium', b.description]
    );

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "legal_cases", entityId: insertId,
      after: { title: b.title, caseType: b.caseType, status: 'open', priority: b.priority || 'medium' },
    }).catch(console.error);

    const [row] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create legal case error:"); }
});

router.get("/cases/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "القضية غير موجودة" }); return; }

    const sessions = await rawQuery<any>(`SELECT * FROM legal_sessions WHERE "caseId"=$1 ORDER BY "sessionDate" DESC`, [row.id]);

    res.json({ ...row, sessions, allowedTransitions: VALID_CASE_TRANSITIONS[row.status] || [] });
  } catch (err) { handleRouteError(err, res, "Get case error:"); }
});

router.patch("/cases/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "القضية غير موجودة" }); return; }
    const b = req.body;

    if (b.status !== undefined && b.status !== existing.status) {
      const allowed = VALID_CASE_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(b.status)) {
        res.status(400).json({
          error: `لا يمكن الانتقال من "${existing.status}" إلى "${b.status}"`,
          allowedTransitions: allowed,
        });
        return;
      }
    }

    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.priority !== undefined) { params.push(b.priority); sets.push(`priority=$${params.length}`); }
    if (b.lawyerName !== undefined) { params.push(b.lawyerName); sets.push(`"lawyerName"=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.court !== undefined) { params.push(b.court); sets.push(`court=$${params.length}`); }
    if (sets.length <= 1 && params.length === 0) { res.json(existing); return; }
    params.push(id);
    await rawExecute(`UPDATE legal_cases SET ${sets.join(",")} WHERE id=$${params.length}`, params);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "legal_cases", entityId: id,
      before: { status: existing.status }, after: { status: b.status || existing.status },
    }).catch(console.error);

    const [row] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1`, [id]);
    res.json({ ...row, allowedTransitions: VALID_CASE_TRANSITIONS[row.status] || [] });
  } catch (err) { handleRouteError(err, res, "Update case error:"); }
});

router.delete("/cases/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "القضية غير موجودة" }); return; }
    await rawExecute(`UPDATE legal_cases SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف القضية بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete case error:"); }
});

router.get("/cases/:caseId/sessions", async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = Number(req.params.caseId);
    const [legalCase] = await rawQuery<any>(`SELECT id FROM legal_cases WHERE id=$1 AND "companyId"=$2`, [caseId, scope.companyId]);
    if (!legalCase) { res.status(404).json({ error: "القضية غير موجودة" }); return; }
    const rows = await rawQuery<any>(`SELECT * FROM legal_sessions WHERE "caseId"=$1 ORDER BY "sessionDate" DESC`, [caseId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Legal sessions error:"); }
});

router.post("/cases/:caseId/sessions", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const caseId = Number(req.params.caseId);

    const [legalCase] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [caseId, scope.companyId]);
    if (!legalCase) { res.status(404).json({ error: "القضية غير موجودة أو غير مصرح بها" }); return; }

    let distanceToCourtKm: number | null = null;
    if (b.courtLat && b.courtLon && b.officeLat && b.officeLon) {
      distanceToCourtKm = haversineKm(
        Number(b.officeLat), Number(b.officeLon),
        Number(b.courtLat), Number(b.courtLon)
      );
    }

    const { insertId } = await rawExecute(
      `INSERT INTO legal_sessions ("caseId","sessionDate",location,judge,result,"nextSessionDate",notes) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [caseId, b.sessionDate, b.location, b.judge, b.result, b.nextSessionDate, b.notes]
    );

    if (legalCase.lawyerName) {
      try {
        const [lawyerEmp] = await rawQuery<any>(
          `SELECT ea.id AS "assignmentId" FROM employees e
           JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea.status='active'
           WHERE ea."companyId"=$1 AND e.name ILIKE $2 LIMIT 1`,
          [scope.companyId, `%${legalCase.lawyerName}%`]
        );
        if (lawyerEmp?.assignmentId) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: lawyerEmp.assignmentId,
            type: "legal_session",
            title: `جلسة قضائية: ${legalCase.title}`,
            body: `جلسة بتاريخ ${b.sessionDate} — ${b.location || legalCase.court || ''} ${distanceToCourtKm ? `(${distanceToCourtKm.toFixed(1)} كم)` : ''}`,
            priority: legalCase.priority === 'high' ? 'high' : 'normal',
            refType: "legal_sessions",
            refId: insertId,
          }).catch(console.error);
        }
      } catch (notifErr) { console.error("Lawyer notification error:", notifErr); }
    }

    if (legalCase.status === 'open') {
      await rawExecute(`UPDATE legal_cases SET status='in_progress', "updatedAt"=NOW() WHERE id=$1`, [caseId]);
    }

    let invoiceId: number | null = null;
    let invoiceError: string | null = null;
    let journalEntryId: number | null = null;
    if (b.hoursSpent && b.hourlyRate) {
      const billingAmount = Number(b.hoursSpent) * Number(b.hourlyRate);
      const vatAmount = billingAmount * 0.15;
      const monthNum = String(new Date().getMonth() + 1).padStart(2, "0");
      const yearShort = String(new Date().getFullYear()).slice(2);
      const ref = `INV-LEGAL-${yearShort}${monthNum}-${insertId}`;
      try {
        const { insertId: iId } = await rawExecute(
          `INSERT INTO invoices ("companyId","clientId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate","createdBy") VALUES ($1,NULL,$2,$3,$4,$5,$6,15,0,'draft',$7,$8)`,
          [scope.companyId, ref, `أتعاب قانونية - جلسة ${b.sessionDate} - ${legalCase.title}`, billingAmount, billingAmount + vatAmount, vatAmount, new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0], scope.userId]
        );
        invoiceId = iId;
      } catch (invoiceErr) {
        console.error("Failed to create legal session invoice:", invoiceErr);
        invoiceError = "فشل إنشاء فاتورة الأتعاب";
      }

      // Auto journal entry for legal fees
      try {
        const totalWithVat = billingAmount + vatAmount;
        journalEntryId = await createJournalEntry({
          companyId: scope.companyId,
          branchId: scope.branchId,
          createdBy: scope.activeAssignmentId ?? scope.userId,
          ref: `LEGAL-FEE-${insertId}`,
          description: `أتعاب قانونية / ${legalCase.title} / جلسة ${b.sessionDate} / ${billingAmount.toLocaleString()} ريال`,
          lines: [
            { accountCode: "5400", debit: billingAmount, credit: 0 },
            { accountCode: "1400", debit: vatAmount, credit: 0 },
            { accountCode: "2100", debit: 0, credit: totalWithVat },
          ],
        });
      } catch (jErr) { console.error("Legal fee journal entry failed:", jErr); }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM legal_sessions WHERE id=$1`, [insertId]);
    res.status(201).json({ ...row, distanceToCourtKm, invoiceId, invoiceError, journalEntryId, calendarTaskCreated: !!legalCase.lawyerName });
  } catch (err) { handleRouteError(err, res, "Create session error:"); }
});

router.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [contracts] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='active') as active FROM legal_contracts WHERE "companyId"=$1`, [cid]);
    const [cases] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='open') as open, COUNT(*) FILTER (WHERE status='in_progress') as "inProgress" FROM legal_cases WHERE "companyId"=$1`, [cid]);
    const [expiring] = await rawQuery<any>(`SELECT COUNT(*) as count FROM legal_contracts WHERE "companyId"=$1 AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' AND status='active'`, [cid]);
    const [sessions] = await rawQuery<any>(`SELECT COUNT(*) as upcoming FROM legal_sessions ls JOIN legal_cases lc ON lc.id=ls."caseId" WHERE lc."companyId"=$1 AND ls."sessionDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`, [cid]);
    const [contingent] = await rawQuery<any>(`SELECT COALESCE(SUM("financialRisk"),0) as total FROM legal_cases WHERE "companyId"=$1 AND status NOT IN ('closed')`, [cid]).catch(() => [{ total: 0 }]);
    res.json({
      totalContracts: Number(contracts.total), activeContracts: Number(contracts.active),
      totalCases: Number(cases.total), openCases: Number(cases.open), inProgressCases: Number(cases.inProgress),
      expiringContracts: Number(expiring.count), upcomingSessions: Number(sessions.upcoming),
      contingentLiabilities: Number(contingent?.total || 0),
    });
  } catch (err) { handleRouteError(err, res, "Legal stats error:"); }
});

router.get("/cases/:caseId/correspondence", async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = Number(req.params.caseId);
    const [lc] = await rawQuery<any>(`SELECT id FROM legal_cases WHERE id=$1 AND "companyId"=$2`, [caseId, scope.companyId]);
    if (!lc) { res.status(404).json({ error: "القضية غير موجودة" }); return; }
    const rows = await rawQuery<any>(`SELECT * FROM legal_correspondence WHERE "caseId"=$1 ORDER BY "correspondenceDate" DESC`, [caseId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Legal correspondence error:"); }
});

router.post("/cases/:caseId/correspondence", async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = Number(req.params.caseId);
    const b = req.body;
    const [lc] = await rawQuery<any>(`SELECT id FROM legal_cases WHERE id=$1 AND "companyId"=$2`, [caseId, scope.companyId]);
    if (!lc) { res.status(404).json({ error: "القضية غير موجودة" }); return; }
    const { insertId } = await rawExecute(
      `INSERT INTO legal_correspondence ("caseId","companyId",direction,subject,parties,"correspondenceDate","documentRef",notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [caseId, scope.companyId, b.direction || 'outgoing', b.subject, b.parties, b.correspondenceDate || new Date().toISOString().split('T')[0], b.documentRef || null, b.notes || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM legal_correspondence WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create correspondence error:"); }
});

router.get("/cases/:caseId/judgments", async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = Number(req.params.caseId);
    const [lc] = await rawQuery<any>(`SELECT id FROM legal_cases WHERE id=$1 AND "companyId"=$2`, [caseId, scope.companyId]);
    if (!lc) { res.status(404).json({ error: "القضية غير موجودة" }); return; }
    const rows = await rawQuery<any>(`SELECT * FROM legal_judgments WHERE "caseId"=$1 ORDER BY "judgmentDate" DESC`, [caseId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Legal judgments error:"); }
});

router.post("/cases/:caseId/judgments", async (req, res) => {
  try {
    const scope = req.scope!;
    const caseId = Number(req.params.caseId);
    const b = req.body;
    const [lc] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1 AND "companyId"=$2`, [caseId, scope.companyId]);
    if (!lc) { res.status(404).json({ error: "القضية غير موجودة" }); return; }
    const { insertId } = await rawExecute(
      `INSERT INTO legal_judgments ("caseId","companyId","judgmentDate","judgmentType",verdict,amount,"paidAmount","dueDate",notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [caseId, scope.companyId, b.judgmentDate, b.judgmentType || 'judgment', b.verdict, b.amount || 0, b.paidAmount || 0, b.dueDate || null, b.notes || null]
    );
    if (b.amount && Number(b.amount) > 0) {
      await rawExecute(`UPDATE legal_cases SET "financialRisk"=COALESCE("financialRisk",0)+$1, "updatedAt"=NOW() WHERE id=$2`, [Number(b.amount), caseId]).catch(console.error);
    }
    const [row] = await rawQuery<any>(`SELECT * FROM legal_judgments WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create judgment error:"); }
});

router.patch("/cases/:caseId/judgments/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const caseId = Number(req.params.caseId);
    const b = req.body;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.paidAmount !== undefined) { params.push(b.paidAmount); sets.push(`"paidAmount"=$${params.length}`); }
    if (b.verdict !== undefined) { params.push(b.verdict); sets.push(`verdict=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.dueDate !== undefined) { params.push(b.dueDate); sets.push(`"dueDate"=$${params.length}`); }
    params.push(id); params.push(caseId);
    await rawExecute(`UPDATE legal_judgments SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "caseId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM legal_judgments WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update judgment error:"); }
});

router.patch("/cases/:id/financial-risk", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { financialRisk, riskLevel } = req.body;
    const [existing] = await rawQuery<any>(`SELECT id FROM legal_cases WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "القضية غير موجودة" }); return; }
    await rawExecute(
      `UPDATE legal_cases SET "financialRisk"=$1, "riskLevel"=$2, "updatedAt"=NOW() WHERE id=$3`,
      [financialRisk || 0, riskLevel || 'medium', id]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM legal_cases WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Financial risk update error:"); }
});

router.get("/sessions/upcoming", async (req, res) => {
  try {
    const scope = req.scope!;
    const days = Number(req.query.days) || 14;
    const rows = await rawQuery<any>(
      `SELECT ls.*, lc.title AS "caseTitle", lc."lawyerName", lc.priority,
              (ls."sessionDate"::date - CURRENT_DATE) AS "daysUntil"
       FROM legal_sessions ls
       JOIN legal_cases lc ON lc.id=ls."caseId"
       WHERE lc."companyId"=$1 AND ls."sessionDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2 || ' days')::INTERVAL
       ORDER BY ls."sessionDate" ASC`,
      [scope.companyId, days]
    );
    const alerts = rows.map((r: any) => ({
      ...r,
      alertLevel: Number(r.daysUntil) <= 1 ? 'critical' : Number(r.daysUntil) <= 7 ? 'high' : 'medium',
    }));
    res.json({ data: alerts, total: alerts.length });
  } catch (err) { handleRouteError(err, res, "Upcoming sessions error:"); }
});

router.get("/judgments/financial-report", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT lj.*, lc.title AS "caseTitle", lc."caseNumber", lc."riskLevel"
       FROM legal_judgments lj
       JOIN legal_cases lc ON lc.id=lj."caseId"
       WHERE lj."companyId"=$1
       ORDER BY lj."judgmentDate" DESC`,
      [scope.companyId]
    );
    const [totals] = await rawQuery<any>(
      `SELECT COALESCE(SUM(amount),0) AS "totalAmount", COALESCE(SUM("paidAmount"),0) AS "totalPaid"
       FROM legal_judgments WHERE "companyId"=$1`,
      [scope.companyId]
    );
    const [contingent] = await rawQuery<any>(
      `SELECT COALESCE(SUM("financialRisk"),0) AS total FROM legal_cases WHERE "companyId"=$1 AND status NOT IN ('closed')`,
      [scope.companyId]
    ).catch(() => [{ total: 0 }]);
    res.json({
      data: rows,
      totalAmount: Number(totals?.totalAmount || 0),
      totalPaid: Number(totals?.totalPaid || 0),
      outstanding: Number(totals?.totalAmount || 0) - Number(totals?.totalPaid || 0),
      contingentLiabilities: Number(contingent?.total || 0),
    });
  } catch (err) { handleRouteError(err, res, "Judgments financial report error:"); }
});

export default router;
