import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();
router.use(authMiddleware);

router.get("/campaigns", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM marketing_campaigns WHERE "companyId"=$1 ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/campaigns", async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, description, type, channel, status, budget, spent, startDate, endDate, targetAudience } = req.body;
    const r = await rawExecute(
      `INSERT INTO marketing_campaigns (name, description, type, channel, status, budget, spent, "startDate", "endDate", "targetAudience", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [name, description, type, channel, status || "draft", budget || 0, spent || 0, startDate, endDate, targetAudience, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/campaigns/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "الحملة غير موجودة" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/campaigns/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الحملة غير موجودة" }); return; }
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.type !== undefined) { params.push(b.type); sets.push(`type=$${params.length}`); }
    if (b.channel !== undefined) { params.push(b.channel); sets.push(`channel=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.budget !== undefined) { params.push(b.budget); sets.push(`budget=$${params.length}`); }
    if (b.spent !== undefined) { params.push(b.spent); sets.push(`spent=$${params.length}`); }
    if (b.startDate !== undefined) { params.push(b.startDate); sets.push(`"startDate"=$${params.length}`); }
    if (b.endDate !== undefined) { params.push(b.endDate); sets.push(`"endDate"=$${params.length}`); }
    if (b.targetAudience !== undefined) { params.push(b.targetAudience); sets.push(`"targetAudience"=$${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE marketing_campaigns SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM marketing_campaigns WHERE id=$1`, [id]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/campaigns/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الحملة غير موجودة" }); return; }
    await rawExecute(`DELETE FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف الحملة بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [total] = await rawQuery(`SELECT COUNT(*) as count FROM marketing_campaigns WHERE "companyId"=$1`, [cid]);
    const [active] = await rawQuery(`SELECT COUNT(*) as count FROM marketing_campaigns WHERE status='active' AND "companyId"=$1`, [cid]);
    const [budget] = await rawQuery(`SELECT COALESCE(SUM(budget),0) as total FROM marketing_campaigns WHERE status='active' AND "companyId"=$1`, [cid]);
    const [spent] = await rawQuery(`SELECT COALESCE(SUM(spent),0) as total FROM marketing_campaigns WHERE status='active' AND "companyId"=$1`, [cid]);
    res.json({
      totalCampaigns: Number(total.count),
      activeCampaigns: Number(active.count),
      totalBudget: Number(budget.total),
      totalSpent: Number(spent.total),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
