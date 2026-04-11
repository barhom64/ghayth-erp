import { handleRouteError, validationError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { haversineKm, movingAverage, maintenancePriority, maintenanceSlaDeadline } from "../lib/algorithms.js";
import { createNotification, createAuditLog, createJournalEntry } from "../lib/businessHelpers.js";
import { getPropertyUnitStatusImpact } from "../lib/impactPreview.js";
import { eventBus } from "../lib/eventBus.js";

const router = Router();
router.use(authMiddleware);

router.get("/units", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, search, buildingId } = req.query as any;
    const conditions = [`u."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`u.status = $${params.length}`); }
    if (search) { params.push(`%${search}%`); conditions.push(`(u."unitNumber" ILIKE $${params.length} OR u."buildingName" ILIKE $${params.length})`); }
    if (buildingId) {
      params.push(Number(buildingId));
      conditions.push(`u."buildingId" = $${params.length}`);
    }
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 100);
    const offset = (page - 1) * limit;
    conditions.push(`u."deletedAt" IS NULL`);
    const rows = await rawQuery<any>(`SELECT u.* FROM property_units u WHERE ${conditions.join(" AND ")} ORDER BY u."buildingName", u."unitNumber" LIMIT ${limit} OFFSET ${offset}`, params);
    const [countRow] = await rawQuery<any>(`SELECT COUNT(*) as total FROM property_units u WHERE ${conditions.join(" AND ")}`, params);
    res.json({ data: rows, total: Number(countRow?.total || rows.length), page, pageSize: limit });
  } catch (err) { handleRouteError(err, res, "Property units error:"); }
});

router.post("/units", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const unitNumber = b.unitNumber || `UNIT-${Date.now().toString(36).toUpperCase()}`;
    const amenities = b.amenities ? (Array.isArray(b.amenities) ? JSON.stringify(b.amenities) : b.amenities) : null;
    const { insertId } = await rawExecute(
      `INSERT INTO property_units ("companyId","unitNumber","buildingId","buildingName",type,area,bedrooms,bathrooms,floor,"monthlyRent",status,address,direction,finishing,amenities,"branchId","electricityMeter","waterMeter","usageType","ownerId","parkingSpaces","acType","hasKitchen","yearlyRent","insurancePolicy","insuranceExpiry")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [scope.companyId, unitNumber, b.buildingId || null, b.buildingName || b.name || null,
       b.type || 'apartment', b.area || null, b.bedrooms || 0, b.bathrooms || 0, b.floor || null,
       b.monthlyRent || 0, b.status || 'available', b.address || null,
       b.direction || null, b.finishing || null, amenities, b.branchId || scope.branchId,
       b.electricityMeter || null, b.waterMeter || null, b.usageType || 'residential',
       b.ownerId || null, b.parkingSpaces || 0, b.acType || null,
       b.hasKitchen || false, b.yearlyRent || null, b.insurancePolicy || null, b.insuranceExpiry || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM property_units WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create unit error:"); }
});

router.get("/units/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [row] = await rawQuery<any>(`SELECT * FROM property_units WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!row) { res.status(404).json({ error: "الوحدة غير موجودة" }); return; }

    const [contracts, payments, maintenance, timeline] = await Promise.all([
      rawQuery<any>(
        `SELECT rc.*, (SELECT COUNT(*) FROM rent_payments WHERE "contractId"=rc.id AND status='paid') AS "paidCount",
                (SELECT COALESCE(SUM(amount),0) FROM rent_payments WHERE "contractId"=rc.id) AS "totalAmount",
                (SELECT COALESCE(SUM("paidAmount"),0) FROM rent_payments WHERE "contractId"=rc.id) AS "totalPaid"
         FROM rental_contracts rc WHERE "unitId"=$1 AND "companyId"=$2 ORDER BY rc.id DESC LIMIT 10`,
        [id, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT rp.*, c."tenantName" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" WHERE c."unitId"=$1 AND c."companyId"=$2 ORDER BY rp."dueDate" DESC LIMIT 20`,
        [id, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT * FROM maintenance_requests WHERE "unitId"=$1 AND "companyId"=$2 ORDER BY id DESC LIMIT 20`,
        [id, scope.companyId]
      ),
      rawQuery<any>(
        `SELECT al.*, u.email AS "userName" FROM audit_logs al LEFT JOIN users u ON u.id=al."userId" WHERE al.entity='property_units' AND al."entityId"=$1 ORDER BY al."createdAt" DESC LIMIT 30`,
        [id]
      ),
    ]);

    res.json({ ...row, contracts, payments, maintenance, timeline });
  } catch (err) { handleRouteError(err, res, "Get unit error:"); }
});

router.get("/units/:id/impact-preview", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { status } = req.query as { status?: string };
    if (!status) { res.status(400).json({ error: "status مطلوب" }); return; }
    const preview = await getPropertyUnitStatusImpact(id, scope.companyId, status);
    res.json(preview);
  } catch (err) { handleRouteError(err, res, "Impact preview error:"); }
});

router.patch("/units/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id, status FROM property_units WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الوحدة غير موجودة" }); return; }
    const b = req.body;
    if (b.status !== undefined && b.status !== existing.status) {
      const preview = await getPropertyUnitStatusImpact(id, scope.companyId, b.status);
      if (!preview.canProceed) {
        res.status(422).json({ error: "لا يمكن تغيير الحالة", blockers: preview.blockers });
        return;
      }
    }
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.unitNumber !== undefined) { params.push(b.unitNumber); sets.push(`"unitNumber"=$${params.length}`); }
    if (b.buildingName !== undefined) { params.push(b.buildingName); sets.push(`"buildingName"=$${params.length}`); }
    if (b.type !== undefined) { params.push(b.type); sets.push(`type=$${params.length}`); }
    if (b.area !== undefined) { params.push(b.area); sets.push(`area=$${params.length}`); }
    if (b.monthlyRent !== undefined) { params.push(b.monthlyRent); sets.push(`"monthlyRent"=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.address !== undefined) { params.push(b.address); sets.push(`address=$${params.length}`); }
    if (b.electricityMeter !== undefined) { params.push(b.electricityMeter); sets.push(`"electricityMeter"=$${params.length}`); }
    if (b.waterMeter !== undefined) { params.push(b.waterMeter); sets.push(`"waterMeter"=$${params.length}`); }
    if (b.usageType !== undefined) { params.push(b.usageType); sets.push(`"usageType"=$${params.length}`); }
    if (b.ownerId !== undefined) { params.push(b.ownerId || null); sets.push(`"ownerId"=$${params.length}`); }
    if (b.parkingSpaces !== undefined) { params.push(b.parkingSpaces); sets.push(`"parkingSpaces"=$${params.length}`); }
    if (b.acType !== undefined) { params.push(b.acType); sets.push(`"acType"=$${params.length}`); }
    if (b.hasKitchen !== undefined) { params.push(b.hasKitchen); sets.push(`"hasKitchen"=$${params.length}`); }
    if (b.yearlyRent !== undefined) { params.push(b.yearlyRent); sets.push(`"yearlyRent"=$${params.length}`); }
    if (b.insurancePolicy !== undefined) { params.push(b.insurancePolicy); sets.push(`"insurancePolicy"=$${params.length}`); }
    if (b.insuranceExpiry !== undefined) { params.push(b.insuranceExpiry); sets.push(`"insuranceExpiry"=$${params.length}`); }
    if (b.amenities !== undefined) { params.push(Array.isArray(b.amenities) ? JSON.stringify(b.amenities) : b.amenities); sets.push(`amenities=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.buildingId !== undefined) { params.push(b.buildingId || null); sets.push(`"buildingId"=$${params.length}`); }
    if (b.floor !== undefined) { params.push(b.floor); sets.push(`floor=$${params.length}`); }
    if (b.bedrooms !== undefined) { params.push(b.bedrooms); sets.push(`bedrooms=$${params.length}`); }
    if (b.bathrooms !== undefined) { params.push(b.bathrooms); sets.push(`bathrooms=$${params.length}`); }
    if (b.direction !== undefined) { params.push(b.direction); sets.push(`direction=$${params.length}`); }
    if (b.finishing !== undefined) { params.push(b.finishing); sets.push(`finishing=$${params.length}`); }
    params.push(id);
    await rawExecute(`UPDATE property_units SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    if (b.status !== undefined && b.status !== existing.status) {
      await createAuditLog({
        userId: scope.userId,
        entity: "property_units",
        entityId: id,
        action: "status_change",
        before: { status: existing.status },
        after: { status: b.status },
        companyId: scope.companyId,
      });
    }
    const [row] = await rawQuery<any>(`SELECT * FROM property_units WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update unit error:"); }
});

router.delete("/units/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM property_units WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الوحدة غير موجودة" }); return; }
    await rawExecute(`UPDATE property_units SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف الوحدة بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete unit error:"); }
});

router.get("/contracts", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`c."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`c.status = $${params.length}`); }
    conditions.push(`c."deletedAt" IS NULL`);
    const rows = await rawQuery<any>(
      `SELECT c.*, u."unitNumber", u."buildingName" FROM rental_contracts c LEFT JOIN property_units u ON u.id=c."unitId" WHERE ${conditions.join(" AND ")} ORDER BY c.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Rental contracts error:"); }
});

router.post("/contracts", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;

    if (!b.unitId) {
      validationError(res, "لا يمكن إنشاء عقد إيجار بدون وحدة عقارية", "unitId", "حدد الوحدة العقارية المراد تأجيرها");
      return;
    }
    if (!b.startDate) {
      validationError(res, "لا يمكن إنشاء عقد بدون تاريخ بداية", "startDate", "حدد تاريخ بداية العقد");
      return;
    }
    if (!b.endDate) {
      validationError(res, "لا يمكن إنشاء عقد بدون تاريخ نهاية", "endDate", "حدد تاريخ نهاية العقد");
      return;
    }

    const tenantId = b.tenantId ? Number(b.tenantId) : null;
    const frequency = b.paymentFrequency || 'monthly';
    const monthlyRent = Number(b.monthlyRent) || 0;
    let yearlyRent = b.yearlyRent ? Number(b.yearlyRent) : monthlyRent * 12;
    const startDate = new Date(b.startDate);
    const endDate = new Date(b.endDate);
    const contractMonths = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
    const totalContractValue = b.totalContractValue ? Number(b.totalContractValue) : monthlyRent * contractMonths;

    let installmentCount = b.numberOfInstallments ? Number(b.numberOfInstallments) : null;
    if (!installmentCount) {
      if (frequency === 'monthly') installmentCount = contractMonths;
      else if (frequency === 'quarterly') installmentCount = Math.ceil(contractMonths / 3);
      else if (frequency === 'semi_annual') installmentCount = Math.ceil(contractMonths / 6);
      else if (frequency === 'annual') installmentCount = Math.ceil(contractMonths / 12);
      else installmentCount = contractMonths;
    }

    const contractNumber = b.contractNumber || `RC-${Date.now().toString(36).toUpperCase()}`;

    const { insertId } = await rawExecute(
      `INSERT INTO rental_contracts ("companyId","unitId","tenantId","tenantName","tenantPhone","tenantEmail","tenantIdNumber","startDate","endDate","monthlyRent","depositAmount","paymentDay",notes,status,
       "contractNumber","ejarNumber","contractType","paymentFrequency","yearlyRent","totalContractValue","latePenaltyType","latePenaltyValue","gracePeriodDays","terminationNoticeDays","earlyTerminationFee","autoRenewal","renewalNoticeDays","renewalPeriodMonths","electricityResponsibility","waterResponsibility","gasResponsibility","maintenanceResponsibility","brokerageFee","brokeragePayor","depositHolder","insuranceRequired","ownerId","numberOfInstallments","specialConditions","ejarStatus","registrationDate")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
       $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41)`,
      [scope.companyId, b.unitId, tenantId, b.tenantName, b.tenantPhone, b.tenantEmail, b.tenantIdNumber, b.startDate, b.endDate, monthlyRent, b.depositAmount || 0, b.paymentDay || 1, b.notes, b.status || "active",
       contractNumber, b.ejarNumber || null, b.contractType || 'residential', frequency, yearlyRent, totalContractValue, b.latePenaltyType || 'percentage', b.latePenaltyValue || 0, b.gracePeriodDays || 0, b.terminationNoticeDays || 30, b.earlyTerminationFee || 0, b.autoRenewal || false, b.renewalNoticeDays || 60, b.renewalPeriodMonths || 12, b.electricityResponsibility || 'tenant', b.waterResponsibility || 'tenant', b.gasResponsibility || 'tenant', b.maintenanceResponsibility || 'shared', b.brokerageFee || 0, b.brokeragePayor || 'tenant', b.depositHolder || 'owner', b.insuranceRequired || false, b.ownerId || null, installmentCount, b.specialConditions || null, b.ejarStatus || 'draft', b.registrationDate || null]
    );

    await rawExecute(`UPDATE property_units SET status='rented', "updatedAt"=NOW() WHERE id=$1`, [b.unitId]);

    if (installmentCount && installmentCount > 0 && totalContractValue > 0) {
      const installmentAmount = Math.round((totalContractValue / installmentCount) * 100) / 100;
      const freqMonths = frequency === 'quarterly' ? 3 : frequency === 'semi_annual' ? 6 : frequency === 'annual' ? 12 : 1;
      for (let i = 0; i < installmentCount; i++) {
        const dueDate = new Date(startDate);
        dueDate.setMonth(dueDate.getMonth() + (i * freqMonths));
        if (b.paymentDay) dueDate.setDate(Math.min(Number(b.paymentDay), 28));
        const dueDateStr = dueDate.toISOString().split('T')[0];
        const isLast = i === installmentCount - 1;
        const amt = isLast ? totalContractValue - (installmentAmount * (installmentCount - 1)) : installmentAmount;
        await rawExecute(
          `INSERT INTO contract_payment_schedule ("companyId","contractId","installmentNumber","dueDate",amount,status) VALUES ($1,$2,$3,$4,$5,'pending')`,
          [scope.companyId, insertId, i + 1, dueDateStr, Math.round(amt * 100) / 100]
        );
      }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM rental_contracts WHERE id=$1`, [insertId]);
    const schedule = await rawQuery<any>(`SELECT * FROM contract_payment_schedule WHERE "contractId"=$1 ORDER BY "installmentNumber"`, [insertId]);
    res.status(201).json({ ...row, paymentSchedule: schedule });
  } catch (err) { handleRouteError(err, res, "Create contract error:"); }
});

router.patch("/contracts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("tenantId", b.tenantId !== undefined ? (b.tenantId ? Number(b.tenantId) : null) : undefined);
    addField("tenantName", b.tenantName);
    addField("tenantPhone", b.tenantPhone);
    addField("tenantEmail", b.tenantEmail);
    addField("tenantIdNumber", b.tenantIdNumber);
    addField("startDate", b.startDate);
    addField("endDate", b.endDate);
    addField("monthlyRent", b.monthlyRent);
    addField("depositAmount", b.depositAmount);
    addField("paymentDay", b.paymentDay);
    addField("notes", b.notes);
    addField("status", b.status);
    addField("contractNumber", b.contractNumber);
    addField("ejarNumber", b.ejarNumber);
    addField("contractType", b.contractType);
    addField("paymentFrequency", b.paymentFrequency);
    addField("yearlyRent", b.yearlyRent);
    addField("totalContractValue", b.totalContractValue);
    addField("latePenaltyType", b.latePenaltyType);
    addField("latePenaltyValue", b.latePenaltyValue);
    addField("gracePeriodDays", b.gracePeriodDays);
    addField("terminationNoticeDays", b.terminationNoticeDays);
    addField("earlyTerminationFee", b.earlyTerminationFee);
    addField("autoRenewal", b.autoRenewal);
    addField("renewalNoticeDays", b.renewalNoticeDays);
    addField("renewalPeriodMonths", b.renewalPeriodMonths);
    addField("electricityResponsibility", b.electricityResponsibility);
    addField("waterResponsibility", b.waterResponsibility);
    addField("gasResponsibility", b.gasResponsibility);
    addField("maintenanceResponsibility", b.maintenanceResponsibility);
    addField("brokerageFee", b.brokerageFee);
    addField("brokeragePayor", b.brokeragePayor);
    addField("depositHolder", b.depositHolder);
    addField("insuranceRequired", b.insuranceRequired);
    addField("ownerId", b.ownerId !== undefined ? (b.ownerId || null) : undefined);
    addField("numberOfInstallments", b.numberOfInstallments);
    addField("specialConditions", b.specialConditions);
    addField("ejarStatus", b.ejarStatus);
    addField("registrationDate", b.registrationDate);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE rental_contracts SET ${fields.join(", ")}, "updatedAt"=NOW() WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    if (rows.length === 0) { res.status(404).json({ error: "العقد غير موجود" }); return; }
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update contract error:"); }
});

router.delete("/contracts/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM rental_contracts WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "العقد غير موجود" }); return; }
    await rawExecute(`UPDATE rental_contracts SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف العقد" });
  } catch (err) { handleRouteError(err, res, "Delete contract error:"); }
});

router.patch("/tenants/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("name", b.name);
    addField("phone", b.phone);
    addField("email", b.email);
    addField("nationalId", b.nationalId);
    addField("nationality", b.nationality);
    addField("idType", b.idType);
    addField("tenantType", b.tenantType);
    addField("crNumber", b.crNumber);
    addField("unifiedNumber", b.unifiedNumber);
    addField("birthDate", b.birthDate);
    addField("gender", b.gender);
    addField("guarantorName", b.guarantorName);
    addField("guarantorId", b.guarantorId);
    addField("guarantorPhone", b.guarantorPhone);
    addField("guarantorRelation", b.guarantorRelation);
    addField("emergencyContact", b.emergencyContact);
    addField("emergencyName", b.emergencyName);
    addField("maritalStatus", b.maritalStatus);
    addField("occupation", b.occupation);
    addField("monthlyIncome", b.monthlyIncome);
    addField("previousAddress", b.previousAddress);
    addField("previousLandlord", b.previousLandlord);
    addField("previousLandlordPhone", b.previousLandlordPhone);
    addField("notes", b.notes);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE tenants SET ${fields.join(", ")}, "updatedAt"=NOW() WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    if (rows.length === 0) { res.status(404).json({ error: "المستأجر غير موجود" }); return; }
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update tenant error:"); }
});

router.delete("/tenants/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM tenants WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المستأجر غير موجود" }); return; }
    await rawExecute(`UPDATE tenants SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف المستأجر" });
  } catch (err) { handleRouteError(err, res, "Delete tenant error:"); }
});

router.get("/payments", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, contractId } = req.query as any;
    const conditions = [`c."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`rp.status = $${params.length}`); }
    if (contractId) { params.push(Number(contractId)); conditions.push(`rp."contractId" = $${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT rp.*, c."tenantName", u."unitNumber" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" LEFT JOIN property_units u ON u.id=c."unitId" WHERE ${conditions.join(" AND ")} ORDER BY rp."dueDate" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Rent payments error:"); }
});

router.post("/payments/:id/pay", async (req, res) => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const b = req.body;
    const paidAmount = Number(b.paidAmount ?? b.amount);
    await rawExecute(
      `UPDATE rent_payments SET "paidAmount"="paidAmount"+$1, "paidDate"=$2, method=$3, status=CASE WHEN "paidAmount"+$1 >= amount THEN 'paid' ELSE 'partial' END WHERE id=$4`,
      [paidAmount, b.paidDate || new Date().toISOString().split('T')[0], b.method || 'bank_transfer', Number(id)]
    );

    // Auto journal entry for rent payment collection
    if (paidAmount > 0) {
      try {
        const [payment] = await rawQuery<any>(
          `SELECT rp.*, c."tenantName", u."unitNumber", u."buildingName"
           FROM rent_payments rp
           JOIN rental_contracts c ON c.id = rp."contractId"
           LEFT JOIN property_units u ON u.id = c."unitId"
           WHERE rp.id = $1`,
          [Number(id)]
        );
        if (payment) {
          const tenantLabel = payment.tenantName ? ` / ${payment.tenantName}` : "";
          const unitLabel = payment.unitNumber ? ` / وحدة ${payment.unitNumber}` : "";
          const buildingLabel = payment.buildingName ? ` / ${payment.buildingName}` : "";
          const cashAccountCode = b.method === 'cash' ? '1100' : '1110';
          await createJournalEntry({
            companyId: scope.companyId,
            branchId: scope.branchId,
            createdBy: scope.activeAssignmentId ?? scope.userId,
            ref: `RENT-${id}`,
            description: `تحصيل إيجار${tenantLabel}${unitLabel}${buildingLabel}`,
            lines: [
              { accountCode: cashAccountCode, debit: paidAmount, credit: 0 },
              { accountCode: "4100", debit: 0, credit: paidAmount },
            ],
          });
        }
      } catch (jErr) { console.error("Rent payment journal entry failed:", jErr); }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM rent_payments WHERE id=$1`, [Number(id)]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Record rent payment error:"); }
});

router.post("/late-rent/escalate", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const today = new Date();

    const overduePayments = await rawQuery<any>(
      `SELECT rp.*, c."tenantName", c."tenantPhone", c.id AS "contractId", c."monthlyRent", u."unitNumber", u."buildingName" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" LEFT JOIN property_units u ON u.id=c."unitId" WHERE c."companyId"=$1 AND rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE`,
      [cid]
    );

    const results: any[] = [];
    for (const payment of overduePayments) {
      const dueDate = new Date(payment.dueDate);
      const lateDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      let targetStage: string | null = null;
      if (lateDays >= 90) targetStage = 'legal_transfer';
      else if (lateDays >= 60) targetStage = 'penalty_applied';
      else if (lateDays >= 30) targetStage = 'escalation';
      else if (lateDays >= 14) targetStage = 'field_visit';
      else if (lateDays >= 7) targetStage = 'notification';
      else if (lateDays >= 3) targetStage = 'alert';

      if (!targetStage) continue;

      const existingAction = await rawQuery<any>(
        `SELECT id FROM late_rent_actions WHERE "paymentId"=$1 AND phase=$2 LIMIT 1`,
        [payment.id, targetStage]
      );
      if (existingAction.length > 0) {
        results.push({ paymentId: payment.id, tenant: payment.tenantName, unit: payment.unitNumber, lateDays, stage: targetStage, skipped: true, reason: 'already_applied' });
        continue;
      }

      let action: string | null = null;
      let financialMutation: any = null;

      if (targetStage === 'legal_transfer') {
        action = 'تحويل للقسم القانوني';
        try {
          await rawExecute(
            `INSERT INTO legal_cases ("companyId","caseNumber",title,"caseType","opposingParty",status,priority,description) VALUES ($1,$2,$3,'property_rent',$4,'open','high',$5)`,
            [cid, `RENT-${payment.id}-${Date.now()}`, `تحصيل إيجار - ${payment.unitNumber} - ${payment.tenantName}`, payment.tenantName, `إيجار متأخر ${lateDays} يوم - وحدة ${payment.unitNumber} - مبلغ ${payment.amount} ريال`]
          );
        } catch (legalErr) {
          console.error("Failed to create legal case:", legalErr);
        }
      } else if (targetStage === 'penalty_applied') {
        const lateFee = Number(payment.amount) * 0.02;
        action = `تطبيق غرامة تأخير 2% = ${lateFee.toFixed(2)} ريال`;
        await rawExecute(
          `UPDATE rent_payments SET amount=amount+$1, notes=CONCAT(COALESCE(notes,''), ' | غرامة تأخير 2%: ',$2::text) WHERE id=$3`,
          [lateFee, lateFee.toFixed(2), payment.id]
        );
        financialMutation = { lateFee, newAmount: Number(payment.amount) + lateFee };
      } else if (targetStage === 'escalation') {
        action = 'تصعيد لإدارة الأملاك';
      } else if (targetStage === 'field_visit') {
        action = 'زيارة ميدانية للمستأجر';
      } else if (targetStage === 'notification') {
        action = 'إشعار رسمي للمستأجر';
        console.log(`[SMS] تذكير متأخرات: ${payment.tenantName} — ${payment.tenantPhone} — مبلغ ${payment.amount} ريال`);
      } else if (targetStage === 'alert') {
        action = 'تنبيه بالتأخر';
      }

      try {
        await rawExecute(
          `INSERT INTO late_rent_actions ("contractId","paymentId",phase,action,"sentAt",notes) VALUES ($1,$2,$3,$4,NOW(),$5)`,
          [payment.contractId, payment.id, targetStage, action, `إيجار متأخر ${lateDays} يوم — المرحلة: ${targetStage}`]
        );
      } catch (logErr) {
        console.error("Failed to log late_rent_action:", logErr);
      }

      if (payment.unitId) {
        try {
          await createAuditLog({
            userId: scope.userId, entity: "property_units", entityId: payment.unitId,
            action: targetStage === "penalty_applied" ? "auto_penalty" : "late_rent_escalation",
            companyId: cid,
            before: null,
            after: { stage: targetStage, lateDays, action, paymentId: payment.id, tenant: payment.tenantName, ...(financialMutation || {}) },
          });
        } catch (auditErr) { console.error("Penalty audit log error:", auditErr); }
      }

      results.push({ paymentId: payment.id, tenant: payment.tenantName, unit: payment.unitNumber, lateDays, stage: targetStage, action, financialMutation });
    }

    res.json({ processed: results.length, results });
  } catch (err) { handleRouteError(err, res, "Late rent escalation error:"); }
});

router.get("/maintenance-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`mr."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`mr.status = $${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT mr.*, u."unitNumber", u."buildingName", t.name AS "technicianName" FROM maintenance_requests mr LEFT JOIN property_units u ON u.id=mr."unitId" LEFT JOIN technicians t ON t.id=mr."assignedTo" WHERE ${conditions.join(" AND ")} ORDER BY mr.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Maintenance requests error:"); }
});

router.post("/maintenance-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;

    const emergencyKeywords = ['تسرب', 'حريق', 'كسر', 'انهيار', 'غاز', 'كهرباء', 'طوارئ', 'خطر', 'فيضان', 'ماس كهربائي'];
    const descLower = (b.description || '').toLowerCase();
    const isEmergency = emergencyKeywords.some(kw => descLower.includes(kw));

    const pastRequests = await rawQuery<any>(
      `SELECT EXTRACT(EPOCH FROM ("completedAt"::timestamp - "createdAt"::timestamp))/86400 AS days FROM maintenance_requests WHERE "unitId"=$1 AND status='completed' AND "completedAt" IS NOT NULL ORDER BY id DESC LIMIT 10`,
      [b.unitId]
    );
    const responseDays = pastRequests.map((r: any) => Number(r.days)).filter((d: number) => d > 0);
    const avgResponseDays = responseDays.length > 0 ? movingAverage(responseDays) : 5;
    const estimatedDuration = Math.max(1, Math.round(avgResponseDays));

    let autoPriority = b.priority || maintenancePriority(b.category, avgResponseDays);
    if (isEmergency && autoPriority !== 'critical') autoPriority = 'critical';
    const slaDeadline = maintenanceSlaDeadline(autoPriority);

    const technicians = await rawQuery<any>(
      `SELECT t.*, COUNT(mr2.id) AS "activeJobs",
              COALESCE(t.rating, 3) AS "techRating"
       FROM technicians t
       LEFT JOIN maintenance_requests mr2 ON mr2."assignedTo"=t.id AND mr2.status NOT IN ('completed','closed')
       WHERE t."companyId"=$1 AND t.status='available'
       GROUP BY t.id
       ORDER BY COUNT(mr2.id) ASC`,
      [scope.companyId]
    );

    let assignedTechnicianId = b.assignedTo || null;
    let techDistance: number | null = null;
    if (!assignedTechnicianId && technicians.length > 0) {
      let best = technicians[0];
      let bestScore = -Infinity;
      const maxJobs = Math.max(...technicians.map((t: any) => Number(t.activeJobs) || 0), 1);

      for (const tech of technicians) {
        const activeJobs = Number(tech.activeJobs) || 0;
        const loadScore = (1 - activeJobs / maxJobs) * 0.4;

        let proxScore = 0.15;
        if (b.unitLat && b.unitLon && tech.latitude && tech.longitude) {
          const dist = haversineKm(Number(b.unitLat), Number(b.unitLon), Number(tech.latitude), Number(tech.longitude));
          proxScore = (1 / (1 + dist)) * 0.3;
        }

        const rating = Number(tech.techRating) || 3;
        const ratingScore = (rating / 5) * 0.2;
        const specialtyMatch = (tech.specialty && b.category && tech.specialty.toLowerCase().includes(b.category.toLowerCase())) ? 0.1 : 0;

        const combined = loadScore + proxScore + ratingScore + specialtyMatch;
        if (combined > bestScore) { bestScore = combined; best = tech; }
      }
      assignedTechnicianId = best.id;

      if (b.unitLat && b.unitLon && best.latitude && best.longitude) {
        techDistance = haversineKm(Number(b.unitLat), Number(b.unitLon), Number(best.latitude), Number(best.longitude));
      }
    }

    const { insertId } = await rawExecute(
      `INSERT INTO maintenance_requests ("companyId","unitId","contractId","tenantName",category,description,priority,status,"assignedTo","estimatedCost") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, b.unitId, b.contractId || null, b.tenantName || null, b.category || null, b.description, autoPriority, assignedTechnicianId ? 'assigned' : 'pending', assignedTechnicianId, b.estimatedCost || 0]
    );

    if (assignedTechnicianId) {
      try {
        const [techEmp] = await rawQuery<any>(
          `SELECT t."employeeId", ea.id AS "assignmentId" FROM technicians t
           LEFT JOIN employee_assignments ea ON ea."employeeId"=t."employeeId" AND ea.status='active'
           WHERE t.id=$1`, [assignedTechnicianId]);
        if (techEmp?.assignmentId) {
          createNotification({
            companyId: scope.companyId,
            assignmentId: techEmp.assignmentId,
            type: "maintenance_request",
            title: "بلاغ صيانة جديد مسند إليك",
            body: `بلاغ صيانة: ${b.category || 'عام'} — ${b.description?.substring(0, 80) || ''} — الأولوية: ${autoPriority}`,
            priority: autoPriority === 'critical' ? 'high' : 'normal',
            refType: "maintenance_requests",
            refId: insertId,
          }).catch(console.error);
        }
      } catch (notifErr) { console.error("Technician notification error:", notifErr); }
    }

    if (b.tenantPhone) {
      console.log(`[SMS] بلاغ صيانة #${insertId} — SMS للمستأجر ${b.tenantName}: تم استلام بلاغك وسيتم التواصل معك خلال ${estimatedDuration} يوم`);
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "maintenance_requests", entityId: insertId,
      after: { category: b.category, priority: autoPriority, assignedTo: assignedTechnicianId, isEmergency },
    }).catch(console.error);

    try {
      let techAssignmentId = null;
      if (assignedTechnicianId) {
        const [techEmp] = await rawQuery<any>(
          `SELECT ea.id FROM technicians t LEFT JOIN employee_assignments ea ON ea."employeeId"=t."employeeId" AND ea.status='active' WHERE t.id=$1`,
          [assignedTechnicianId]
        );
        if (techEmp) techAssignmentId = techEmp.id;
      }
      await rawExecute(
        `INSERT INTO tasks ("companyId","branchId","assignmentId","assignedTo",title,description,type,priority,status,"linkedEntityType","linkedEntityId","autoGenerated","createdAt")
         VALUES ($1,$2,$3,$4,$5,$6,'task',$7,'pending','maintenance_request',$8,true,NOW())`,
        [
          scope.companyId, scope.branchId, scope.activeAssignmentId,
          techAssignmentId || scope.activeAssignmentId,
          `صيانة: ${b.category || 'عام'} — بلاغ #${insertId}`,
          b.description || null,
          autoPriority === 'critical' ? 'high' : 'medium',
          insertId,
        ]
      );
    } catch (taskErr) { console.error("Auto-task creation failed:", taskErr); }

    const [row] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1`, [insertId]);
    res.status(201).json({
      ...row,
      smsNotificationQueued: !!b.tenantPhone,
      technicianAssigned: !!assignedTechnicianId,
      technicianDistance: techDistance,
      priority: autoPriority,
      isEmergency,
      avgResponseDays,
      estimatedDuration,
    });
  } catch (err) { handleRouteError(err, res, "Create maintenance request error:"); }
});

router.patch("/maintenance-requests/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { approved, notes } = req.body as any;

    const [mr] = await rawQuery<any>(
      `SELECT * FROM maintenance_requests WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!mr) { res.status(404).json({ error: "طلب الصيانة غير موجود" }); return; }

    const newStatus = approved === false ? "rejected" : approved === true ? "approved" : "returned";
    if (newStatus === "rejected" && !notes) {
      res.status(400).json({ error: "يجب ذكر سبب الرفض" }); return;
    }

    await rawExecute(
      `UPDATE maintenance_requests SET status = $1, "updatedAt" = NOW() WHERE id = $2`,
      [newStatus, id]
    );

    try {
      await rawExecute(
        `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('maintenance_request',$1,$2,$3,$4,$5)`,
        [id, newStatus, notes || null, scope.userId, scope.companyId]
      );
    } catch (e) { console.error("Failed to log approval action:", e); }

    res.json({ id, status: newStatus });
  } catch (err) { handleRouteError(err, res, "خطأ في اعتماد طلب الصيانة"); }
});

