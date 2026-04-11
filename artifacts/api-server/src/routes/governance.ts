import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

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
    const r = await rawExecute(
      `INSERT INTO governance_risks (title, description, severity, likelihood, impact, status, "mitigationPlan", "assignedTo", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [title, description, severity, likelihood, impact, status || "open", mitigationPlan, assignedTo, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
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
    res.json({
      totalPolicies: Number(policies.count),
      openRisks: Number(risks.count),
      activeAudits: Number(audits.count),
      nonCompliant: Number(compliance.count),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
