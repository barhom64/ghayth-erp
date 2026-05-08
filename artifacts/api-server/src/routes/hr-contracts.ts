import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, createNotification, emitEvent, todayISO, currentYear, generateRef } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const contractsRouter = Router();
contractsRouter.use(authMiddleware);

const createContractSchema = z.object({
  employeeId: z.coerce.number(),
  assignmentId: z.coerce.number().optional().nullable(),
  contractType: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  probationEndDate: z.string().optional(),
  salary: z.coerce.number().optional(),
  housingAllowance: z.coerce.number().optional(),
  transportAllowance: z.coerce.number().optional(),
  otherAllowances: z.record(z.any()).optional(),
  templateId: z.coerce.number().optional(),
  branchId: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const rejectContractSchema = z.object({
  reason: z.string().optional(),
});

const terminateContractSchema = z.object({
  reason: z.string().optional(),
});

const renewContractSchema = z.object({
  newEndDate: z.string().optional(),
  newSalary: z.coerce.number().optional(),
});

const updateContractSchema = createContractSchema.partial();

// ── List all contracts ──
contractsRouter.get("/", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, employeeId, search } = req.query as Record<string, string>;
    const params: any[] = [scope.companyId];
    let where = `ec."companyId" = $1 AND ec."deletedAt" IS NULL`;

    if (status) {
      params.push(status);
      where += ` AND ec."approvalStatus" = $${params.length}`;
    }
    if (employeeId) {
      params.push(Number(employeeId));
      where += ` AND ec."employeeId" = $${params.length}`;
    }
    if (search?.trim()) {
      params.push(`%${search.trim()}%`);
      where += ` AND (e.name ILIKE $${params.length} OR ec.ref ILIKE $${params.length})`;
    }

    const rows = await rawQuery<any>(
      `SELECT ec.*, e.name AS "employeeName", e."empNumber",
              b.name AS "branchName"
       FROM employee_contracts ec
       JOIN employees e ON e.id = ec."employeeId"
       LEFT JOIN branches b ON b.id = ec."branchId"
       WHERE ${where}
       ORDER BY ec."createdAt" DESC
       LIMIT 200`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ في جلب العقود");
  }
});