router.post("/maintenance-requests/:id/complete", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const [mr] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!mr) { res.status(404).json({ error: "الطلب غير موجود" }); return; }

    const validationErrors: string[] = [];
    if (!b.closureReport && !mr.closureReport) validationErrors.push("تقرير الإغلاق مطلوب");
    const afterPhotos = b.afterPhotos || (mr.afterPhotos ? (typeof mr.afterPhotos === "string" ? JSON.parse(mr.afterPhotos) : mr.afterPhotos) : []);
    if (!afterPhotos || afterPhotos.length === 0) validationErrors.push("صور ما بعد الصيانة مطلوبة (صورة واحدة على الأقل)");
    const costInput = b.actualCost !== undefined ? b.actualCost : b.cost;
    const resolvedCost = costInput !== undefined ? Number(costInput) : (mr.actualCost !== null && mr.actualCost !== undefined ? Number(mr.actualCost) : null);
    if (resolvedCost === null || isNaN(resolvedCost)) {
      validationErrors.push("التكلفة الفعلية مطلوبة");
    } else if (resolvedCost < 0) {
      validationErrors.push("التكلفة الفعلية لا يمكن أن تكون سالبة");
    } else if (resolvedCost === 0 && !b.zeroCostConfirmed) {
      validationErrors.push("يرجى تأكيد أن التكلفة صفر");
    }
    const materials = b.materialsUsed || (mr.materialsUsed ? (typeof mr.materialsUsed === "string" ? JSON.parse(mr.materialsUsed) : mr.materialsUsed) : []);
    if (!materials || !Array.isArray(materials) || materials.length === 0) validationErrors.push("قائمة المواد المستخدمة مطلوبة (مادة واحدة على الأقل)");
    if (validationErrors.length > 0) {
      res.status(400).json({ error: "بيانات الإغلاق غير مكتملة", validationErrors });
      return;
    }

    const cost = resolvedCost ?? 0;
    const completeSets = [`status='completed'`, `"completedAt"=NOW()`, `"updatedAt"=NOW()`];
    const completeParams: any[] = [];
    if (costInput !== undefined) { completeParams.push(cost); completeSets.push(`"actualCost"=$${completeParams.length}`); }
    if (b.closureReport) { completeParams.push(b.closureReport); completeSets.push(`"closureReport"=$${completeParams.length}`); }
    if (b.afterPhotos) { completeParams.push(JSON.stringify(b.afterPhotos)); completeSets.push(`"afterPhotos"=$${completeParams.length}`); }
    if (b.materialsUsed) { completeParams.push(JSON.stringify(b.materialsUsed)); completeSets.push(`"materialsUsed"=$${completeParams.length}`); }
    completeParams.push(id);
    await rawExecute(
      `UPDATE maintenance_requests SET ${completeSets.join(",")} WHERE id=$${completeParams.length}`,
      completeParams
    );

    let invoiceId: number | null = null;
    if (cost > 0 && !b.coveredByContract) {
      const monthNum = String(new Date().getMonth() + 1).padStart(2, "0");
      const yearShort = String(new Date().getFullYear()).slice(2);
      const ref = `INV-MAINT-${yearShort}${monthNum}-${id}`;
      const vatAmount = cost * 0.15;
      const { insertId: iId } = await rawExecute(
        `INSERT INTO invoices ("companyId","clientId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate","createdBy") VALUES ($1,NULL,$2,$3,$4,$5,$6,15,0,'draft',$7,$8)`,
        [scope.companyId, ref, `صيانة - ${mr.category} - ${mr.tenantName}`, cost, cost + vatAmount, vatAmount, new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], scope.userId]
      );
      invoiceId = iId;
      try {
        await createAuditLog({
          companyId: scope.companyId,
          userId: scope.userId,
          action: "auto_invoice_created",
          entity: "maintenance_requests",
          entityId: id,
          after: { message: `تم إنشاء فاتورة مسودة تلقائياً بقيمة ${cost.toFixed(2)} ريال`, invoiceId: iId, ref },
        });
      } catch (aErr) { console.error("Auto-invoice audit log failed:", aErr); }
    }

    if (mr.assignedTo) {
      try {
        const completedCount = await rawQuery<any>(
          `SELECT COUNT(*) AS cnt FROM maintenance_requests WHERE "assignedTo"=$1 AND status='completed' AND "companyId"=$2`,
          [mr.assignedTo, scope.companyId]
        );
        const newRating = Math.min(5, 3 + Math.log10(Number(completedCount[0]?.cnt || 1) + 1));
        await rawExecute(`UPDATE technicians SET rating=$1 WHERE id=$2`, [parseFloat(newRating.toFixed(2)), mr.assignedTo]);
      } catch (ratingErr) {
        console.error("Failed to update technician rating:", ratingErr);
      }
    }

    let journalEntryId: number | null = null;
    if (cost > 0) {
      try {
        journalEntryId = await createJournalEntry({
          companyId: scope.companyId,
          branchId: scope.branchId,
          createdBy: scope.userId,
          ref: `JE-MAINT-${id}-${Date.now()}`,
          description: `صيانة أملاك — بلاغ #${id} — ${mr.category} — ${cost.toFixed(2)} ريال`,
          lines: [
            { accountCode: "5300", debit: cost, credit: 0 },
            { accountCode: "1000", debit: 0, credit: cost },
          ],
        });
      } catch (jeErr) { console.error("Journal entry failed:", jeErr); }
    }

    await createAuditLog({
      userId: scope.userId, entity: "maintenance_requests", entityId: id,
      action: "status_change", companyId: scope.companyId,
      before: { status: mr.status }, after: { status: "completed" },
    });

    let followUpTaskId: number | null = null;
    try {
      const followUpRows = await rawQuery<any>(
        `INSERT INTO tasks ("companyId","branchId","assignmentId","assignedTo",title,description,type,priority,status,"linkedEntityType","linkedEntityId","autoGenerated","createdAt")
         VALUES ($1,$2,$3,$3,$4,$5,'task','medium','pending','maintenance_request',$6,true,NOW()) RETURNING id`,
        [scope.companyId, scope.branchId, scope.activeAssignmentId,
         `متابعة رضا المستأجر — بلاغ صيانة #${id}`,
         `تواصل مع المستأجر ${mr.tenantName || ""} للاستفسار عن رضاه عن خدمة الصيانة (${mr.category || ""})`,
         id]
      );
      followUpTaskId = followUpRows[0]?.id || null;
      if (followUpTaskId) {
        try {
          await createAuditLog({
            companyId: scope.companyId,
            userId: scope.userId,
            action: "auto_task_created",
            entity: "maintenance_requests",
            entityId: id,
            after: { message: `تم إنشاء مهمة متابعة رضا المستأجر تلقائياً`, taskId: followUpTaskId },
          });
        } catch (auditErr) { console.error("Cross-module audit log failed:", auditErr); }
      }
    } catch (taskErr) { console.error("Failed to create follow-up task:", taskErr); }

    console.log(`[SURVEY] Maintenance #${id} completed — follow-up task #${followUpTaskId} created for ${mr.tenantName}`);

    eventBus.emit("maintenance.completed", {
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "maintenance_requests",
      entityId: id,
      details: { invoiceId, followUpTaskId, journalEntryId, cost, category: mr.category, unitId: mr.unitId },
    });

    if (mr.unitId) {
      try {
        await createAuditLog({
          companyId: scope.companyId,
          userId: scope.userId,
          action: "maintenance_completed",
          entity: "property_units",
          entityId: mr.unitId,
          after: { message: `تم إتمام صيانة #${id} — ${mr.category || ""}`, maintenanceId: id, cost },
        });
      } catch (e) { console.error("Unit audit log for maintenance completion failed:", e); }
    }

    const [updated] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1`, [id]);
    res.json({ ...updated, invoiceCreated: !!invoiceId, invoiceId, surveyQueued: true, journalEntryId, followUpTaskId });
  } catch (err) { handleRouteError(err, res, "Complete maintenance request error:"); }
});

router.get("/technicians", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM technicians WHERE "companyId"=$1 ORDER BY name`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Technicians error:"); }
});

