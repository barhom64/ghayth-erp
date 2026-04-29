import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError, ValidationError, NotFoundError,
  parseId,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

// P02-S3-CRIT — `marketing:*` permissions are seeded for the
// `general_manager` and `crm_manager` roles in companyBootstrap.ts:195
// /:204, but every route in this file used to skip the permission
// gate entirely. Authentication alone meant a junior accountant or a
// procurement clerk could create, edit, delete, or rewrite the
// `revenue` field on any campaign in their company — silently
// fabricating ROI numbers that flow into the `/marketing/stats`
// dashboard and the `/funnel` BI report. Aligning every route with
// the same pattern used by fleet/hr/crm/properties.

// ── Zod validation schemas ──────────────────────────────────────────
const createCampaignSchema = z.object({
  name: z.string({ required_error: "اسم الحملة مطلوب" }).min(1, "اسم الحملة مطلوب"),
  description: z.string({ invalid_type_error: "الوصف يجب أن يكون نصاً" }).optional().nullable(),
  type: z.string({ invalid_type_error: "نوع الحملة يجب أن يكون نصاً" }).optional().nullable(),
  channel: z.string({ invalid_type_error: "القناة يجب أن تكون نصاً" }).optional().nullable(),
  status: z.string({ invalid_type_error: "الحالة يجب أن تكون نصاً" }).optional().nullable(),
  budget: z.coerce.number({ invalid_type_error: "الميزانية يجب أن تكون رقماً" }).min(0, "الميزانية يجب أن تكون قيمة غير سالبة").optional().nullable(),
  spent: z.coerce.number({ invalid_type_error: "المبلغ المصروف يجب أن يكون رقماً" }).min(0, "المبلغ المصروف يجب أن يكون قيمة غير سالبة").optional().nullable(),
  startDate: z.string({ invalid_type_error: "تاريخ البداية يجب أن يكون نصاً" }).optional().nullable(),
  endDate: z.string({ invalid_type_error: "تاريخ النهاية يجب أن يكون نصاً" }).optional().nullable(),
  targetAudience: z.string({ invalid_type_error: "الجمهور المستهدف يجب أن يكون نصاً" }).optional().nullable(),
});

const updateCampaignSchema = z.object({
  name: z.string({ invalid_type_error: "اسم الحملة يجب أن يكون نصاً" }).optional(),
  description: z.string({ invalid_type_error: "الوصف يجب أن يكون نصاً" }).optional().nullable(),
  type: z.string({ invalid_type_error: "نوع الحملة يجب أن يكون نصاً" }).optional().nullable(),
  channel: z.string({ invalid_type_error: "القناة يجب أن تكون نصاً" }).optional().nullable(),
  status: z.string({ invalid_type_error: "الحالة يجب أن تكون نصاً" }).optional().nullable(),
  budget: z.coerce.number({ invalid_type_error: "الميزانية يجب أن تكون رقماً" }).optional().nullable(),
  spent: z.coerce.number({ invalid_type_error: "المبلغ المصروف يجب أن يكون رقماً" }).optional().nullable(),
  startDate: z.string({ invalid_type_error: "تاريخ البداية يجب أن يكون نصاً" }).optional().nullable(),
  endDate: z.string({ invalid_type_error: "تاريخ النهاية يجب أن يكون نصاً" }).optional().nullable(),
  targetAudience: z.string({ invalid_type_error: "الجمهور المستهدف يجب أن يكون نصاً" }).optional().nullable(),
});

const updateRevenueSchema = z.object({
  revenue: z.coerce.number({ required_error: "قيمة الإيرادات مطلوبة", invalid_type_error: "الإيرادات يجب أن تكون رقماً" }).optional().nullable(),
});

const router = Router();