// ── Get single contract ──
contractsRouter.get("/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [contract] = await rawQuery<any>(
      `SELECT ec.*, e.name AS "employeeName", e."empNumber",
              e."nationalId", e."passportNumber",
              ea."jobTitle", ea.salary AS "assignmentSalary",
              b.name AS "branchName",
              dt.name AS "templateName", dt.content AS "templateContent"
       FROM employee_contracts ec
       JOIN employees e ON e.id = ec."employeeId"
       JOIN employee_assignments ea ON ea.id = ec."assignmentId"
       LEFT JOIN branches b ON b.id = ec."branchId"
       LEFT JOIN document_templates dt ON dt.id = ec."templateId"
       WHERE ec.id = $1 AND ec."companyId" = $2 AND ec."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!contract) throw new NotFoundError("العق�� غير موجود");
    res.json(contract);
  } catch (err) {
    handleRouteError(err, res, "خطأ في جلب العقد");
  }
});

// ── Create contract ──
contractsRouter.post("/", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const data = createContractSchema.parse(req.body);

    const [emp] = await rawQuery<any>(
      `SELECT e.id, e.name FROM employees e JOIN employee_assignments ea ON ea."employeeId"=e.id WHERE e.id = $1 AND ea."companyId" = $2 LIMIT 1`,
      [data.employeeId, scope.companyId]
    );
    if (!emp) throw new NotFoundError("الموظف غير موجود");

    let assignmentId = data.assignmentId ?? null;
    if (!assignmentId) {
      const [assn] = await rawQuery<any>(
        `SELECT id FROM employee_assignments
         WHERE "employeeId"=$1 AND "companyId"=$2 AND ("endDate" IS NULL OR "endDate" >= CURRENT_DATE)
         ORDER BY "isPrimary" DESC NULLS LAST, "hireDate" DESC NULLS LAST, id DESC LIMIT 1`,
        [data.employeeId, scope.companyId]
      );
      assignmentId = assn?.id ?? null;
    }
    if (!assignmentId) {
      throw new NotFoundError("لا يوجد تعيين فعّال لهذا الموظف. يرجى إنشاء تعيين أولاً.");
    }

    const [seqRow] = await rawQuery<any>(`SELECT nextval('contract_number_seq') AS seq`);
    const ref = generateRef("CTR", seqRow.seq);

    const [row] = await rawQuery<any>(
      `INSERT INTO employee_contracts (
        "companyId", "employeeId", "assignmentId", "contractType",
        "startDate", "endDate", "probationEndDate",
        salary, "housingAllowance", "transportAllowance", "otherAllowances",
        "templateId", "branchId", notes, ref, "approvalStatus", status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft','draft')
      RETURNING *`,
      [
        scope.companyId, data.employeeId, assignmentId, data.contractType,
        data.startDate, data.endDate || null, data.probationEndDate || null,
        data.salary || null, data.housingAllowance || null, data.transportAllowance || null,
        JSON.stringify(data.otherAllowances || {}),
        data.templateId || null, data.branchId || null, data.notes || null, ref,
      ]
    );

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "contract_created", entity: "employee_contract", entityId: row.id, after: { ref, employeeName: emp.name } });

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ في إنشاء العقد");
  }
});

// ── Update contract (draft only) ──
contractsRouter.patch("/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(
      `SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("العقد غير موجود");
    if (existing.approvalStatus !== "draft") {
      throw new ForbiddenError("لا يمكن تعديل العقد بعد إرساله للاعتماد");
    }

    const allowed = [
      "contractType", "startDate", "endDate", "probationEndDate",
      "salary", "housingAllowance", "transportAllowance", "otherAllowances",
      "templateId", "branchId", "notes",
    ];
    const sets: string[] = [];
    const params: any[] = [];
    const body = zodParse(updateContractSchema.safeParse(req.body));
    for (const key of allowed) {
      if ((body as any)[key] !== undefined) {
        params.push(key === "otherAllowances" ? JSON.stringify((body as any)[key]) : (body as any)[key]);
        sets.push(`"${key}" = $${params.length}`);
      }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتعديل");

    params.push(id, scope.companyId);
    sets.push(`"updatedAt" = NOW()`);

    const [updated] = await rawQuery<any>(
      `UPDATE employee_contracts SET ${sets.join(", ")}
       WHERE id = $${params.length - 1} AND "companyId" = $${params.length}
       RETURNING *`,
      params
    );
    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في تع��يل العقد");
  }
});

// ── Submit for approval ──
contractsRouter.post("/:id/submit", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [contract] = await rawQuery<any>(
      `SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!contract) throw new NotFoundError("العقد غير موجود");
    if (contract.approvalStatus !== "draft") {
      throw new ValidationError("العقد ليس في حالة مسودة");
    }

    const [updated] = await rawQuery<any>(
      `UPDATE employee_contracts SET "approvalStatus" = 'pending_approval', "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      [id, scope.companyId]
    );

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "contract_submitted", entity: "employee_contract", entityId: id, after: { ref: contract.ref } });

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في إرسال العقد للاعتما��");
  }
});

