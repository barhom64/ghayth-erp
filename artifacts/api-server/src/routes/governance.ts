import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { logger } from "../lib/logger.js";

const createPolicySchema = z.object({
  title: z.string().min(1, "عنوان السياسة مطلوب"),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  effectiveDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  modules: z.array(z.string()).optional().nullable(),
});

const createRiskSchema = z.object({
  title: z.string().min(1, "عنوان المخاطرة مطلوب"),
  description: z.string().optional().nullable(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional().nullable(),
  likelihood: z.string().optional().nullable(),
  impact: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  mitigationPlan: z.string().optional().nullable(),
  assignedTo: z.coerce.number().optional().nullable(),
});

const updatePolicySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  status: z.string().optional(),
  effectiveDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
  modules: z.array(z.string()).optional().nullable(),
});

const newPolicyVersionSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  effectiveDate: z.string().optional().nullable(),
  expiryDate: z.string().optional().nullable(),
});

const updateRiskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  severity: z.string().optional(),
  likelihood: z.string().optional().nullable(),
  impact: z.string().optional().nullable(),
  status: z.string().optional(),
  mitigationPlan: z.string().optional().nullable(),
});

const createAuditSchema = z.object({
  title: z.string().min(1, "عنوان المراجعة مطلوب"),
  scope: z.string().optional().nullable(),
  status: z.string().optional(),
  auditorName: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  findings: z.string().optional().nullable(),
});

const updateAuditSchema = z.object({
  title: z.string().optional(),
  scope: z.string().optional().nullable(),
  status: z.string().optional(),
  auditorName: z.string().optional().nullable(),
  findings: z.string().optional().nullable(),
});