router.get("/tenants", async (req, res) => {
  try {
    const scope = req.scope!;
    const { search } = req.query as any;
    const params: any[] = [scope.companyId];
    let whereClause = `"companyId"=$1`;
    if (search) { params.push(`%${search}%`); whereClause += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length} OR "nationalId" ILIKE $${params.length})`; }
    whereClause += ` AND "deletedAt" IS NULL`;
    const rows = await rawQuery<any>(
      `SELECT id, name, phone, email, "nationalId", nationality, "idType", notes, "createdAt" FROM tenants WHERE ${whereClause} ORDER BY name`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Tenants error:"); }
});

router.post("/tenants", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.name) { res.status(400).json({ error: "اسم المستأجر مطلوب" }); return; }
    const { insertId } = await rawExecute(
      `INSERT INTO tenants ("companyId", name, phone, email, "nationalId", nationality, "idType", notes, "tenantType", "crNumber", "unifiedNumber", "birthDate", "gender", "guarantorName", "guarantorId", "guarantorPhone", "guarantorRelation", "emergencyContact", "emergencyName", "maritalStatus", "occupation", "monthlyIncome", "previousAddress", "previousLandlord", "previousLandlordPhone")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
      [scope.companyId, b.name, b.phone || null, b.email || null, b.nationalId || null, b.nationality || null, b.idType || "national_id", b.notes || null,
       b.tenantType || 'individual', b.crNumber || null, b.unifiedNumber || null, b.birthDate || null, b.gender || null,
       b.guarantorName || null, b.guarantorId || null, b.guarantorPhone || null, b.guarantorRelation || null,
       b.emergencyContact || null, b.emergencyName || null, b.maritalStatus || null, b.occupation || null,
       b.monthlyIncome || null, b.previousAddress || null, b.previousLandlord || null, b.previousLandlordPhone || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM tenants WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create tenant error:"); }
});

router.get("/tenants/list", async (req, res) => {
  try {
    const scope = req.scope!;
    const { search } = req.query as any;

    const tConditions = [`t."companyId" = $1`];
    const tParams: any[] = [scope.companyId];
    if (search) {
      tParams.push(`%${search}%`);
      tConditions.push(`(t.name ILIKE $${tParams.length} OR t.phone ILIKE $${tParams.length} OR t."nationalId" ILIKE $${tParams.length})`);
    }
    const standaloneRows = await rawQuery<any>(
      `SELECT
        t.id,
        t.name,
        t.phone,
        t.email,
        t."nationalId",
        t.nationality,
        COUNT(DISTINCT c.id) AS "totalContracts",
        COUNT(DISTINCT c.id) FILTER (WHERE c.status='active') AS "activeContracts",
        MAX(CASE WHEN c.status='active' THEN u."unitNumber" END) AS "currentUnit",
        COALESCE(SUM(rp."paidAmount"),0) AS "totalPaid",
        COALESCE(SUM(CASE WHEN rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE THEN rp.amount - rp."paidAmount" ELSE 0 END),0) AS "overdueAmount",
        t."createdAt"
       FROM tenants t
       LEFT JOIN rental_contracts c ON (c."tenantId"=t.id OR c."tenantName"=t.name) AND c."companyId"=$1
       LEFT JOIN property_units u ON u.id=c."unitId"
       LEFT JOIN rent_payments rp ON rp."contractId"=c.id
       WHERE ${tConditions.join(" AND ")}
       GROUP BY t.id, t.name, t.phone, t.email, t."nationalId", t.nationality, t."createdAt"
       ORDER BY t.name`,
      tParams
    );

    const conditions = [`c."companyId" = $1`];
    const cParams: any[] = [scope.companyId];
    if (search) { cParams.push(`%${search}%`); conditions.push(`(c."tenantName" ILIKE $${cParams.length} OR c."tenantPhone" ILIKE $${cParams.length} OR c."tenantIdNumber" ILIKE $${cParams.length})`); }
    const contractRows = await rawQuery<any>(
      `SELECT
        CONCAT('c-', ROW_NUMBER() OVER (ORDER BY c."tenantName")) AS id,
        c."tenantName" AS name,
        c."tenantPhone" AS phone,
        c."tenantEmail" AS email,
        c."tenantIdNumber" AS "nationalId",
        NULL AS nationality,
        COUNT(DISTINCT c.id) AS "totalContracts",
        COUNT(DISTINCT c.id) FILTER (WHERE c.status='active') AS "activeContracts",
        MAX(CASE WHEN c.status='active' THEN u."unitNumber" END) AS "currentUnit",
        COALESCE(SUM(rp."paidAmount"),0) AS "totalPaid",
        COALESCE(SUM(CASE WHEN rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE THEN rp.amount - rp."paidAmount" ELSE 0 END),0) AS "overdueAmount",
        TRUE AS "contractOnly"
       FROM rental_contracts c
       LEFT JOIN property_units u ON u.id=c."unitId"
       LEFT JOIN rent_payments rp ON rp."contractId"=c.id
       WHERE ${conditions.join(" AND ")}
         AND c."tenantName" NOT IN (SELECT name FROM tenants WHERE "companyId"=$1)
         AND (c."tenantId" IS NULL OR c."tenantId" NOT IN (SELECT id FROM tenants WHERE "companyId"=$1))
       GROUP BY c."tenantName", c."tenantPhone", c."tenantEmail", c."tenantIdNumber"
       ORDER BY c."tenantName"`,
      cParams
    );

    const allRows = [...standaloneRows, ...contractRows];
    res.json({ data: allRows, total: allRows.length });
  } catch (err) { handleRouteError(err, res, "Tenants list error:"); }
});

router.get("/tenants/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const rawId = decodeURIComponent(req.params.id);
    const numericId = !isNaN(Number(rawId)) ? Number(rawId) : null;

    let tenantRecord: any = null;
    let tenantName: string | null = null;

    if (numericId) {
      const rows = await rawQuery<any>(
        `SELECT * FROM tenants WHERE id=$1 AND "companyId"=$2`,
        [numericId, scope.companyId]
      );
      if (rows.length > 0) {
        tenantRecord = rows[0];
        tenantName = tenantRecord.name;
      }
    }

    if (!tenantRecord && !numericId) {
      tenantName = rawId;
    }

    const contracts = tenantName
      ? await rawQuery<any>(
          `SELECT c.*, u."unitNumber", u."buildingName" FROM rental_contracts c LEFT JOIN property_units u ON u.id=c."unitId" WHERE c."companyId"=$1 AND (c."tenantId"=$2 OR c."tenantName"=$3) ORDER BY c.id DESC`,
          [scope.companyId, numericId ?? null, tenantName]
        )
      : [];

    if (!tenantRecord && contracts.length === 0) {
      res.status(404).json({ error: "المستأجر غير موجود" }); return;
    }

    const contractIds = contracts.map((c: any) => c.id);
    const payments = contractIds.length > 0
      ? await rawQuery<any>(
          `SELECT rp.*, c."tenantName", u."unitNumber" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" LEFT JOIN property_units u ON u.id=c."unitId" WHERE rp."contractId" = ANY($1::int[]) ORDER BY rp."dueDate" DESC`,
          [contractIds]
        )
      : [];

    const totalPaid = payments.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.paidAmount || 0), 0);
    const overduePayments = payments.filter((p: any) => p.status !== "paid" && new Date(p.dueDate) < new Date());

    const name = tenantRecord?.name ?? contracts[0]?.tenantName ?? rawId;
    const phone = tenantRecord?.phone ?? contracts[0]?.tenantPhone;
    const email = tenantRecord?.email ?? contracts[0]?.tenantEmail;
    const nationalId = tenantRecord?.nationalId ?? contracts[0]?.tenantIdNumber;

    res.json({
      id: tenantRecord?.id ?? rawId,
      name,
      phone,
      email,
      nationalId,
      nationality: tenantRecord?.nationality,
      idType: tenantRecord?.idType,
      notes: tenantRecord?.notes,
      contracts,
      payments,
      totalPaid,
      overdueAmount: overduePayments.reduce((s: number, p: any) => s + Number(p.amount || 0) - Number(p.paidAmount || 0), 0),
    });
  } catch (err) { handleRouteError(err, res, "Tenant detail error:"); }
});