router.get("/campaigns", requirePermission("marketing:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM marketing_campaigns WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.post("/campaigns", requirePermission("marketing:create"), async (req, res) => {
  try {
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const { name, description, type, channel, status, budget, spent, startDate, endDate, targetAudience } = req.body;
    if (!name || !String(name).trim()) {
      throw new ValidationError("اسم الحملة مطلوب", {
        field: "name",
        fix: "أدخل اسماً للحملة التسويقية",
      });
    }
    if (budget !== undefined && budget !== null && budget !== "") {
      const bn = Number(budget);
      if (!Number.isFinite(bn) || bn < 0) {
        throw new ValidationError("الميزانية غير صالحة", {
          field: "budget",
          fix: "أدخل قيمة غير سالبة",
        });
      }
    }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      throw new ValidationError("تاريخ النهاية قبل تاريخ البداية", {
        field: "endDate",
        fix: "اختر تاريخ انتهاء بعد تاريخ البداية",
      });
    }
    const r = await rawExecute(
      `INSERT INTO marketing_campaigns (name, description, type, channel, status, budget, spent, "startDate", "endDate", "targetAudience", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [String(name).trim(), description ?? null, type ?? null, channel ?? null, status || "draft", Number(budget ?? 0), Number(spent ?? 0), startDate ?? null, endDate ?? null, targetAudience ?? null, scope.companyId]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "marketing_campaigns", entityId: r.insertId,
      after: { name, channel, status: status || "draft", budget: Number(budget ?? 0) },
    }).catch((e) => logger.error(e, "marketing background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "marketing.campaign.created", entity: "marketing_campaigns", entityId: r.insertId, details: JSON.stringify({ name, channel, status: status || "draft" }) }).catch((e) => logger.error(e, "marketing background task failed"));
    res.status(201).json({ id: r.insertId, name, status: status || "draft", budget: Number(budget ?? 0) });
  } catch (err) { handleRouteError(err, res, "Create campaign error:"); }
});

router.get("/campaigns/:id", requirePermission("marketing:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("الحملة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.patch("/campaigns/:id", requirePermission("marketing:update"), async (req, res) => {
  try {
    const parsed = updateCampaignSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT id FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("الحملة غير موجودة");
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
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "marketing.campaign.updated", entity: "marketing_campaigns", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "marketing background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "update", entity: "marketing_campaigns", entityId: id, after: b }).catch((e) => logger.error(e, "marketing background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.delete("/campaigns/:id", requirePermission("marketing:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT id FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("الحملة غير موجودة");
    await rawExecute(`UPDATE marketing_campaigns SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "marketing.campaign.deleted", entity: "marketing_campaigns", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "marketing background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "delete", entity: "marketing_campaigns", entityId: id }).catch((e) => logger.error(e, "marketing background task failed"));
    res.json({ message: "تم حذف الحملة بنجاح" });
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.get("/stats", requirePermission("marketing:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [total] = await rawQuery(`SELECT COUNT(*) as count FROM marketing_campaigns WHERE "companyId"=$1`, [cid]);
    const [active] = await rawQuery(`SELECT COUNT(*) as count FROM marketing_campaigns WHERE status='active' AND "companyId"=$1`, [cid]);
    const [budget] = await rawQuery(`SELECT COALESCE(SUM(budget),0) as total FROM marketing_campaigns WHERE "companyId"=$1`, [cid]);
    const [spent] = await rawQuery(`SELECT COALESCE(SUM(spent),0) as total FROM marketing_campaigns WHERE "companyId"=$1`, [cid]);
    const [revenue] = await rawQuery<any>(`SELECT COALESCE(SUM(revenue),0) as total FROM marketing_campaigns WHERE "companyId"=$1`, [cid]).catch(() => [{ total: 0 }]);
    const totalSpent = Number(spent.total);
    const totalRevenue = Number(revenue?.total || 0);
    const roas = totalSpent > 0 ? (totalRevenue / totalSpent).toFixed(2) : null;
    const sourceCounts = await rawQuery<any>(
      `SELECT source, COUNT(*) AS count FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND source IS NOT NULL GROUP BY source ORDER BY count DESC`,
      [cid]
    ).catch(() => []);
    res.json({
      totalCampaigns: Number(total.count),
      activeCampaigns: Number(active.count),
      totalBudget: Number(budget.total),
      totalSpent: totalSpent,
      totalRevenue: totalRevenue,
      roas,
      sourceCounts,
    });
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.get("/campaigns/:id/roas", requirePermission("marketing:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [campaign] = await rawQuery<any>(`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!campaign) throw new NotFoundError("الحملة غير موجودة");
    const spent = Number(campaign.spent || 0);
    const revenue = Number(campaign.revenue || 0);
    const roas = spent > 0 ? revenue / spent : null;
    const leads = await rawQuery<any>(
      `SELECT COUNT(*) AS count FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND source=$2`,
      [scope.companyId, campaign.name]
    ).catch(() => [{ count: 0 }]);
    res.json({
      campaignId: id,
      campaignName: campaign.name,
      spent,
      revenue,
      roas: roas ? Number(roas).toFixed(2) : null,
      leadsGenerated: Number(leads?.[0]?.count || 0),
    });
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.get("/funnel", requirePermission("marketing:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
    const stageData: any[] = [];
    for (const stage of STAGES) {
      const [row] = await rawQuery<any>(`SELECT COUNT(*) AS count, COALESCE(SUM(value),0) AS value FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND stage=$2`, [cid, stage]);
      stageData.push({ stage, count: Number(row.count), value: Number(row.value) });
    }
    const sourceFunnel = await rawQuery<any>(
      `SELECT source, COUNT(*) AS total, COUNT(*) FILTER (WHERE stage='closed_won') AS won, COALESCE(SUM(value) FILTER (WHERE stage='closed_won'),0) AS "wonValue"
       FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND source IS NOT NULL GROUP BY source ORDER BY total DESC`,
      [cid]
    ).catch(() => []);
    const conversionRates = stageData.map((s, i) => {
      const prev = i > 0 ? stageData[i - 1] : null;
      return {
        ...s,
        conversionFromPrev: prev && prev.count > 0 ? ((s.count / prev.count) * 100).toFixed(1) : null,
      };
    });
    res.json({ stages: conversionRates, sourceFunnel });
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.patch("/campaigns/:id/revenue", requirePermission("marketing:update"), async (req, res) => {
  try {
    const parsed = updateRevenueSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { revenue } = req.body;
    await rawExecute(`UPDATE marketing_campaigns SET revenue=$1 WHERE id=$2 AND "companyId"=$3`, [revenue || 0, id, scope.companyId]);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "marketing.campaign.revenue_updated", entity: "marketing_campaigns", entityId: id, details: JSON.stringify({ revenue: revenue || 0 }) }).catch((e) => logger.error(e, "marketing background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "update", entity: "marketing_campaigns", entityId: id, after: { revenue: revenue || 0 } }).catch((e) => logger.error(e, "marketing background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.get("/templates", requirePermission("marketing:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT * FROM document_templates WHERE "companyId" = $1 AND category = 'marketing' ORDER BY "createdAt" DESC`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch {
    res.json({ data: [] });
  }
});

export default router;