// ── Approve contract ──
contractsRouter.post("/:id/approve", requirePermission("hr:approve"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [contract] = await rawQuery<any>(
      `SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!contract) throw new NotFoundError("العقد غير موجود");
    if (contract.approvalStatus !== "pending_approval") {
      throw new ValidationError("العقد ليس في حالة انتظار الاعتماد");
    }

    const [updated] = await rawQuery<any>(
      `UPDATE employee_contracts
       SET "approvalStatus" = 'approved', "approvedBy" = $2, "approvedAt" = NOW(), "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $3 AND "approvalStatus" = 'pending_approval' RETURNING *`,
      [id, scope.userId, scope.companyId]
    );
    if (!updated) throw new ConflictError("تم تحديث العقد مسبقاً — أعد التحميل");

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "contract_approved", entity: "employee_contract", entityId: id, after: { ref: contract.ref } });
    await createNotification({ companyId: scope.companyId, assignmentId: contract.assignmentId, type: "contract_approved", title: "تم اعتماد العقد", body: `تم اعتماد العقد رقم ${contract.ref}`, refType: "contract", refId: id }).catch((e) => logger.error(e, "hr-contracts background task failed"));

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في اعتماد العقد");
  }
});

// ── Reject contract ──
contractsRouter.post("/:id/reject", requirePermission("hr:approve"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(rejectContractSchema.safeParse(req.body ?? {}));
    const { reason } = b;
    const [contract] = await rawQuery<any>(
      `SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!contract) throw new NotFoundError("العقد غير موجود");
    if (contract.approvalStatus !== "pending_approval") {
      throw new ValidationError("العقد ليس في حالة انتظار الاعتماد");
    }

    const [updated] = await rawQuery<any>(
      `UPDATE employee_contracts
       SET "approvalStatus" = 'rejected', notes = COALESCE(notes, '') || E'\nسبب الرفض: ' || $2, "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $3 AND "approvalStatus" = 'pending_approval' RETURNING *`,
      [id, reason || "لم يتم تحديد السبب", scope.companyId]
    );
    if (!updated) throw new ConflictError("تم تحديث العقد مسبقاً — أعد التحميل");

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "contract_rejected", entity: "employee_contract", entityId: id, after: { ref: contract.ref, reason } });

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في رفض العقد");
  }
});

// ─�� Sign by company ──
contractsRouter.post("/:id/sign-company", requirePermission("hr:approve"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [contract] = await rawQuery<any>(
      `SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!contract) throw new NotFoundError("العقد غير موجود");
    if (contract.approvalStatus !== "approved" && contract.approvalStatus !== "signed") {
      throw new ValidationError("يجب اعتماد العقد أولاً قبل التوقيع");
    }

    const [updated] = await rawQuery<any>(
      `UPDATE employee_contracts
       SET "signedByCompany" = TRUE, "companySignedAt" = NOW(), "companySignedBy" = $2, "updatedAt" = NOW(),
           "approvalStatus" = CASE WHEN "signedByEmployee" = TRUE THEN 'signed' ELSE "approvalStatus" END
       WHERE id = $1 AND "companyId" = $3 AND "signedByCompany" = FALSE RETURNING *`,
      [id, scope.userId, scope.companyId]
    );
    if (!updated) throw new ConflictError("العقد تم توقيعه مسبقاً — أعد التحميل");

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "contract_signed_company", entity: "employee_contract", entityId: id, after: { ref: contract.ref } });

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في توق��ع العقد");
  }
});

// ── Sign by employee (self-service) ──
contractsRouter.post("/:id/sign-employee", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [contract] = await rawQuery<any>(
      `SELECT ec.* FROM employee_contracts ec
       JOIN employee_assignments ea ON ea.id = ec."assignmentId"
       WHERE ec.id = $1 AND ec."companyId" = $2
         AND ea."employeeId" = (SELECT id FROM employees WHERE id = $3 AND "companyId" = $2)`,
      [id, scope.companyId, scope.employeeId]
    );
    if (!contract) throw new NotFoundError("العقد غير موجود أو ليس لك");
    if (contract.approvalStatus !== "approved" && contract.approvalStatus !== "signed") {
      throw new ValidationError("يجب اعتماد العقد أولاً قبل التوقيع");
    }

    const [updated] = await rawQuery<any>(
      `UPDATE employee_contracts
       SET "signedByEmployee" = TRUE, "employeeSignedAt" = NOW(), "updatedAt" = NOW(),
           "approvalStatus" = CASE WHEN "signedByCompany" = TRUE THEN 'signed' ELSE "approvalStatus" END
       WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      [id, scope.companyId]
    );

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "contract_signed_employee", entity: "employee_contract", entityId: id, after: { ref: contract.ref } });

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في توقيع العقد");
  }
});