router.get("/buildings", async (req, res) => {
  try {
    const scope = req.scope!;
    const { search } = req.query as any;
    const conditions = [`b."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (search) { params.push(`%${search}%`); conditions.push(`(b.name ILIKE $${params.length} OR b.address ILIKE $${params.length} OR b.city ILIKE $${params.length})`); }

    const rows = await rawQuery<any>(
      `SELECT b.*,
        COUNT(u.id) AS "totalUnits",
        COUNT(u.id) FILTER (WHERE u.status='rented') AS "rentedUnits",
        COUNT(u.id) FILTER (WHERE u.status='available') AS "availableUnits",
        COALESCE(SUM(rp."paidAmount"),0) AS "totalRevenue"
       FROM property_buildings b
       LEFT JOIN property_units u ON (u."buildingId"=b.id OR u."buildingName"=b.name) AND u."companyId"=b."companyId"
       LEFT JOIN rental_contracts rc ON rc."unitId"=u.id AND rc."companyId"=b."companyId"
       LEFT JOIN rent_payments rp ON rp."contractId"=rc.id AND rp.status='paid'
       WHERE ${conditions.join(" AND ")} AND b."deletedAt" IS NULL
       GROUP BY b.id
       ORDER BY b.name`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Buildings list error:"); }
});

router.get("/buildings/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [building] = await rawQuery<any>(
      `SELECT b.*,
        COUNT(u.id) AS "totalUnits",
        COUNT(u.id) FILTER (WHERE u.status='rented') AS "rentedUnits",
        COUNT(u.id) FILTER (WHERE u.status='available') AS "availableUnits"
       FROM property_buildings b
       LEFT JOIN property_units u ON (u."buildingId"=b.id OR u."buildingName"=b.name) AND u."companyId"=b."companyId"
       WHERE b.id=$1 AND b."companyId"=$2
       GROUP BY b.id`,
      [id, scope.companyId]
    );
    if (!building) { res.status(404).json({ error: "المبنى غير موجود" }); return; }
    res.json(building);
  } catch (err) { handleRouteError(err, res, "Building detail error:"); }
});

router.post("/buildings", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.name) { res.status(400).json({ error: "اسم المبنى مطلوب" }); return; }
    const nationalAddress = b.nationalAddress ? (typeof b.nationalAddress === 'string' ? b.nationalAddress : JSON.stringify(b.nationalAddress)) : null;
    const { insertId } = await rawExecute(
      `INSERT INTO property_buildings ("companyId","branchId",name,address,city,type,floors,description,"deedNumber","deedDate","buildingPermitNumber","nationalAddress","latitude","longitude","totalUnits","totalArea","yearBuilt","ownerId","managerId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [scope.companyId, b.branchId || scope.branchId, b.name, b.address || null, b.city || null, b.type || "residential", b.floors || null, b.description || null,
       b.deedNumber || null, b.deedDate || null, b.buildingPermitNumber || null, nationalAddress, b.latitude || null, b.longitude || null,
       b.totalUnits || 0, b.totalArea || null, b.yearBuilt || null, b.ownerId || null, b.managerId || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM property_buildings WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create building error:"); }
});

router.patch("/buildings/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM property_buildings WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المبنى غير موجود" }); return; }
    const b = req.body;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name=$${params.length}`); }
    if (b.address !== undefined) { params.push(b.address); sets.push(`address=$${params.length}`); }
    if (b.city !== undefined) { params.push(b.city); sets.push(`city=$${params.length}`); }
    if (b.type !== undefined) { params.push(b.type); sets.push(`type=$${params.length}`); }
    if (b.floors !== undefined) { params.push(b.floors); sets.push(`floors=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.deedNumber !== undefined) { params.push(b.deedNumber); sets.push(`"deedNumber"=$${params.length}`); }
    if (b.deedDate !== undefined) { params.push(b.deedDate); sets.push(`"deedDate"=$${params.length}`); }
    if (b.buildingPermitNumber !== undefined) { params.push(b.buildingPermitNumber); sets.push(`"buildingPermitNumber"=$${params.length}`); }
    if (b.nationalAddress !== undefined) { params.push(typeof b.nationalAddress === 'string' ? b.nationalAddress : JSON.stringify(b.nationalAddress)); sets.push(`"nationalAddress"=$${params.length}`); }
    if (b.latitude !== undefined) { params.push(b.latitude); sets.push(`latitude=$${params.length}`); }
    if (b.longitude !== undefined) { params.push(b.longitude); sets.push(`longitude=$${params.length}`); }
    if (b.totalUnits !== undefined) { params.push(b.totalUnits); sets.push(`"totalUnits"=$${params.length}`); }
    if (b.totalArea !== undefined) { params.push(b.totalArea); sets.push(`"totalArea"=$${params.length}`); }
    if (b.yearBuilt !== undefined) { params.push(b.yearBuilt); sets.push(`"yearBuilt"=$${params.length}`); }
    if (b.ownerId !== undefined) { params.push(b.ownerId || null); sets.push(`"ownerId"=$${params.length}`); }
    if (b.managerId !== undefined) { params.push(b.managerId); sets.push(`"managerId"=$${params.length}`); }
    params.push(id);
    await rawExecute(`UPDATE property_buildings SET ${sets.join(",")}, "updatedAt"=NOW() WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM property_buildings WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update building error:"); }
});

router.delete("/buildings/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM property_buildings WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المبنى غير موجود" }); return; }
    await rawExecute(`UPDATE property_buildings SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف المبنى" });
  } catch (err) { handleRouteError(err, res, "Delete building error:"); }
});