const createComplianceSchema = z.object({
  regulation: z.string().min(1, "اسم اللائحة مطلوب"),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  responsiblePerson: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const updateComplianceSchema = z.object({
  regulation: z.string().optional(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  responsiblePerson: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const createCapaSchema = z.object({
  auditId: z.coerce.number().optional().nullable(),
  finding: z.string().min(1, "الملاحظة مطلوبة"),
  rootCause: z.string().optional().nullable(),
  correctiveAction: z.string().optional().nullable(),
  preventiveAction: z.string().optional().nullable(),
  status: z.enum(["open", "in_progress", "closed", "overdue"]).optional(),
  responsiblePerson: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

const updateCapaSchema = z.object({
  finding: z.string().optional(),
  rootCause: z.string().optional().nullable(),
  correctiveAction: z.string().optional().nullable(),
  preventiveAction: z.string().optional().nullable(),
  status: z.enum(["open", "in_progress", "closed", "overdue"]).optional(),
  responsiblePerson: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
});

const createComplianceActionSchema = z.object({
  title: z.string().min(1, "عنوان الإجراء مطلوب"),
  regulation: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  owner: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(["open", "in_progress", "done", "overdue"]).optional().nullable(),
});

const updateComplianceActionSchema = z.object({
  title: z.string().optional(),
  regulation: z.string().optional().nullable(),
  owner: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(["open", "in_progress", "done", "overdue"]).optional(),
  description: z.string().optional().nullable(),
});

const createPolicyComplianceActionSchema = z.object({
  action: z.string().optional(),
  title: z.string().optional(),
  status: z.enum(["open", "in_progress", "done", "overdue"]).optional().nullable(),
  responsiblePerson: z.string().optional().nullable(),
  owner: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const updatePolicyComplianceActionSchema = z.object({
  status: z.enum(["open", "in_progress", "done", "overdue"]).optional(),
  action: z.string().optional(),
  title: z.string().optional(),
  responsiblePerson: z.string().optional().nullable(),
  owner: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});

const updateRiskTreatmentSchema = z.object({
  treatmentPlan: z.string().optional().nullable(),
  treatmentOwner: z.string().optional().nullable(),
  treatmentDueDate: z.string().optional().nullable(),
  treatmentStatus: z.string().optional().nullable(),
});

const router = Router();

router.get("/policies", authorize({ feature: "governance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, module: mod } = req.query as any;
    const conditions = [`("companyId"=$1 OR "companyId" IS NULL)`, `"deletedAt" IS NULL`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`status=$${params.length}`); }
    if (mod) {
      params.push(mod);
      conditions.push(`id IN (SELECT "policyId" FROM policy_module_links WHERE module=$${params.length})`);
    }
    const rows = await rawQuery(
      `SELECT * FROM governance_policies WHERE ${conditions.join(" AND ")} ORDER BY "createdAt" DESC LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/policies", authorize({ feature: "governance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, description, category, status, effectiveDate, expiryDate, modules } = zodParse(createPolicySchema.safeParse(req.body));
    const { insertId, row } = await withTransaction(async (client) => {
      const insertRes = await client.query(
        `INSERT INTO governance_policies (title, description, category, status, "effectiveDate", "expiryDate", version, "companyId")
         VALUES ($1,$2,$3,$4,$5,$6,1,$7) RETURNING id`,
        [title, description, category, status || "draft", effectiveDate || null, expiryDate || null, scope.companyId]
      );
      const insertId = insertRes.rows[0]?.id;
      if (modules && Array.isArray(modules) && modules.length > 0) {
        for (const mod of modules) {
          await client.query(
            `INSERT INTO policy_module_links ("policyId", module, "companyId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [insertId, mod, scope.companyId]
          );
        }
      }
      const selectRes = await client.query(`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
      return { insertId, row: selectRes.rows[0] };
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "governance_policies", entityId: insertId, after: { title, category } }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.policy.created",
      entity: "governance_policies",
      entityId: insertId,
      details: JSON.stringify({ title, category }),
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/policies/:id", authorize({ feature: "governance", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT * FROM governance_policies WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("السياسة غير موجودة");
    const links = await rawQuery<any>(
      `SELECT module FROM policy_module_links WHERE "policyId"=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [row.id, scope.companyId]
    );
    row.modules = links.map((l: any) => l.module);
    const versions = await rawQuery<any>(
      `SELECT id, version, title, status, "createdAt" FROM governance_policies WHERE ("parentId"=$1 OR id=$1) AND "deletedAt" IS NULL ORDER BY version DESC`,
      [row.id]
    );
    row.versions = versions;
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/policies/:id", authorize({ feature: "governance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updatePolicySchema.safeParse(req.body));
    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.category !== undefined) { params.push(b.category); sets.push(`category=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.effectiveDate !== undefined) { params.push(b.effectiveDate || null); sets.push(`"effectiveDate"=$${params.length}`); }
    if (b.expiryDate !== undefined) { params.push(b.expiryDate || null); sets.push(`"expiryDate"=$${params.length}`); }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(id); params.push(scope.companyId);
    const row = await withTransaction(async (client) => {
      const updateRes = await client.query(
        `UPDATE governance_policies SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`,
        params
      );
      if ((updateRes.rowCount ?? 0) === 0) throw new NotFoundError("السياسة غير موجودة");

      if (b.modules && Array.isArray(b.modules)) {
        await client.query(`DELETE FROM policy_module_links WHERE "policyId"=$1 AND "companyId"=$2`, [id, scope.companyId]);
        for (const mod of b.modules) {
          await client.query(
            `INSERT INTO policy_module_links ("policyId", module, "companyId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [id, mod, scope.companyId]
          );
        }
      }

      const selectRes = await client.query(`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
      return selectRes.rows[0];
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_policies", entityId: id }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.policy.updated",
      entity: "governance_policies",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/policies/:id/new-version", authorize({ feature: "governance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parentId = parseId(req.params.id, "id");
    const [parent] = await rawQuery<any>(
      `SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [parentId, scope.companyId]
    );
    if (!parent) throw new NotFoundError("السياسة غير موجودة");

    const [maxVersion] = await rawQuery<any>(
      `SELECT COALESCE(MAX(version), 0) + 1 as next FROM governance_policies WHERE ("parentId"=$1 OR id=$1) AND "deletedAt" IS NULL`,
      [parentId]
    );
    const nextVersion = Number(maxVersion?.next || parent.version + 1);

    const b = zodParse(newPolicyVersionSchema.safeParse(req.body));
    const existingLinks = await rawQuery<any>(`SELECT module FROM policy_module_links WHERE "policyId"=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [parentId, scope.companyId]);

    let insertId!: number;
    await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO governance_policies (title, description, category, status, "effectiveDate", "expiryDate", version, "parentId", "companyId")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [
          b.title || parent.title,
          b.description || parent.description,
          b.category || parent.category,
          "draft",
          b.effectiveDate || null,
          b.expiryDate || null,
          nextVersion,
          parentId,
          scope.companyId,
        ]
      );
      insertId = ins.rows[0].id;

      await client.query(
        `UPDATE governance_policies SET status='archived', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND status IN ('draft','active') AND "deletedAt" IS NULL`,
        [parentId, scope.companyId]
      );

      for (const link of existingLinks) {
        await client.query(
          `INSERT INTO policy_module_links ("policyId", module, "companyId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [insertId, link.module, scope.companyId]
        );
      }
    });

    const [row] = await rawQuery<any>(`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "governance_policies", entityId: insertId, after: { version: nextVersion, parentId } }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.policy.new_version",
      entity: "governance_policies",
      entityId: insertId,
      details: JSON.stringify({ version: nextVersion, parentId }),
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.status(201).json(row);
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "governance");
  }
});

router.get("/policies/:id/module-links", authorize({ feature: "governance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const policyId = parseId(req.params.id, "id");
    const [policy] = await rawQuery<any>(
      `SELECT id FROM governance_policies WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [policyId, scope.companyId]
    );
    if (!policy) throw new NotFoundError("السياسة غير موجودة");
    const rows = await rawQuery(
      `SELECT * FROM policy_module_links WHERE "policyId"=$1 LIMIT 500`,
      [policyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/module-policies/:module", authorize({ feature: "governance", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const mod = req.params.module;
    const rows = await rawQuery(
      `SELECT gp.* FROM governance_policies gp
       JOIN policy_module_links pml ON pml."policyId" = gp.id
       WHERE pml.module = $1 AND (gp."companyId" = $2 OR gp."companyId" IS NULL)
         AND gp."deletedAt" IS NULL
         AND gp.status = 'active'
         AND (gp."effectiveDate" IS NULL OR gp."effectiveDate" <= CURRENT_DATE)
         AND (gp."expiryDate" IS NULL OR gp."expiryDate" >= CURRENT_DATE)
       ORDER BY gp."createdAt" DESC LIMIT 500`,
      [mod, scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.delete("/policies/:id", authorize({ feature: "governance", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [before] = await rawQuery<any>(`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    const result = await rawExecute(`UPDATE governance_policies SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (result.affectedRows === 0) throw new NotFoundError("السياسة غير موجودة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "governance_policies", entityId: id, before }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.policy.deleted",
      entity: "governance_policies",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json({ message: "تم حذف السياسة بنجاح" });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/risks", authorize({ feature: "governance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM governance_risks WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/risks", authorize({ feature: "governance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, description, severity, likelihood, impact, status, mitigationPlan, assignedTo } = zodParse(createRiskSchema.safeParse(req.body));
    const r = await rawExecute(
      `INSERT INTO governance_risks (title, description, severity, likelihood, impact, status, "mitigationPlan", "assignedTo", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [String(title).trim(), description ?? null, severity ?? "medium", likelihood ?? null, impact ?? null, status || "open", mitigationPlan ?? null, assignedTo ?? null, scope.companyId]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "governance_risks", entityId: r.insertId,
      after: { title, severity: severity ?? "medium", status: status || "open" },
    }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.risk.created",
      entity: "governance_risks",
      entityId: r.insertId,
      details: JSON.stringify({ title, severity: severity ?? "medium" }),
    }).catch((e) => logger.error(e, "governance background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, title, severity: severity ?? "medium", status: status || "open" });
  } catch (err) { handleRouteError(err, res, "Create risk error:"); }
});

router.get("/risks/:id", authorize({ feature: "governance", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("المخاطرة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/risks/:id", authorize({ feature: "governance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateRiskSchema.safeParse(req.body));
    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.severity !== undefined) { params.push(b.severity); sets.push(`severity=$${params.length}`); }
    if (b.likelihood !== undefined) { params.push(b.likelihood); sets.push(`likelihood=$${params.length}`); }
    if (b.impact !== undefined) { params.push(b.impact); sets.push(`impact=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.mitigationPlan !== undefined) { params.push(b.mitigationPlan); sets.push(`"mitigationPlan"=$${params.length}`); }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE governance_risks SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (result.affectedRows === 0) throw new NotFoundError("المخاطرة غير موجودة");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_risks", entityId: id }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.risk.updated",
      entity: "governance_risks",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.delete("/risks/:id", authorize({ feature: "governance", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [before] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    const result = await rawExecute(`UPDATE governance_risks SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (result.affectedRows === 0) throw new NotFoundError("المخاطرة غير موجودة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "governance_risks", entityId: id, before }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.risk.deleted",
      entity: "governance_risks",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json({ message: "تم حذف المخاطرة بنجاح" });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/audits", authorize({ feature: "governance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM governance_audits WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/audits", authorize({ feature: "governance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, scope: auditScope, status, auditorName, startDate, endDate, findings } = zodParse(createAuditSchema.safeParse(req.body)) as any;
    const r = await rawExecute(
      `INSERT INTO governance_audits (title, scope, status, "auditorName", "startDate", "endDate", findings, "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [title, auditScope, status || "planned", auditorName, startDate, endDate, findings, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "governance_audits", entityId: r.insertId, after: { title } }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.audit.created",
      entity: "governance_audits",
      entityId: r.insertId,
      details: JSON.stringify({ title }),
    }).catch((e) => logger.error(e, "governance background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM governance_audits WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/audits/:id", authorize({ feature: "governance", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_audits WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("المراجعة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/audits/:id", authorize({ feature: "governance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateAuditSchema.safeParse(req.body));
    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.scope !== undefined) { params.push(b.scope); sets.push(`scope=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.auditorName !== undefined) { params.push(b.auditorName); sets.push(`"auditorName"=$${params.length}`); }
    if (b.findings !== undefined) { params.push(b.findings); sets.push(`findings=$${params.length}`); }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE governance_audits SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (result.affectedRows === 0) throw new NotFoundError("المراجعة غير موجودة");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_audits WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_audits", entityId: id }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.audit.updated",
      entity: "governance_audits",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.delete("/audits/:id", authorize({ feature: "governance", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [before] = await rawQuery<any>(`SELECT * FROM governance_audits WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    const result = await rawExecute(`UPDATE governance_audits SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (result.affectedRows === 0) throw new NotFoundError("المراجعة غير موجودة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "governance_audits", entityId: id, before }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.audit.deleted",
      entity: "governance_audits",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json({ message: "تم حذف المراجعة بنجاح" });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/compliance", authorize({ feature: "governance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM governance_compliance WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/compliance", authorize({ feature: "governance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { regulation, description, status, dueDate, responsiblePerson, notes } = zodParse(createComplianceSchema.safeParse(req.body));
    const r = await rawExecute(
      `INSERT INTO governance_compliance (regulation, description, status, "dueDate", "responsiblePerson", notes, "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [regulation, description, status || "compliant", dueDate, responsiblePerson, notes, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "governance_compliance", entityId: r.insertId, after: { regulation } }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance.created",
      entity: "governance_compliance",
      entityId: r.insertId,
      details: JSON.stringify({ regulation }),
    }).catch((e) => logger.error(e, "governance background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM governance_compliance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/compliance/:id", authorize({ feature: "governance", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_compliance WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("بند الامتثال غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/compliance/:id", authorize({ feature: "governance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateComplianceSchema.safeParse(req.body));
    const sets: string[] = [];
    const params: any[] = [];
    if (b.regulation !== undefined) { params.push(b.regulation); sets.push(`regulation=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.dueDate !== undefined) { params.push(b.dueDate); sets.push(`"dueDate"=$${params.length}`); }
    if (b.responsiblePerson !== undefined) { params.push(b.responsiblePerson); sets.push(`"responsiblePerson"=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE governance_compliance SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (result.affectedRows === 0) throw new NotFoundError("بند الامتثال غير موجود");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_compliance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_compliance", entityId: id }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance.updated",
      entity: "governance_compliance",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.delete("/compliance/:id", authorize({ feature: "governance", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [before] = await rawQuery<any>(`SELECT * FROM governance_compliance WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    const result = await rawExecute(`UPDATE governance_compliance SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (result.affectedRows === 0) throw new NotFoundError("بند الامتثال غير موجود");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "governance_compliance", entityId: id, before }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance.deleted",
      entity: "governance_compliance",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json({ message: "تم حذف بند الامتثال بنجاح" });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/stats", authorize({ feature: "governance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [[policies], [risks], [audits], [compliance], [complianceActions], [risksNoTreatment], [openCapas]] = await Promise.all([
      rawQuery(`SELECT COUNT(*) as count FROM governance_policies WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM governance_risks WHERE status='open' AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM governance_audits WHERE status IN ('planned','in_progress') AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM governance_compliance WHERE status='non_compliant' AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]),
      rawQuery<any>(`SELECT COUNT(*) FILTER (WHERE status='done') AS implemented, COUNT(*) AS total FROM policy_compliance_actions WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]).catch((e) => { logger.error(e, "governance query failed"); return [{ implemented: 0, total: 0 }]; }),
      rawQuery<any>(`SELECT COUNT(*) AS count FROM governance_risks WHERE status='open' AND "treatmentPlan" IS NULL AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]).catch((e) => { logger.error(e, "governance query failed"); return [{ count: 0 }]; }),
      rawQuery<any>(`SELECT COUNT(*) AS count FROM governance_capa WHERE status IN ('open','in_progress') AND "companyId"=$1`, [cid]).catch((e) => { logger.error(e, "governance query failed"); return [{ count: 0 }]; }),
    ]);
    const implementedPct = Number(complianceActions?.total) > 0 ? Math.round(Number(complianceActions?.implemented) / Number(complianceActions?.total) * 100) : 100;
    res.json({
      totalPolicies: Number(policies.count),
      openRisks: Number(risks.count),
      activeAudits: Number(audits.count),
      nonCompliant: Number(compliance.count),
      complianceRate: implementedPct,
      complianceActionsTotal: Number(complianceActions?.total || 0),
      complianceActionsImplemented: Number(complianceActions?.implemented || 0),
      complianceActions: Number(complianceActions?.total || 0),
      openCapas: Number(openCapas?.count || 0),
      risksNoTreatment: Number(risksNoTreatment?.count || 0),
    });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/compliance-dashboard", authorize({ feature: "governance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [[actions], [risks], [policiesNoActions], capas] = await Promise.all([
      rawQuery<any>(`SELECT COUNT(*) FILTER (WHERE status='done') AS implemented, COUNT(*) FILTER (WHERE status IN ('open','in_progress')) AS "notImplemented", COUNT(*) AS total FROM policy_compliance_actions WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]).catch((e) => { logger.error(e, "governance query failed"); return [{ implemented: 0, notImplemented: 0, total: 0 }]; }),
      rawQuery<any>(`SELECT COUNT(*) FILTER (WHERE status='open' AND "treatmentPlan" IS NOT NULL) AS "withTreatment", COUNT(*) FILTER (WHERE status='open' AND "treatmentPlan" IS NULL) AS "withoutTreatment", COUNT(*) FILTER (WHERE status='open') AS open FROM governance_risks WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]).catch((e) => { logger.error(e, "governance query failed"); return [{ withTreatment: 0, withoutTreatment: 0, open: 0 }]; }),
      rawQuery<any>(
        `SELECT COUNT(*) AS count FROM governance_policies gp WHERE ("companyId"=$1 OR "companyId" IS NULL) AND status='active' AND gp."deletedAt" IS NULL AND NOT EXISTS (SELECT 1 FROM policy_compliance_actions pca WHERE pca."policyId"=gp.id AND pca."companyId"=$1 AND pca."deletedAt" IS NULL)`,
        [cid]
      ).catch((e) => { logger.error(e, "governance query failed"); return [{ count: 0 }]; }),
      rawQuery<any>(`SELECT * FROM governance_capa WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 20`, [cid]).catch((e) => { logger.error(e, "governance query failed"); return []; }),
    ]);
    const rate = Number(actions?.total) > 0 ? Math.round(Number(actions?.implemented) / Number(actions?.total) * 100) : 100;
    res.json({
      complianceRate: rate,
      actionsTotal: Number(actions?.total || 0),
      actionsImplemented: Number(actions?.implemented || 0),
      actionsNotImplemented: Number(actions?.notImplemented || 0),
      risksOpen: Number(risks?.open || 0),
      risksWithTreatment: Number(risks?.withTreatment || 0),
      risksWithoutTreatment: Number(risks?.withoutTreatment || 0),
      policiesNoActions: Number(policiesNoActions?.count || 0),
      recentCapas: capas,
    });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/compliance-actions", authorize({ feature: "governance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "dueDate" ASC NULLS LAST, "createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/compliance-actions", authorize({ feature: "governance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createComplianceActionSchema.safeParse(req.body ?? {}));
    const r = await rawExecute(
      `INSERT INTO policy_compliance_actions ("companyId",title,regulation,description,owner,"dueDate",status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [scope.companyId, b.title, b.regulation || null, b.description || null, b.owner || null, b.dueDate || null, b.status || 'open']
    );
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [r.insertId, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "policy_compliance_actions", entityId: r.insertId, after: { title: b.title } }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance_action.created",
      entity: "policy_compliance_actions",
      entityId: r.insertId,
      details: JSON.stringify({ title: b.title }),
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/compliance-actions/:actionId", authorize({ feature: "governance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.actionId, "actionId");
    const b = zodParse(updateComplianceActionSchema.safeParse(req.body ?? {}));
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.regulation !== undefined) { params.push(b.regulation); sets.push(`regulation=$${params.length}`); }
    if (b.owner !== undefined) { params.push(b.owner); sets.push(`owner=$${params.length}`); }
    if (b.dueDate !== undefined) { params.push(b.dueDate); sets.push(`"dueDate"=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if ((b as any).description !== undefined) { params.push((b as any).description); sets.push(`description=$${params.length}`); }
    params.push(id); params.push(scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE policy_compliance_actions SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (!affectedRows) throw new NotFoundError("الإجراء غير موجود");
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "policy_compliance_actions", entityId: id }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance_action.updated",
      entity: "policy_compliance_actions",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.delete("/compliance-actions/:actionId", authorize({ feature: "governance", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.actionId, "actionId");
    const [before] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!before) throw new NotFoundError("الإجراء غير موجود");
    const { affectedRows } = await rawExecute(`UPDATE policy_compliance_actions SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("السجل غير موجود");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "policy_compliance_actions", entityId: id, before }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance_action.deleted",
      entity: "policy_compliance_actions",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/policies/:id/compliance-actions", authorize({ feature: "governance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const policyId = parseId(req.params.id, "id");
    const rows = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE "policyId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL ORDER BY "createdAt" LIMIT 500`, [policyId, scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/policies/:id/compliance-actions", authorize({ feature: "governance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const policyId = parseId(req.params.id, "id");
    const b = zodParse(createPolicyComplianceActionSchema.safeParse(req.body ?? {}));
    const r = await rawExecute(
      `INSERT INTO policy_compliance_actions ("policyId","companyId",title,status,owner,"dueDate",description) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [policyId, scope.companyId, b.action || b.title, b.status || 'open', b.responsiblePerson || b.owner || null, b.dueDate || null, b.notes || b.description || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [r.insertId, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "policy_compliance_actions", entityId: r.insertId, after: { policyId, action: b.action } }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance_action.created",
      entity: "policy_compliance_actions",
      entityId: r.insertId,
      details: JSON.stringify({ policyId, action: b.action }),
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});


router.patch("/risks/:id/treatment", authorize({ feature: "governance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateRiskTreatmentSchema.safeParse(req.body ?? {}));
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.treatmentPlan !== undefined) { params.push(b.treatmentPlan); sets.push(`"treatmentPlan"=$${params.length}`); }
    if (b.treatmentOwner !== undefined) { params.push(b.treatmentOwner); sets.push(`"treatmentOwner"=$${params.length}`); }
    if (b.treatmentDueDate !== undefined) { params.push(b.treatmentDueDate); sets.push(`"treatmentDueDate"=$${params.length}`); }
    if (b.treatmentStatus !== undefined) { params.push(b.treatmentStatus); sets.push(`"treatmentStatus"=$${params.length}`); }
    params.push(id); params.push(scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE governance_risks SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (!affectedRows) throw new NotFoundError("المخاطرة غير موجودة");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_risks", entityId: id, after: { treatmentPlan: b.treatmentPlan } }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.risk.treatment_updated",
      entity: "governance_risks",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/capa", authorize({ feature: "governance", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM governance_capa WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/capa", authorize({ feature: "governance", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createCapaSchema.safeParse(req.body));
    const r = await rawExecute(
      `INSERT INTO governance_capa ("companyId","auditId",finding,"rootCause","correctiveAction","preventiveAction",status,"responsiblePerson","dueDate","completedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, b.auditId || null, b.finding, b.rootCause || null, b.correctiveAction || null, b.preventiveAction || null, b.status || 'open', b.responsiblePerson || null, b.dueDate || null, null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM governance_capa WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "governance_capa", entityId: r.insertId, after: { finding: b.finding } }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.capa.created",
      entity: "governance_capa",
      entityId: r.insertId,
      details: JSON.stringify({ finding: b.finding }),
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/capa/:id", authorize({ feature: "governance", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateCapaSchema.safeParse(req.body));
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.finding !== undefined) { params.push(b.finding); sets.push(`finding=$${params.length}`); }
    if (b.rootCause !== undefined) { params.push(b.rootCause); sets.push(`"rootCause"=$${params.length}`); }
    if (b.correctiveAction !== undefined) { params.push(b.correctiveAction); sets.push(`"correctiveAction"=$${params.length}`); }
    if (b.preventiveAction !== undefined) { params.push(b.preventiveAction); sets.push(`"preventiveAction"=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); if (b.status === 'closed') sets.push(`"completedAt"=NOW()`); }
    if (b.responsiblePerson !== undefined) { params.push(b.responsiblePerson); sets.push(`"responsiblePerson"=$${params.length}`); }
    if (b.dueDate !== undefined) { params.push(b.dueDate); sets.push(`"dueDate"=$${params.length}`); }
    params.push(id); params.push(scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE governance_capa SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (!affectedRows) throw new NotFoundError("الإجراء التصحيحي غير موجود");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_capa WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_capa", entityId: id }).catch((e) => logger.error(e, "governance background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.capa.updated",
      entity: "governance_capa",
      entityId: id,
    }).catch((e) => logger.error(e, "governance background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

export default router;