// ── Activate contract (after both signatures) ──
contractsRouter.post("/:id/activate", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [contract] = await rawQuery<any>(
      `SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!contract) throw new NotFoundError("العقد غير موجود");
    if (contract.approvalStatus !== "signed") {
      throw new ValidationError("يجب توقيع العقد من الطرفين أولاً");
    }

    const [updated] = await rawQuery<any>(
      `UPDATE employee_contracts
       SET "approvalStatus" = 'active', status = 'active', "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $2 RETURNING *`,
      [id, scope.companyId]
    );

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "contract_activated", entity: "employee_contract", entityId: id, after: { ref: contract.ref } });

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في تفعيل العقد");
  }
});

// ── Terminate contract ──
contractsRouter.post("/:id/terminate", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(terminateContractSchema.safeParse(req.body ?? {}));
    const { reason } = b;
    const [contract] = await rawQuery<any>(
      `SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!contract) throw new NotFoundError("العقد غير موجود");
    if (contract.status !== "active") {
      throw new ValidationError("لا يمكن إنهاء عقد غير نشط");
    }

    const [updated] = await rawQuery<any>(
      `UPDATE employee_contracts
       SET status = 'terminated', "approvalStatus" = 'terminated',
           notes = COALESCE($3, notes), "updatedBy" = $2, "updatedAt" = NOW()
       WHERE id = $1 AND "companyId" = $4 RETURNING *`,
      [id, scope.userId, reason || null, scope.companyId]
    );

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "contract_terminated", entity: "employee_contract", entityId: id, after: { ref: contract.ref, reason } });

    res.json(updated);
  } catch (err) {
    handleRouteError(err, res, "خطأ في إنهاء العقد");
  }
});

// ── Renew contract ──
contractsRouter.post("/:id/renew", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(renewContractSchema.safeParse(req.body ?? {}));
    const { newEndDate, newSalary } = b;
    const [contract] = await rawQuery<any>(
      `SELECT * FROM employee_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!contract) throw new NotFoundError("الع��د غير موجود");

    const [seqRow] = await rawQuery<any>(`SELECT nextval('contract_number_seq') AS seq`);
    const ref = generateRef("CTR", seqRow.seq);

    const newStart = contract.endDate || todayISO();

    const newContract = await withTransaction(async (client) => {
      const insertRes = await client.query(
        `INSERT INTO employee_contracts (
          "companyId", "employeeId", "assignmentId", "contractType",
          "startDate", "endDate", salary, "housingAllowance", "transportAllowance",
          "otherAllowances", "templateId", "branchId", ref, "approvalStatus", status, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft','draft',$14)
        RETURNING *`,
        [
          scope.companyId, contract.employeeId, contract.assignmentId, contract.contractType,
          newStart, newEndDate || null,
          newSalary || contract.salary, contract.housingAllowance, contract.transportAllowance,
          JSON.stringify(contract.otherAllowances || {}),
          contract.templateId, contract.branchId, ref,
          `تجديد للعقد رقم ${contract.ref}`,
        ]
      );

      await client.query(
        `UPDATE employee_contracts SET "renewalDate" = $2, "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $3 AND "deletedAt" IS NULL`,
        [id, newStart, scope.companyId]
      );

      return insertRes.rows[0];
    });

    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "contract_renewed", entity: "employee_contract", entityId: newContract.id, after: {
      ref, previousRef: contract.ref,
    } });

    res.status(201).json(newContract);
  } catch (err) {
    handleRouteError(err, res, "خطأ في تجديد العقد");
  }
});

export default contractsRouter;