router.get("/maintenance", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`mr."companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`mr.status = $${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT mr.*, u."unitNumber", u."buildingName" FROM maintenance_requests mr LEFT JOIN property_units u ON u.id=mr."unitId" WHERE ${conditions.join(" AND ")} ORDER BY mr.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Property maintenance error:"); }
});

router.post("/maintenance", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const { insertId } = await rawExecute(
      `INSERT INTO maintenance_requests ("companyId","unitId","tenantName",category,description,priority,status) VALUES ($1,$2,$3,$4,$5,$6,'open')`,
      [scope.companyId, b.unitId, b.tenantName, b.category || 'general', b.description, b.priority || 'medium']
    );
    const [row] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create property maintenance error:"); }
});

router.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [units] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='available') as available, COUNT(*) FILTER (WHERE status='rented') as rented, COUNT(*) FILTER (WHERE status='under_maintenance') as "underMaintenance" FROM property_units WHERE "companyId"=$1`, [cid]);
    const [contracts] = await rawQuery<any>(`
      SELECT
        COUNT(*) as active,
        COUNT(*) FILTER (WHERE status='active' AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days') as "expiring30",
        COUNT(*) FILTER (WHERE status='active' AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days') as "expiring60",
        COUNT(*) FILTER (WHERE status='active' AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days') as "expiring90"
      FROM rental_contracts WHERE "companyId"=$1`, [cid]);
    const [revenue] = await rawQuery<any>(`SELECT COALESCE(SUM("paidAmount"),0) as "totalCollected", COALESCE(SUM(amount),0) as "totalExpected" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" WHERE c."companyId"=$1`, [cid]);
    const [monthlyRevenue] = await rawQuery<any>(`SELECT COALESCE(SUM("paidAmount"),0) as "monthlyCollected", COALESCE(SUM(amount),0) as "monthlyExpected" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" WHERE c."companyId"=$1 AND DATE_TRUNC('month',rp."dueDate")=DATE_TRUNC('month',CURRENT_DATE)`, [cid]);
    const [annualRevenue] = await rawQuery<any>(`SELECT COALESCE(SUM("paidAmount"),0) as "annualCollected", COALESCE(SUM(amount),0) as "annualExpected" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" WHERE c."companyId"=$1 AND DATE_TRUNC('year',rp."dueDate")=DATE_TRUNC('year',CURRENT_DATE)`, [cid]);
    const [overdue] = await rawQuery<any>(`SELECT COUNT(*) as count, COALESCE(SUM(amount - "paidAmount"),0) as "overdueAmount" FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId" WHERE c."companyId"=$1 AND rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE`, [cid]);
    const [maintenance] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status NOT IN ('completed','closed')) as "openTickets", COUNT(*) FILTER (WHERE priority='critical') as "criticalTickets" FROM maintenance_requests WHERE "companyId"=$1`, [cid]);
    const buildingPerf = await rawQuery<any>(`
      SELECT b.id, b.name,
        COUNT(u.id) AS "totalUnits",
        COUNT(u.id) FILTER (WHERE u.status='rented') AS "rentedUnits",
        COALESCE(SUM(rp."paidAmount"),0) AS "totalRevenue",
        COALESCE(SUM(rp.amount),0) AS "totalExpected"
      FROM property_buildings b
      LEFT JOIN property_units u ON u."buildingId"=b.id AND u."companyId"=$1
      LEFT JOIN rental_contracts rc ON rc."unitId"=u.id AND rc."companyId"=$1
      LEFT JOIN rent_payments rp ON rp."contractId"=rc.id
      WHERE b."companyId"=$1
      GROUP BY b.id, b.name
      ORDER BY "totalRevenue" DESC
    `, [cid]);
    const occupancyRate = Number(units.total) > 0 ? Math.round((Number(units.rented) / Number(units.total)) * 100) : 0;
    const collectionRate = Number(revenue.totalExpected) > 0 ? Math.round((Number(revenue.totalCollected) / Number(revenue.totalExpected)) * 100) : 0;
    res.json({
      totalUnits: Number(units.total),
      available: Number(units.available),
      rented: Number(units.rented),
      underMaintenance: Number(units.underMaintenance || 0),
      activeContracts: Number(contracts.active),
      expiringContracts: Number(contracts.expiring30 || 0),
      expiring30: Number(contracts.expiring30 || 0),
      expiring60: Number(contracts.expiring60 || 0),
      expiring90: Number(contracts.expiring90 || 0),
      totalCollected: Number(revenue.totalCollected),
      totalExpected: Number(revenue.totalExpected),
      monthlyCollected: Number(monthlyRevenue.monthlyCollected || 0),
      monthlyExpected: Number(monthlyRevenue.monthlyExpected || 0),
      annualCollected: Number(annualRevenue.annualCollected || 0),
      annualExpected: Number(annualRevenue.annualExpected || 0),
      overduePayments: Number(overdue.count),
      overdueAmount: Number(overdue.overdueAmount),
      openMaintenanceTickets: Number(maintenance.openTickets || 0),
      criticalMaintenanceTickets: Number(maintenance.criticalTickets || 0),
      occupancyRate,
      collectionRate,
      buildingPerformance: buildingPerf.map((b: any) => ({
        ...b,
        totalUnits: Number(b.totalUnits),
        rentedUnits: Number(b.rentedUnits),
        totalRevenue: Number(b.totalRevenue),
        totalExpected: Number(b.totalExpected),
        occupancyRate: Number(b.totalUnits) > 0 ? Math.round((Number(b.rentedUnits) / Number(b.totalUnits)) * 100) : 0,
      })),
    });
  } catch (err) { handleRouteError(err, res, "Properties stats error:"); }
});

router.patch("/maintenance-requests/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    const b = req.body;
    const params: any[] = [];
    const sets: string[] = [];
    if (b.status === "completed" && existing.status !== "completed") {
      const validationErrors: string[] = [];
      const closureReport = b.closureReport || existing.closureReport;
      if (!closureReport) validationErrors.push("تقرير الإغلاق مطلوب");
      const afterPhotos = b.afterPhotos || (existing.afterPhotos ? (typeof existing.afterPhotos === "string" ? JSON.parse(existing.afterPhotos) : existing.afterPhotos) : []);
      if (!afterPhotos || afterPhotos.length === 0) validationErrors.push("صور ما بعد الصيانة مطلوبة (صورة واحدة على الأقل)");
      const actualCost = b.actualCost !== undefined ? Number(b.actualCost) : Number(existing.actualCost || 0);
      if (actualCost <= 0 && !b.zeroCostConfirmed) validationErrors.push("التكلفة الفعلية مطلوبة (أو تأكيد أن التكلفة صفر)");
      const materialsUsed = b.materialsUsed || (existing.materialsUsed ? (typeof existing.materialsUsed === "string" ? JSON.parse(existing.materialsUsed) : existing.materialsUsed) : []);
      if (!materialsUsed || !Array.isArray(materialsUsed) || materialsUsed.length === 0) validationErrors.push("قائمة المواد المستخدمة مطلوبة (مادة واحدة على الأقل)");
      if (validationErrors.length > 0) {
        res.status(400).json({ error: "بيانات الإغلاق غير مكتملة", validationErrors });
        return;
      }
    }
    for (const key of ["status","category","description","priority","assignedTo","technicianId","costResponsibility","estimatedCost","actualCost","closureReport","clientRating","clientComment"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (b.beforePhotos !== undefined) { params.push(JSON.stringify(b.beforePhotos)); sets.push(`"beforePhotos"=$${params.length}`); }
    if (b.afterPhotos !== undefined) { params.push(JSON.stringify(b.afterPhotos)); sets.push(`"afterPhotos"=$${params.length}`); }
    if (b.materialsUsed !== undefined) { params.push(JSON.stringify(b.materialsUsed)); sets.push(`"materialsUsed"=$${params.length}`); }
    if (b.status === "completed" && existing.status !== "completed") {
      const closureValidation: string[] = [];
      const finalClosureReport = b.closureReport || existing.closureReport;
      if (!finalClosureReport) closureValidation.push("تقرير الإغلاق مطلوب");
      const finalAfterPhotos = b.afterPhotos || (existing.afterPhotos ? (typeof existing.afterPhotos === "string" ? JSON.parse(existing.afterPhotos) : existing.afterPhotos) : []);
      if (!finalAfterPhotos || finalAfterPhotos.length === 0) closureValidation.push("صور ما بعد الصيانة مطلوبة (صورة واحدة على الأقل)");
      const finalCost = b.actualCost !== undefined ? Number(b.actualCost) : (existing.actualCost !== null && existing.actualCost !== undefined ? Number(existing.actualCost) : null);
      if (finalCost === null || finalCost === undefined || isNaN(finalCost)) {
        closureValidation.push("التكلفة الفعلية مطلوبة");
      } else if (finalCost < 0) {
        closureValidation.push("التكلفة الفعلية لا يمكن أن تكون سالبة");
      } else if (finalCost === 0 && !b.zeroCostConfirmed) {
        closureValidation.push("يرجى تأكيد أن التكلفة صفر");
      }
      const finalMaterials = b.materialsUsed || (existing.materialsUsed ? (typeof existing.materialsUsed === "string" ? JSON.parse(existing.materialsUsed) : existing.materialsUsed) : []);
      if (!finalMaterials || finalMaterials.length === 0) closureValidation.push("قائمة المواد المستخدمة مطلوبة");
      if (closureValidation.length > 0) {
        res.status(400).json({ error: "بيانات الإغلاق غير مكتملة", validationErrors: closureValidation });
        return;
      }
    }
    sets.push(`"updatedAt"=NOW()`);
    if (b.status === "completed" && existing.status !== "completed") {
      sets.push(`"completedAt"=NOW()`);
      if (existing.createdAt) {
        const created = new Date(existing.createdAt).getTime();
        const now = Date.now();
        const hours = Math.round((now - created) / 3600000);
        params.push(hours); sets.push(`"resolutionTime"=$${params.length}`);
      }
    }
    params.push(id);
    await rawExecute(`UPDATE maintenance_requests SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    if (b.status && b.status !== existing.status) {
      await createAuditLog({
        userId: scope.userId, entity: "maintenance_requests", entityId: id,
        action: "status_change", companyId: scope.companyId,
        before: { status: existing.status }, after: { status: b.status },
      });
    }
    if (b.status === "completed" && existing.status !== "completed") {
      const updatedCost = Number(b.actualCost ?? existing.actualCost ?? 0);
      if (updatedCost > 0) {
        try {
          const monthNum = String(new Date().getMonth() + 1).padStart(2, "0");
          const yearShort = String(new Date().getFullYear()).slice(2);
          const ref = `INV-MAINT-${yearShort}${monthNum}-${id}`;
          const vatAmount = updatedCost * 0.15;
          const { insertId: iId } = await rawExecute(
            `INSERT INTO invoices ("companyId","clientId",ref,description,subtotal,total,"vatAmount","vatRate","paidAmount",status,"dueDate","createdBy") VALUES ($1,NULL,$2,$3,$4,$5,$6,15,0,'draft',$7,$8)`,
            [scope.companyId, ref, `صيانة - ${existing.category} - ${existing.tenantName}`, updatedCost, updatedCost + vatAmount, vatAmount, new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], scope.userId]
          );
          await createAuditLog({
            userId: scope.userId, entity: "maintenance_requests", entityId: id,
            action: "auto_invoice", companyId: scope.companyId,
            before: null, after: { invoiceId: iId, ref, amount: updatedCost + vatAmount },
          });
        } catch (invErr) { console.error("PATCH completion invoice error:", invErr); }
      }
      try {
        await rawQuery<any>(
          `INSERT INTO tasks ("companyId","branchId","assignmentId","assignedTo",title,description,type,priority,status,"linkedEntityType","linkedEntityId","autoGenerated","createdAt")
           VALUES ($1,$2,$3,$3,$4,$5,'task','medium','pending','maintenance_request',$6,true,NOW()) RETURNING id`,
          [scope.companyId, scope.branchId, existing.assignedTo || scope.activeAssignmentId, `متابعة رضا المستأجر — صيانة #${id}`, `متابعة رضا ${existing.tenantName || "المستأجر"} بعد إتمام صيانة (${existing.category || ""})`, id]
        );
        await createAuditLog({
          userId: scope.userId, entity: "maintenance_requests", entityId: id,
          action: "auto_task", companyId: scope.companyId,
          before: null, after: { taskType: "tenant_satisfaction_followup", reason: "maintenance_completed" },
        });
      } catch (taskErr) { console.error("PATCH completion follow-up task error:", taskErr); }
    }
    const [row] = await rawQuery<any>(`SELECT * FROM maintenance_requests WHERE id=$1`, [id]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update maintenance request error:"); }
});

