import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError, ValidationError, NotFoundError, ForbiddenError } from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";

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

const router = Router();
router.use(authMiddleware);

router.get("/policies", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, module: mod } = req.query as any;
    const conditions = [`("companyId"=$1 OR "companyId" IS NULL)`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`status=$${params.length}`); }
    if (mod) {
      params.push(mod);
      conditions.push(`id IN (SELECT "policyId" FROM policy_module_links WHERE module=$${params.length})`);
    }
    const rows = await rawQuery(
      `SELECT * FROM governance_policies WHERE ${conditions.join(" AND ")} ORDER BY "createdAt" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/policies", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { title, description, category, status, effectiveDate, expiryDate, modules } = parsed.data;
    const r = await rawExecute(
      `INSERT INTO governance_policies (title, description, category, status, "effectiveDate", "expiryDate", version, "companyId")
       VALUES ($1,$2,$3,$4,$5,$6,1,$7)`,
      [title, description, category, status || "draft", effectiveDate || null, expiryDate || null, scope.companyId]
    );
    if (modules && Array.isArray(modules) && modules.length > 0) {
      for (const mod of modules) {
        await rawExecute(
          `INSERT INTO policy_module_links ("policyId", module, "companyId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [r.insertId, mod, scope.companyId]
        );
      }
    }
    const [row] = await rawQuery<any>(`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "governance_policies", entityId: r.insertId, after: { title, category } }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.policy.created",
      entity: "governance_policies",
      entityId: r.insertId,
      details: JSON.stringify({ title, category }),
    }).catch(console.error);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/policies/:id", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(
      `SELECT * FROM governance_policies WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [Number(req.params.id), scope.companyId]
    );
    if (!row) throw new NotFoundError("السياسة غير موجودة");
    const links = await rawQuery<any>(
      `SELECT module FROM policy_module_links WHERE "policyId"=$1`,
      [row.id]
    );
    row.modules = links.map((l: any) => l.module);
    const versions = await rawQuery<any>(
      `SELECT id, version, title, status, "createdAt" FROM governance_policies WHERE "parentId"=$1 OR id=$1 ORDER BY version DESC`,
      [row.id]
    );
    row.versions = versions;
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/policies/:id", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
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
    const result = await rawExecute(
      `UPDATE governance_policies SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`,
      params
    );
    if (result.affectedRows === 0) throw new NotFoundError("السياسة غير موجودة");

    if (b.modules && Array.isArray(b.modules)) {
      await rawExecute(`DELETE FROM policy_module_links WHERE "policyId"=$1`, [id]);
      for (const mod of b.modules) {
        await rawExecute(
          `INSERT INTO policy_module_links ("policyId", module, "companyId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [id, mod, scope.companyId]
        );
      }
    }

    const [row] = await rawQuery<any>(`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_policies", entityId: id }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.policy.updated",
      entity: "governance_policies",
      entityId: id,
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/policies/:id/new-version", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parentId = Number(req.params.id);
    const [parent] = await rawQuery<any>(
      `SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2`,
      [parentId, scope.companyId]
    );
    if (!parent) throw new NotFoundError("السياسة غير موجودة");

    const [maxVersion] = await rawQuery<any>(
      `SELECT COALESCE(MAX(version), 0) + 1 as next FROM governance_policies WHERE "parentId"=$1 OR id=$1`,
      [parentId]
    );
    const nextVersion = Number(maxVersion?.next || parent.version + 1);

    const b = req.body;
    const r = await rawExecute(
      `INSERT INTO governance_policies (title, description, category, status, "effectiveDate", "expiryDate", version, "parentId", "companyId")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
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

    await rawExecute(
      `UPDATE governance_policies SET status='archived' WHERE id=$1`,
      [parentId]
    );

    const links = await rawQuery<any>(`SELECT module FROM policy_module_links WHERE "policyId"=$1`, [parentId]);
    for (const link of links) {
      await rawExecute(
        `INSERT INTO policy_module_links ("policyId", module, "companyId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [r.insertId, link.module, scope.companyId]
      );
    }

    const [row] = await rawQuery<any>(`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "governance_policies", entityId: r.insertId, after: { version: nextVersion, parentId } }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.policy.new_version",
      entity: "governance_policies",
      entityId: r.insertId,
      details: JSON.stringify({ version: nextVersion, parentId }),
    }).catch(console.error);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/policies/:id/module-links", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const policyId = Number(req.params.id);
    const [policy] = await rawQuery<any>(
      `SELECT id FROM governance_policies WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [policyId, scope.companyId]
    );
    if (!policy) throw new NotFoundError("السياسة غير موجودة");
    const rows = await rawQuery(
      `SELECT * FROM policy_module_links WHERE "policyId"=$1`,
      [policyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/module-policies/:module", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const mod = req.params.module;
    const rows = await rawQuery(
      `SELECT gp.* FROM governance_policies gp
       JOIN policy_module_links pml ON pml."policyId" = gp.id
       WHERE pml.module = $1 AND (gp."companyId" = $2 OR gp."companyId" IS NULL)
         AND gp.status = 'active'
         AND (gp."effectiveDate" IS NULL OR gp."effectiveDate" <= CURRENT_DATE)
         AND (gp."expiryDate" IS NULL OR gp."expiryDate" >= CURRENT_DATE)
       ORDER BY gp."createdAt" DESC`,
      [mod, scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.delete("/policies/:id", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [before] = await rawQuery<any>(`SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const result = await rawExecute(`UPDATE governance_policies SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (result.affectedRows === 0) throw new NotFoundError("السياسة غير موجودة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "governance_policies", entityId: id, before }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.policy.deleted",
      entity: "governance_policies",
      entityId: id,
    }).catch(console.error);
    res.json({ message: "تم حذف السياسة بنجاح" });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/risks", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM governance_risks WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/risks", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createRiskSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { title, description, severity, likelihood, impact, status, mitigationPlan, assignedTo } = parsed.data;
    const r = await rawExecute(
      `INSERT INTO governance_risks (title, description, severity, likelihood, impact, status, "mitigationPlan", "assignedTo", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [String(title).trim(), description ?? null, severity ?? "medium", likelihood ?? null, impact ?? null, status || "open", mitigationPlan ?? null, assignedTo ?? null, scope.companyId]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "governance_risks", entityId: r.insertId,
      after: { title, severity: severity ?? "medium", status: status || "open" },
    }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.risk.created",
      entity: "governance_risks",
      entityId: r.insertId,
      details: JSON.stringify({ title, severity: severity ?? "medium" }),
    }).catch(console.error);
    res.status(201).json({ id: r.insertId, title, severity: severity ?? "medium", status: status || "open" });
  } catch (err) { handleRouteError(err, res, "Create risk error:"); }
});

router.get("/risks/:id", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("المخاطرة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/risks/:id", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
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
    const result = await rawExecute(`UPDATE governance_risks SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (result.affectedRows === 0) throw new NotFoundError("المخاطرة غير موجودة");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_risks", entityId: id }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.risk.updated",
      entity: "governance_risks",
      entityId: id,
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.delete("/risks/:id", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [before] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const result = await rawExecute(`UPDATE governance_risks SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (result.affectedRows === 0) throw new NotFoundError("المخاطرة غير موجودة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "governance_risks", entityId: id, before }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.risk.deleted",
      entity: "governance_risks",
      entityId: id,
    }).catch(console.error);
    res.json({ message: "تم حذف المخاطرة بنجاح" });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/audits", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM governance_audits WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/audits", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, scope: auditScope, status, auditorName, startDate, endDate, findings } = req.body;
    const r = await rawExecute(
      `INSERT INTO governance_audits (title, scope, status, "auditorName", "startDate", "endDate", findings, "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [title, auditScope, status || "planned", auditorName, startDate, endDate, findings, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "governance_audits", entityId: r.insertId, after: { title } }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.audit.created",
      entity: "governance_audits",
      entityId: r.insertId,
      details: JSON.stringify({ title }),
    }).catch(console.error);
    res.status(201).json({ id: r.insertId });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/audits/:id", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM governance_audits WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("المراجعة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/audits/:id", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.scope !== undefined) { params.push(b.scope); sets.push(`scope=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.auditorName !== undefined) { params.push(b.auditorName); sets.push(`"auditorName"=$${params.length}`); }
    if (b.findings !== undefined) { params.push(b.findings); sets.push(`findings=$${params.length}`); }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE governance_audits SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (result.affectedRows === 0) throw new NotFoundError("المراجعة غير موجودة");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_audits WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_audits", entityId: id }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.audit.updated",
      entity: "governance_audits",
      entityId: id,
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.delete("/audits/:id", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [before] = await rawQuery<any>(`SELECT * FROM governance_audits WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const result = await rawExecute(`UPDATE governance_audits SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (result.affectedRows === 0) throw new NotFoundError("المراجعة غير موجودة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "governance_audits", entityId: id, before }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.audit.deleted",
      entity: "governance_audits",
      entityId: id,
    }).catch(console.error);
    res.json({ message: "تم حذف المراجعة بنجاح" });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/compliance", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM governance_compliance WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/compliance", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { regulation, description, status, dueDate, responsiblePerson, notes } = req.body;
    const r = await rawExecute(
      `INSERT INTO governance_compliance (regulation, description, status, "dueDate", "responsiblePerson", notes, "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [regulation, description, status || "compliant", dueDate, responsiblePerson, notes, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "governance_compliance", entityId: r.insertId, after: { regulation } }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance.created",
      entity: "governance_compliance",
      entityId: r.insertId,
      details: JSON.stringify({ regulation }),
    }).catch(console.error);
    res.status(201).json({ id: r.insertId });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/compliance/:id", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM governance_compliance WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("بند الامتثال غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/compliance/:id", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
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
    const result = await rawExecute(`UPDATE governance_compliance SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (result.affectedRows === 0) throw new NotFoundError("بند الامتثال غير موجود");
    const [row] = await rawQuery<any>(`SELECT * FROM governance_compliance WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_compliance", entityId: id }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance.updated",
      entity: "governance_compliance",
      entityId: id,
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.delete("/compliance/:id", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [before] = await rawQuery<any>(`SELECT * FROM governance_compliance WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const result = await rawExecute(`UPDATE governance_compliance SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (result.affectedRows === 0) throw new NotFoundError("بند الامتثال غير موجود");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "governance_compliance", entityId: id, before }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance.deleted",
      entity: "governance_compliance",
      entityId: id,
    }).catch(console.error);
    res.json({ message: "تم حذف بند الامتثال بنجاح" });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/stats", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [policies] = await rawQuery(`SELECT COUNT(*) as count FROM governance_policies WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]);
    const [risks] = await rawQuery(`SELECT COUNT(*) as count FROM governance_risks WHERE status='open' AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    const [audits] = await rawQuery(`SELECT COUNT(*) as count FROM governance_audits WHERE status IN ('planned','in_progress') AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    const [compliance] = await rawQuery(`SELECT COUNT(*) as count FROM governance_compliance WHERE status='non_compliant' AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    const [complianceActions] = await rawQuery<any>(`SELECT COUNT(*) FILTER (WHERE status='done') AS implemented, COUNT(*) AS total FROM policy_compliance_actions WHERE "companyId"=$1`, [cid]).catch(() => [{ implemented: 0, total: 0 }]);
    const [risksNoTreatment] = await rawQuery<any>(`SELECT COUNT(*) AS count FROM governance_risks WHERE status='open' AND "treatmentPlan" IS NULL AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]).catch(() => [{ count: 0 }]);
    const [openCapas] = await rawQuery<any>(`SELECT COUNT(*) AS count FROM governance_capa WHERE status IN ('open','in_progress') AND "companyId"=$1`, [cid]).catch(() => [{ count: 0 }]);
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

router.get("/compliance-dashboard", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [actions] = await rawQuery<any>(`SELECT COUNT(*) FILTER (WHERE status='done') AS implemented, COUNT(*) FILTER (WHERE status IN ('open','in_progress')) AS "notImplemented", COUNT(*) AS total FROM policy_compliance_actions WHERE "companyId"=$1`, [cid]).catch(() => [{ implemented: 0, notImplemented: 0, total: 0 }]);
    const [risks] = await rawQuery<any>(`SELECT COUNT(*) FILTER (WHERE status='open' AND "treatmentPlan" IS NOT NULL) AS "withTreatment", COUNT(*) FILTER (WHERE status='open' AND "treatmentPlan" IS NULL) AS "withoutTreatment", COUNT(*) FILTER (WHERE status='open') AS open FROM governance_risks WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]).catch(() => [{ withTreatment: 0, withoutTreatment: 0, open: 0 }]);
    const [policiesNoActions] = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM governance_policies gp WHERE ("companyId"=$1 OR "companyId" IS NULL) AND status='active' AND NOT EXISTS (SELECT 1 FROM policy_compliance_actions pca WHERE pca."policyId"=gp.id AND pca."companyId"=$1)`,
      [cid]
    ).catch(() => [{ count: 0 }]);
    const capas = await rawQuery<any>(`SELECT * FROM governance_capa WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 20`, [cid]).catch(() => []);
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

router.get("/compliance-actions", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE "companyId"=$1 ORDER BY "dueDate" ASC NULLS LAST, "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/compliance-actions", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const r = await rawExecute(
      `INSERT INTO policy_compliance_actions ("companyId",title,regulation,description,owner,"dueDate",status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [scope.companyId, b.title, b.regulation || null, b.description || null, b.owner || null, b.dueDate || null, b.status || 'open']
    );
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "policy_compliance_actions", entityId: r.insertId, after: { title: b.title } }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance_action.created",
      entity: "policy_compliance_actions",
      entityId: r.insertId,
      details: JSON.stringify({ title: b.title }),
    }).catch(console.error);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/compliance-actions/:actionId", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.actionId);
    const b = req.body;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.regulation !== undefined) { params.push(b.regulation); sets.push(`regulation=$${params.length}`); }
    if (b.owner !== undefined) { params.push(b.owner); sets.push(`owner=$${params.length}`); }
    if (b.dueDate !== undefined) { params.push(b.dueDate); sets.push(`"dueDate"=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE policy_compliance_actions SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "policy_compliance_actions", entityId: id }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance_action.updated",
      entity: "policy_compliance_actions",
      entityId: id,
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.delete("/compliance-actions/:actionId", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.actionId);
    const [before] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    await rawExecute(`UPDATE policy_compliance_actions SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "policy_compliance_actions", entityId: id, before }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance_action.deleted",
      entity: "policy_compliance_actions",
      entityId: id,
    }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/policies/:id/compliance-actions", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const policyId = Number(req.params.id);
    const rows = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE "policyId"=$1 AND "companyId"=$2 ORDER BY "createdAt"`, [policyId, scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/policies/:id/compliance-actions", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const policyId = Number(req.params.id);
    const b = req.body;
    const r = await rawExecute(
      `INSERT INTO policy_compliance_actions ("policyId","companyId",title,status,owner,"dueDate",description) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [policyId, scope.companyId, b.action || b.title, b.status || 'open', b.responsiblePerson || b.owner || null, b.dueDate || null, b.notes || b.description || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "policy_compliance_actions", entityId: r.insertId, after: { policyId, action: b.action } }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance_action.created",
      entity: "policy_compliance_actions",
      entityId: r.insertId,
      details: JSON.stringify({ policyId, action: b.action }),
    }).catch(console.error);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/compliance-actions/:id", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.action !== undefined || b.title !== undefined) { params.push(b.action ?? b.title); sets.push(`title=$${params.length}`); }
    if (b.responsiblePerson !== undefined || b.owner !== undefined) { params.push(b.responsiblePerson ?? b.owner); sets.push(`owner=$${params.length}`); }
    if (b.dueDate !== undefined) { params.push(b.dueDate); sets.push(`"dueDate"=$${params.length}`); }
    if (b.notes !== undefined || b.description !== undefined) { params.push(b.notes ?? b.description); sets.push(`description=$${params.length}`); }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE policy_compliance_actions SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "policy_compliance_actions", entityId: id }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.compliance_action.updated",
      entity: "policy_compliance_actions",
      entityId: id,
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/risks/:id/treatment", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.treatmentPlan !== undefined) { params.push(b.treatmentPlan); sets.push(`"treatmentPlan"=$${params.length}`); }
    if (b.treatmentOwner !== undefined) { params.push(b.treatmentOwner); sets.push(`"treatmentOwner"=$${params.length}`); }
    if (b.treatmentDueDate !== undefined) { params.push(b.treatmentDueDate); sets.push(`"treatmentDueDate"=$${params.length}`); }
    if (b.treatmentStatus !== undefined) { params.push(b.treatmentStatus); sets.push(`"treatmentStatus"=$${params.length}`); }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE governance_risks SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1`, [id]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_risks", entityId: id, after: { treatmentPlan: b.treatmentPlan } }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.risk.treatment_updated",
      entity: "governance_risks",
      entityId: id,
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.get("/capa", requirePermission("governance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM governance_capa WHERE "companyId"=$1 ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.post("/capa", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const r = await rawExecute(
      `INSERT INTO governance_capa ("companyId","auditId",finding,"rootCause","correctiveAction","preventiveAction",status,"responsiblePerson","dueDate","completedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, b.auditId || null, b.finding, b.rootCause || null, b.correctiveAction || null, b.preventiveAction || null, b.status || 'open', b.responsiblePerson || null, b.dueDate || null, null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM governance_capa WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "governance_capa", entityId: r.insertId, after: { finding: b.finding } }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.capa.created",
      entity: "governance_capa",
      entityId: r.insertId,
      details: JSON.stringify({ finding: b.finding }),
    }).catch(console.error);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

router.patch("/capa/:id", requirePermission("governance:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
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
    await rawExecute(`UPDATE governance_capa SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM governance_capa WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "governance_capa", entityId: id }).catch(console.error);
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "governance.capa.updated",
      entity: "governance_capa",
      entityId: id,
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "governance"); }
});

export default router;
