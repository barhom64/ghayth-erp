import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError, ValidationError } from "../lib/errorHandler.js";
import { createAuditLog } from "../lib/businessHelpers.js";

const router = Router();
router.use(authMiddleware);

router.get("/policies", async (req, res) => {
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
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/policies", async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, description, category, status, effectiveDate, expiryDate, modules } = req.body;
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
    const [row] = await rawQuery<any>(`SELECT * FROM governance_policies WHERE id=$1`, [r.insertId]);
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/policies/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(
      `SELECT * FROM governance_policies WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [Number(req.params.id), scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "السياسة غير موجودة" }); return; }
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
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/policies/:id", async (req, res) => {
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
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(
      `UPDATE governance_policies SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`,
      params
    );
    if (result.affectedRows === 0) { res.status(404).json({ error: "السياسة غير موجودة" }); return; }

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
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/policies/:id/new-version", async (req, res) => {
  try {
    const scope = req.scope!;
    const parentId = Number(req.params.id);
    const [parent] = await rawQuery<any>(
      `SELECT * FROM governance_policies WHERE id=$1 AND "companyId"=$2`,
      [parentId, scope.companyId]
    );
    if (!parent) { res.status(404).json({ error: "السياسة غير موجودة" }); return; }

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

    const [row] = await rawQuery<any>(`SELECT * FROM governance_policies WHERE id=$1`, [r.insertId]);
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/policies/:id/module-links", async (req, res) => {
  try {
    const scope = req.scope!;
    const policyId = Number(req.params.id);
    const [policy] = await rawQuery<any>(
      `SELECT id FROM governance_policies WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`,
      [policyId, scope.companyId]
    );
    if (!policy) { res.status(404).json({ error: "السياسة غير موجودة" }); return; }
    const rows = await rawQuery(
      `SELECT * FROM policy_module_links WHERE "policyId"=$1`,
      [policyId]
    );
    res.json({ data: rows });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/module-policies/:module", async (req, res) => {
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
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/policies/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const result = await rawExecute(`DELETE FROM governance_policies WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (result.affectedRows === 0) { res.status(404).json({ error: "السياسة غير موجودة" }); return; }
    res.json({ message: "تم حذف السياسة بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/risks", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM governance_risks WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/risks", async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, description, severity, likelihood, impact, status, mitigationPlan, assignedTo } = req.body;
    if (!title || !String(title).trim()) {
      throw new ValidationError("عنوان المخاطرة مطلوب", {
        field: "title",
        fix: "أدخل عنواناً مختصراً للمخاطرة",
      });
    }
    const validSeverities = ["low", "medium", "high", "critical"];
    if (severity && !validSeverities.includes(severity)) {
      throw new ValidationError(`خطورة غير صالحة: ${severity}`, {
        field: "severity",
        fix: `اختر من: ${validSeverities.join(", ")}`,
      });
    }
    const r = await rawExecute(
      `INSERT INTO governance_risks (title, description, severity, likelihood, impact, status, "mitigationPlan", "assignedTo", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [String(title).trim(), description ?? null, severity ?? "medium", likelihood ?? null, impact ?? null, status || "open", mitigationPlan ?? null, assignedTo ?? null, scope.companyId]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "governance_risks", entityId: r.insertId,
      after: { title, severity: severity ?? "medium", status: status || "open" },
    }).catch(console.error);
    res.status(201).json({ id: r.insertId, title, severity: severity ?? "medium", status: status || "open" });
  } catch (err) { handleRouteError(err, res, "Create risk error:"); }
});

router.get("/risks/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "المخاطرة غير موجودة" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/risks/:id", async (req, res) => {
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
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE governance_risks SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (result.affectedRows === 0) { res.status(404).json({ error: "المخاطرة غير موجودة" }); return; }
    const [row] = await rawQuery<any>(`SELECT * FROM governance_risks WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/risks/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const result = await rawExecute(`DELETE FROM governance_risks WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (result.affectedRows === 0) { res.status(404).json({ error: "المخاطرة غير موجودة" }); return; }
    res.json({ message: "تم حذف المخاطرة بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/audits", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM governance_audits WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/audits", async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, scope: auditScope, status, auditorName, startDate, endDate, findings } = req.body;
    const r = await rawExecute(
      `INSERT INTO governance_audits (title, scope, status, "auditorName", "startDate", "endDate", findings, "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [title, auditScope, status || "planned", auditorName, startDate, endDate, findings, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/audits/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM governance_audits WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "المراجعة غير موجودة" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/audits/:id", async (req, res) => {
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
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE governance_audits SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (result.affectedRows === 0) { res.status(404).json({ error: "المراجعة غير موجودة" }); return; }
    const [row] = await rawQuery<any>(`SELECT * FROM governance_audits WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/audits/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const result = await rawExecute(`DELETE FROM governance_audits WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (result.affectedRows === 0) { res.status(404).json({ error: "المراجعة غير موجودة" }); return; }
    res.json({ message: "تم حذف المراجعة بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/compliance", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM governance_compliance WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/compliance", async (req, res) => {
  try {
    const scope = req.scope!;
    const { regulation, description, status, dueDate, responsiblePerson, notes } = req.body;
    const r = await rawExecute(
      `INSERT INTO governance_compliance (regulation, description, status, "dueDate", "responsiblePerson", notes, "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [regulation, description, status || "compliant", dueDate, responsiblePerson, notes, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/compliance/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM governance_compliance WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "بند الامتثال غير موجود" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/compliance/:id", async (req, res) => {
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
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE governance_compliance SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (result.affectedRows === 0) { res.status(404).json({ error: "بند الامتثال غير موجود" }); return; }
    const [row] = await rawQuery<any>(`SELECT * FROM governance_compliance WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/compliance/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const result = await rawExecute(`DELETE FROM governance_compliance WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (result.affectedRows === 0) { res.status(404).json({ error: "بند الامتثال غير موجود" }); return; }
    res.json({ message: "تم حذف بند الامتثال بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [policies] = await rawQuery(`SELECT COUNT(*) as count FROM governance_policies WHERE "companyId"=$1 OR "companyId" IS NULL`, [cid]);
    const [risks] = await rawQuery(`SELECT COUNT(*) as count FROM governance_risks WHERE status='open' AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    const [audits] = await rawQuery(`SELECT COUNT(*) as count FROM governance_audits WHERE status IN ('planned','in_progress') AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    const [compliance] = await rawQuery(`SELECT COUNT(*) as count FROM governance_compliance WHERE status='non_compliant' AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    const [complianceActions] = await rawQuery<any>(`SELECT COUNT(*) FILTER (WHERE status='implemented') AS implemented, COUNT(*) AS total FROM policy_compliance_actions WHERE "companyId"=$1`, [cid]).catch(() => [{ implemented: 0, total: 0 }]);
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
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/compliance-dashboard", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [actions] = await rawQuery<any>(`SELECT COUNT(*) FILTER (WHERE status='implemented') AS implemented, COUNT(*) FILTER (WHERE status='not_implemented') AS "notImplemented", COUNT(*) AS total FROM policy_compliance_actions WHERE "companyId"=$1`, [cid]).catch(() => [{ implemented: 0, notImplemented: 0, total: 0 }]);
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
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/compliance-actions", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE "companyId"=$1 ORDER BY "dueDate" ASC NULLS LAST, "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/compliance-actions", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const r = await rawExecute(
      `INSERT INTO policy_compliance_actions ("companyId",title,regulation,description,owner,"dueDate",status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [scope.companyId, b.title, b.regulation || null, b.description || null, b.owner || null, b.dueDate || null, b.status || 'open']
    );
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1`, [r.insertId]);
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/compliance-actions/:actionId", async (req, res) => {
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
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1`, [id]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/compliance-actions/:actionId", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.actionId);
    await rawExecute(`DELETE FROM policy_compliance_actions WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/policies/:id/compliance-actions", async (req, res) => {
  try {
    const scope = req.scope!;
    const policyId = Number(req.params.id);
    const rows = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE "policyId"=$1 AND "companyId"=$2 ORDER BY "createdAt"`, [policyId, scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/policies/:id/compliance-actions", async (req, res) => {
  try {
    const scope = req.scope!;
    const policyId = Number(req.params.id);
    const b = req.body;
    const r = await rawExecute(
      `INSERT INTO policy_compliance_actions ("policyId","companyId",action,status,"responsiblePerson","dueDate",notes) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [policyId, scope.companyId, b.action, b.status || 'not_implemented', b.responsiblePerson || null, b.dueDate || null, b.notes || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1`, [r.insertId]);
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/compliance-actions/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.action !== undefined) { params.push(b.action); sets.push(`action=$${params.length}`); }
    if (b.responsiblePerson !== undefined) { params.push(b.responsiblePerson); sets.push(`"responsiblePerson"=$${params.length}`); }
    if (b.dueDate !== undefined) { params.push(b.dueDate); sets.push(`"dueDate"=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE policy_compliance_actions SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM policy_compliance_actions WHERE id=$1`, [id]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/risks/:id/treatment", async (req, res) => {
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
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/capa", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM governance_capa WHERE "companyId"=$1 ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/capa", async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const r = await rawExecute(
      `INSERT INTO governance_capa ("companyId","auditId",finding,"rootCause","correctiveAction","preventiveAction",status,"responsiblePerson","dueDate","completedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [scope.companyId, b.auditId || null, b.finding, b.rootCause || null, b.correctiveAction || null, b.preventiveAction || null, b.status || 'open', b.responsiblePerson || null, b.dueDate || null, null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM governance_capa WHERE id=$1`, [r.insertId]);
    res.status(201).json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/capa/:id", async (req, res) => {
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
    const [row] = await rawQuery<any>(`SELECT * FROM governance_capa WHERE id=$1`, [id]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