router.get("/operations-dashboard", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [unitStats] = await rawQuery<any>(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='available') as available,
        COUNT(*) FILTER (WHERE status='rented') as rented,
        COUNT(*) FILTER (WHERE status='under_maintenance') as maintenance
       FROM property_units WHERE "companyId"=$1`, [cid]
    );
    const expiringContracts = await rawQuery<any>(
      `SELECT c.id, c."tenantName", c."endDate", u."unitNumber", u."buildingName"
       FROM rental_contracts c LEFT JOIN property_units u ON u.id=c."unitId"
       WHERE c."companyId"=$1 AND c.status='active' AND c."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
       ORDER BY c."endDate"`, [cid]
    );
    const overduePayments = await rawQuery<any>(
      `SELECT rp.id, rp.amount, rp."paidAmount", rp."dueDate", c."tenantName", u."unitNumber"
       FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId"
       LEFT JOIN property_units u ON u.id=c."unitId"
       WHERE c."companyId"=$1 AND rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE
       ORDER BY rp."dueDate" LIMIT 20`, [cid]
    );
    const openMaintenance = await rawQuery<any>(
      `SELECT mr.id, mr.category, mr.description, mr.priority, mr.status, mr."createdAt", mr."slaDeadline",
        u."unitNumber", u."buildingName", mr."tenantName"
       FROM maintenance_requests mr LEFT JOIN property_units u ON u.id=mr."unitId"
       WHERE mr."companyId"=$1 AND mr.status NOT IN ('completed','closed','rejected')
       ORDER BY mr.priority DESC, mr."createdAt" LIMIT 20`, [cid]
    );
    const [collectionSummary] = await rawQuery<any>(
      `SELECT COALESCE(SUM(amount),0) as expected, COALESCE(SUM("paidAmount"),0) as collected
       FROM rent_payments rp JOIN rental_contracts c ON c.id=rp."contractId"
       WHERE c."companyId"=$1 AND rp."dueDate" >= date_trunc('month', CURRENT_DATE)
         AND rp."dueDate" < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`, [cid]
    );
    res.json({
      units: unitStats,
      expiringContracts,
      overduePayments,
      openMaintenance,
      monthlyCollection: {
        expected: Number(collectionSummary?.expected || 0),
        collected: Number(collectionSummary?.collected || 0),
      },
    });
  } catch (err) { handleRouteError(err, res, "Operations dashboard error:"); }
});

router.get("/owners", async (req, res) => {
  try {
    const scope = req.scope!;
    const { search } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (search) { params.push(`%${search}%`); conditions.push(`(name ILIKE $${params.length} OR "nationalId" ILIKE $${params.length} OR "crNumber" ILIKE $${params.length} OR phone ILIKE $${params.length})`); }
    const rows = await rawQuery<any>(
      `SELECT o.*,
        (SELECT COUNT(*) FROM property_buildings WHERE "ownerId"=o.id) AS "buildingCount",
        (SELECT COUNT(*) FROM property_units WHERE "ownerId"=o.id) AS "unitCount",
        (SELECT COUNT(*) FROM rental_contracts WHERE "ownerId"=o.id AND status='active') AS "activeContracts"
       FROM property_owners o WHERE ${conditions.join(" AND ")} AND o."deletedAt" IS NULL ORDER BY o.name`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Property owners error:"); }
});

router.get("/owners/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [owner] = await rawQuery<any>(`SELECT * FROM property_owners WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!owner) { res.status(404).json({ error: "المالك غير موجود" }); return; }
    const buildings = await rawQuery<any>(`SELECT * FROM property_buildings WHERE "ownerId"=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const units = await rawQuery<any>(`SELECT * FROM property_units WHERE "ownerId"=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const contracts = await rawQuery<any>(`SELECT c.*, u."unitNumber", u."buildingName" FROM rental_contracts c LEFT JOIN property_units u ON u.id=c."unitId" WHERE c."ownerId"=$1 AND c."companyId"=$2 ORDER BY c.id DESC`, [id, scope.companyId]);
    res.json({ ...owner, buildings, units, contracts });
  } catch (err) { handleRouteError(err, res, "Owner detail error:"); }
});

router.post("/owners", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    if (!b.name) { res.status(400).json({ error: "اسم المالك مطلوب" }); return; }
    const { insertId } = await rawExecute(
      `INSERT INTO property_owners ("companyId","ownerType",name,"nationalId","crNumber",phone,email,iban,"bankName",address,city,"authorizationNumber","authorizationDate","authorizationExpiry",notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [scope.companyId, b.ownerType || 'individual', b.name, b.nationalId || null, b.crNumber || null, b.phone || null, b.email || null, b.iban || null, b.bankName || null, b.address || null, b.city || null, b.authorizationNumber || null, b.authorizationDate || null, b.authorizationExpiry || null, b.notes || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM property_owners WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create owner error:"); }
});

router.patch("/owners/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM property_owners WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المالك غير موجود" }); return; }
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("ownerType", b.ownerType);
    addField("name", b.name);
    addField("nationalId", b.nationalId);
    addField("crNumber", b.crNumber);
    addField("phone", b.phone);
    addField("email", b.email);
    addField("iban", b.iban);
    addField("bankName", b.bankName);
    addField("address", b.address);
    addField("city", b.city);
    addField("authorizationNumber", b.authorizationNumber);
    addField("authorizationDate", b.authorizationDate);
    addField("authorizationExpiry", b.authorizationExpiry);
    addField("notes", b.notes);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE property_owners SET ${fields.join(", ")}, "updatedAt"=NOW() WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update owner error:"); }
});

router.delete("/owners/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM property_owners WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المالك غير موجود" }); return; }
    await rawExecute(`UPDATE property_owners SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف المالك" });
  } catch (err) { handleRouteError(err, res, "Delete owner error:"); }
});

router.get("/contracts/:id/schedule", async (req, res) => {
  try {
    const scope = req.scope!;
    const contractId = Number(req.params.id);
    const [contract] = await rawQuery<any>(`SELECT id FROM rental_contracts WHERE id=$1 AND "companyId"=$2`, [contractId, scope.companyId]);
    if (!contract) { res.status(404).json({ error: "العقد غير موجود" }); return; }
    const schedule = await rawQuery<any>(
      `SELECT * FROM contract_payment_schedule WHERE "contractId"=$1 ORDER BY "installmentNumber"`,
      [contractId]
    );
    res.json({ data: schedule, total: schedule.length });
  } catch (err) { handleRouteError(err, res, "Payment schedule error:"); }
});

router.post("/contracts/:id/schedule/:installmentId/pay", async (req, res) => {
  try {
    const scope = req.scope!;
    const contractId = Number(req.params.id);
    const installmentId = Number(req.params.installmentId);
    const b = req.body;
    const paidAmount = Number(b.paidAmount ?? b.amount);
    const [existing] = await rawQuery<any>(
      `SELECT cps.*, rc."tenantName", u."unitNumber", u."buildingName" FROM contract_payment_schedule cps JOIN rental_contracts rc ON rc.id=cps."contractId" LEFT JOIN property_units u ON u.id=rc."unitId" WHERE cps.id=$1 AND cps."contractId"=$2 AND cps."companyId"=$3`,
      [installmentId, contractId, scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "القسط غير موجود" }); return; }
    const newPaid = Number(existing.paidAmount || 0) + paidAmount;
    const newStatus = newPaid >= Number(existing.amount) ? 'paid' : 'partial';
    const receiptNumber = b.receiptNumber || `RCP-${Date.now().toString(36).toUpperCase()}`;
    await rawExecute(
      `UPDATE contract_payment_schedule SET "paidAmount"=$1, "paidDate"=$2, method=$3, status=$4, "receiptNumber"=$5, "updatedAt"=NOW() WHERE id=$6`,
      [newPaid, b.paidDate || new Date().toISOString().split('T')[0], b.method || 'bank_transfer', newStatus, receiptNumber, installmentId]
    );
    if (paidAmount > 0) {
      try {
        const cashAccountCode = b.method === 'cash' ? '1100' : '1110';
        await createJournalEntry({
          companyId: scope.companyId,
          branchId: scope.branchId,
          createdBy: scope.activeAssignmentId ?? scope.userId,
          ref: `RENT-SCH-${installmentId}`,
          description: `تحصيل قسط إيجار #${existing.installmentNumber} / ${existing.tenantName || ''} / ${existing.unitNumber || ''}`,
          lines: [
            { accountCode: cashAccountCode, debit: paidAmount, credit: 0 },
            { accountCode: "4100", debit: 0, credit: paidAmount },
          ],
        });
      } catch (jErr) { console.error("Schedule payment journal entry failed:", jErr); }
    }
    const [row] = await rawQuery<any>(`SELECT * FROM contract_payment_schedule WHERE id=$1`, [installmentId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Pay installment error:"); }
});

export default router;
