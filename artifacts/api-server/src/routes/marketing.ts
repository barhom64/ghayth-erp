import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { safeUrl } from "../lib/urlPolicy.js";
import { zCoerceBoolean } from "../lib/zodCoerce.js";
import { applyDlp } from "../lib/communicationControl.js";

// Local row shapes for marketing tables (not in @workspace/db schema).

interface MarketingCampaignRow {
  id: number;
  companyId: number;
  name: string;
  description?: string | null;
  type?: string | null;
  channel?: string | null;
  status?: string | null;
  budget?: number | string | null;
  spent?: number | string | null;
  revenue?: number | string | null;
  startDate?: string | null;
  endDate?: string | null;
  targetAudience?: string | null;
  isPublic?: boolean | null;
  slug?: string | null;
  publicHeadline?: string | null;
  publicBody?: string | null;
  publicImageUrl?: string | null;
  publicCtaLabel?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

interface CountRow { count: string | number }
interface TotalRow { total: string | number }
interface CountValueRow { count: string | number; value: string | number }
interface SourceCountRow { source: string; count: string | number }
interface SourceFunnelRow { source: string; total: string | number; won: string | number; wonValue: string | number }
interface DocumentTemplateRow {
  id: number;
  companyId: number;
  name: string;
  category: string;
  body?: string | null;
  createdAt: string;
}
interface FunnelStageRow { stage: string; count: number; value: number; conversionFromPrev?: string | null }

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
// معرّف عام (slug) للحملة عند نشرها على الموقع — حروف لاتينية/أرقام/شرطات فقط،
// يُطبَّع (lowercase/trim). فريد داخل الشركة عبر uq_marketing_campaign_public_slug.
const slugField = z
  .string({ invalid_type_error: "المعرّف يجب أن يكون نصاً" })
  .trim()
  .max(120, "المعرّف طويل جداً")
  .regex(/^[a-z0-9-]+$/i, "المعرّف يجب أن يحتوي على حروف لاتينية وأرقام وشرطات فقط")
  .transform((v) => v.toLowerCase())
  .optional()
  .nullable();

const publicFields = {
  isPublic: zCoerceBoolean().optional().nullable(),
  slug: slugField,
  publicHeadline: z.string({ invalid_type_error: "العنوان يجب أن يكون نصاً" }).trim().max(200).optional().nullable(),
  publicBody: z.string({ invalid_type_error: "النص يجب أن يكون نصاً" }).trim().max(2000).optional().nullable(),
  publicImageUrl: safeUrl(1000).nullable().optional(),
  publicCtaLabel: z.string({ invalid_type_error: "نص الزر يجب أن يكون نصاً" }).trim().max(80).optional().nullable(),
};

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
  ...publicFields,
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
  ...publicFields,
});

const updateRevenueSchema = z.object({
  revenue: z.coerce.number({ required_error: "قيمة الإيرادات مطلوبة", invalid_type_error: "الإيرادات يجب أن تكون رقماً" }).optional().nullable(),
});

const router = Router();

router.get("/campaigns", authorize({ feature: "marketing", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<MarketingCampaignRow>(`SELECT * FROM marketing_campaigns WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.post("/campaigns", authorize({ feature: "marketing", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createCampaignSchema.safeParse(req.body));
    const scope = req.scope!;
    const { name, description, type, channel, status, budget, spent, startDate, endDate, targetAudience, isPublic, slug, publicHeadline, publicBody, publicImageUrl, publicCtaLabel } = parsed;
    if (!name || !String(name).trim()) {
      throw new ValidationError("اسم الحملة مطلوب", {
        field: "name",
        fix: "أدخل اسماً للحملة التسويقية",
      });
    }
    if (budget != null) {
      if (!Number.isFinite(budget) || budget < 0) {
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
    // النشر العام يتطلّب معرّفاً (slug) كي يظهر على الموقع ويُعزى إليه العملاء.
    if (isPublic && !slug) {
      throw new ValidationError("معرّف الحملة العام مطلوب عند النشر", {
        field: "slug",
        fix: "أدخل معرّفاً بحروف لاتينية/أرقام/شرطات (مثال: umrah-ramadan)",
      });
    }
    const r = await rawExecute(
      `INSERT INTO marketing_campaigns (name, description, type, channel, status, budget, spent, "startDate", "endDate", "targetAudience", "isPublic", slug, "publicHeadline", "publicBody", "publicImageUrl", "publicCtaLabel", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [String(name).trim(), description ?? null, type ?? null, channel ?? null, status || "draft", Number(budget ?? 0), Number(spent ?? 0), startDate ?? null, endDate ?? null, targetAudience ?? null, isPublic ?? false, slug ?? null, publicHeadline ?? null, publicBody ?? null, publicImageUrl ?? null, publicCtaLabel ?? null, scope.companyId]
    ).catch((e: unknown) => {
      // تعارض المعرّف العام داخل الشركة (uq_marketing_campaign_public_slug).
      if ((e as { code?: string })?.code === "23505") {
        throw new ValidationError("معرّف الحملة العام مستخدم بالفعل", { field: "slug", fix: "اختر معرّفاً فريداً" });
      }
      throw e;
    });
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "marketing_campaigns", entityId: r.insertId,
      after: { name, channel, status: status || "draft", budget: Number(budget ?? 0) },
    }).catch((e) => logger.error(e, "marketing background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "marketing.campaign.created", entity: "marketing_campaigns", entityId: r.insertId, details: JSON.stringify({ name, channel, status: status || "draft" }) }).catch((e) => logger.error(e, "marketing background task failed"));
    const [row] = await rawQuery<MarketingCampaignRow>(`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, name, status: status || "draft", budget: Number(budget ?? 0) });
  } catch (err) { handleRouteError(err, res, "Create campaign error:"); }
});

router.get("/campaigns/:id", authorize({ feature: "marketing", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<MarketingCampaignRow>(`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("الحملة غير موجودة");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.patch("/campaigns/:id", authorize({ feature: "marketing", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(updateCampaignSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number; startDate: string | null; endDate: string | null }>(`SELECT id, "startDate", "endDate" FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("الحملة غير موجودة");
    const b = parsed;
    // كمرآة لتحقّق POST: لا يجوز أن تصبح النهاية قبل البداية بعد التعديل الجزئي.
    if (b.startDate !== undefined || b.endDate !== undefined) {
      const sd = b.startDate ?? existing.startDate;
      const ed = b.endDate ?? existing.endDate;
      if (sd && ed && new Date(ed) < new Date(sd)) {
        throw new ValidationError("تاريخ النهاية قبل تاريخ البداية", { field: "endDate", fix: "اختر تاريخ انتهاء بعد تاريخ البداية" });
      }
    }
    // النشر العام يتطلّب معرّفاً — نتحقّق من القيمة النهائية بعد الدمج الجزئي.
    const [pub] = await rawQuery<{ isPublic: boolean | null; slug: string | null }>(`SELECT "isPublic", slug FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    const willBePublic = b.isPublic !== undefined ? b.isPublic : pub?.isPublic;
    const willHaveSlug = b.slug !== undefined ? b.slug : pub?.slug;
    if (willBePublic && !willHaveSlug) {
      throw new ValidationError("معرّف الحملة العام مطلوب عند النشر", { field: "slug", fix: "أدخل معرّفاً بحروف لاتينية/أرقام/شرطات" });
    }
    const sets: string[] = [];
    const params: unknown[] = [];
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
    if (b.isPublic !== undefined) { params.push(b.isPublic ?? false); sets.push(`"isPublic"=$${params.length}`); }
    if (b.slug !== undefined) { params.push(b.slug); sets.push(`slug=$${params.length}`); }
    if (b.publicHeadline !== undefined) { params.push(b.publicHeadline); sets.push(`"publicHeadline"=$${params.length}`); }
    if (b.publicBody !== undefined) { params.push(b.publicBody); sets.push(`"publicBody"=$${params.length}`); }
    if (b.publicImageUrl !== undefined) { params.push(b.publicImageUrl); sets.push(`"publicImageUrl"=$${params.length}`); }
    if (b.publicCtaLabel !== undefined) { params.push(b.publicCtaLabel); sets.push(`"publicCtaLabel"=$${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    const { affectedRows } = await rawExecute(`UPDATE marketing_campaigns SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params).catch((e: unknown) => {
      if ((e as { code?: string })?.code === "23505") {
        throw new ValidationError("معرّف الحملة العام مستخدم بالفعل", { field: "slug", fix: "اختر معرّفاً فريداً" });
      }
      throw e;
    });
    if (!affectedRows) throw new NotFoundError("الحملة غير موجودة");
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "marketing.campaign.updated", entity: "marketing_campaigns", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "marketing background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "update", entity: "marketing_campaigns", entityId: id, after: b }).catch((e) => logger.error(e, "marketing background task failed"));
    const [row] = await rawQuery<MarketingCampaignRow>(`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.delete("/campaigns/:id", authorize({ feature: "marketing", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number }>(`SELECT id FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("الحملة غير موجودة");
    const { affectedRows } = await rawExecute(`UPDATE marketing_campaigns SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("الحملة غير موجودة");
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "marketing.campaign.deleted", entity: "marketing_campaigns", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "marketing background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "delete", entity: "marketing_campaigns", entityId: id }).catch((e) => logger.error(e, "marketing background task failed"));
    res.json({ message: "تم حذف الحملة بنجاح" });
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.get("/stats", authorize({ feature: "marketing", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [total] = await rawQuery<CountRow>(`SELECT COUNT(*) as count FROM marketing_campaigns WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [active] = await rawQuery<CountRow>(`SELECT COUNT(*) as count FROM marketing_campaigns WHERE status='active' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [budget] = await rawQuery<TotalRow>(`SELECT COALESCE(SUM(budget),0) as total FROM marketing_campaigns WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [spent] = await rawQuery<TotalRow>(`SELECT COALESCE(SUM(spent),0) as total FROM marketing_campaigns WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [revenue] = await rawQuery<TotalRow>(`SELECT COALESCE(SUM(revenue),0) as total FROM marketing_campaigns WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]).catch((e) => { logger.error(e, "marketing query failed"); return [{ total: 0 }] as TotalRow[]; });
    const totalSpent = Number(spent.total);
    const totalRevenue = Number(revenue?.total || 0);
    const roas = totalSpent > 0 ? (totalRevenue / totalSpent).toFixed(2) : null;
    const sourceCounts = await rawQuery<SourceCountRow>(
      `SELECT source, COUNT(*) AS count FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND source IS NOT NULL GROUP BY source ORDER BY count DESC`,
      [cid]
    ).catch((e) => { logger.error(e, "marketing query failed"); return [] as SourceCountRow[]; });
    res.json(maskFields(req, {
      totalCampaigns: Number(total.count),
      activeCampaigns: Number(active.count),
      totalBudget: Number(budget.total),
      totalSpent: totalSpent,
      totalRevenue: totalRevenue,
      roas,
      sourceCounts,
    }));
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.get("/campaigns/:id/roas", authorize({ feature: "marketing", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [campaign] = await rawQuery<MarketingCampaignRow>(`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!campaign) throw new NotFoundError("الحملة غير موجودة");
    const spent = Number(campaign.spent || 0);
    const revenue = Number(campaign.revenue || 0);
    const roas = spent > 0 ? revenue / spent : null;
    // العزو المتين: نحتسب العملاء المحتملين المرتبطين بالحملة عبر campaignId
    // (العزو الدقيق الجديد) أو مطابقة الاسم في source (للسجلات القديمة قبل الربط).
    const leads = await rawQuery<CountRow>(
      `SELECT COUNT(*) AS count FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND ("campaignId"=$2 OR source=$3)`,
      [scope.companyId, id, campaign.name]
    ).catch((e) => { logger.error(e, "marketing query failed"); return [{ count: 0 }] as CountRow[]; });
    res.json(maskFields(req, {
      campaignId: id,
      campaignName: campaign.name,
      spent,
      revenue,
      roas: roas ? Number(roas).toFixed(2) : null,
      leadsGenerated: Number(leads?.[0]?.count || 0),
    }));
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.get("/funnel", authorize({ feature: "marketing", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
    const stageRows = await rawQuery<CountValueRow & { stage: string }>(
      `SELECT stage, COUNT(*) AS count, COALESCE(SUM(value),0) AS value FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND stage = ANY($2::text[]) GROUP BY stage`,
      [cid, STAGES]
    );
    const stageMap = new Map(stageRows.map(r => [r.stage, { count: Number(r.count ?? 0), value: Number(r.value ?? 0) }]));
    const stageData: FunnelStageRow[] = STAGES.map(stage => ({
      stage,
      count: stageMap.get(stage)?.count ?? 0,
      value: stageMap.get(stage)?.value ?? 0,
    }));
    const sourceFunnel = await rawQuery<SourceFunnelRow>(
      `SELECT source, COUNT(*) AS total, COUNT(*) FILTER (WHERE stage='closed_won') AS won, COALESCE(SUM(value) FILTER (WHERE stage='closed_won'),0) AS "wonValue"
       FROM crm_opportunities WHERE "companyId"=$1 AND "deletedAt" IS NULL AND source IS NOT NULL GROUP BY source ORDER BY total DESC`,
      [cid]
    ).catch((e) => { logger.error(e, "marketing query failed"); return [] as SourceFunnelRow[]; });
    const conversionRates = stageData.map((s, i) => {
      const prev = i > 0 ? stageData[i - 1] : null;
      return {
        ...s,
        conversionFromPrev: prev && prev.count > 0 ? ((s.count / prev.count) * 100).toFixed(1) : null,
      };
    });
    res.json(maskFields(req, { stages: conversionRates, sourceFunnel }));
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.patch("/campaigns/:id/revenue", authorize({ feature: "marketing", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(updateRevenueSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { revenue } = parsed;
    const { affectedRows } = await rawExecute(`UPDATE marketing_campaigns SET revenue=$1 WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`, [revenue || 0, id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("الحملة غير موجودة");
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "marketing.campaign.revenue_updated", entity: "marketing_campaigns", entityId: id, details: JSON.stringify({ revenue: revenue || 0 }) }).catch((e) => logger.error(e, "marketing background task failed"));
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "update", entity: "marketing_campaigns", entityId: id, after: { revenue: revenue || 0 } }).catch((e) => logger.error(e, "marketing background task failed"));
    const [row] = await rawQuery<MarketingCampaignRow>(`SELECT * FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.get("/templates", authorize({ feature: "marketing", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<DocumentTemplateRow>(
      `SELECT * FROM document_templates WHERE "companyId" = $1 AND category = 'marketing' AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) {
    handleRouteError(err, res, "failed to list marketing templates");
  }
});

// ════════════════════════════════════════════════════════════════════
//  الإرسال الجماعي للحملات + قوالب واتساب المعتمدة من Meta
//  يعيد استخدام محرك الإرسال الموحّد (outbound_queue + messageSender +
//  عامل الكرون processWhatsAppQueue) — لا محرك جديد ولا تكرار.
// ════════════════════════════════════════════════════════════════════

interface WhatsAppTemplateRow {
  id: number;
  companyId: number;
  name: string;
  language: string;
  category: string;
  status: string;
  headerText: string | null;
  bodyText: string;
  footerText: string | null;
  variableCount: number;
  sampleParams: unknown;
  rejectionReason: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string | null;
}

interface ClientAudienceRow {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  code: string | null;
  nationality: string | null;
  classification: string | null;
}

interface RecipientReportRow {
  id: string | number;
  clientId: number | null;
  recipient: string;
  recipientName: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  queueStatus: string | null;
}

// عدّ المتغيرات الفريدة {{1}}..{{n}} في نص القالب.
function countPlaceholders(text: string): number {
  const set = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) set.add(Number(m[1]));
  return set.size;
}

// استبدال {{i}} بقيمة المعامل المقابل (فهرسة من 1).
function renderTemplate(text: string, params: string[]): string {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_full, d) => params[Number(d) - 1] ?? "");
}

// يتحقّق أن متغيرات القالب متسلسلة {{1}}..{{N}} بدون فجوات ولا صفر (متطلب Meta،
// ويضمن توافق countPlaceholders مع renderTemplate الذي يفهرس بالرقم مباشرة).
function assertContiguousPlaceholders(text: string): void {
  const set = new Set<number>();
  const re = /\{\{\s*(\d+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) set.add(Number(m[1]));
  if (set.has(0)) {
    throw new ValidationError("ترقيم المتغيرات يبدأ من {{1}} وليس {{0}}", { field: "bodyText", fix: "ابدأ ترقيم المتغيرات من 1" });
  }
  const n = set.size;
  for (let i = 1; i <= n; i++) {
    if (!set.has(i)) {
      throw new ValidationError(`متغيرات القالب يجب أن تكون متسلسلة من {{1}} حتى {{${n}}} بدون فجوات`, { field: "bodyText", fix: `استخدم الأرقام من 1 إلى ${n} بالترتيب` });
    }
  }
}

// حقول العميل المتاحة لتعبئة معاملات القالب.
function clientField(c: ClientAudienceRow, field: string): string {
  switch (field) {
    case "name": return c.name ?? "";
    case "code": return c.code ?? "";
    case "nationality": return c.nationality ?? "";
    case "classification": return c.classification ?? "";
    default: return "";
  }
}

// تخصيص نص البريد/الرسائل النصية بمتغيرات بسيطة.
function personalize(text: string, c: ClientAudienceRow): string {
  return text
    .replace(/\{name\}/g, c.name ?? "")
    .replace(/\{code\}/g, c.code ?? "")
    .replace(/\{nationality\}/g, c.nationality ?? "");
}

interface SegmentFilter {
  type?: string | null;
  classification?: string | null;
  source?: string | null;
}

// استعلام الجمهور المشترك بين المعاينة والإرسال — يحترم عزل الشركة،
// يستبعد المحذوف والمحظور، ويشترط وجود قناة تواصل صالحة.
async function resolveAudience(
  companyId: number,
  channel: "whatsapp" | "email" | "sms",
  segment: SegmentFilter | null,
  limit: number | null,
): Promise<ClientAudienceRow[]> {
  const params: unknown[] = [companyId];
  const where: string[] = [
    `c."companyId"=$1`,
    `c."deletedAt" IS NULL`,
    `COALESCE(c."isBlacklisted", false) = false`,
  ];
  if (segment?.type) { params.push(segment.type); where.push(`c.type=$${params.length}`); }
  if (segment?.classification) { params.push(segment.classification); where.push(`c.classification=$${params.length}`); }
  if (segment?.source) { params.push(segment.source); where.push(`c.source=$${params.length}`); }
  // عمود التواصل من قائمة ثابتة (allowlist) — لا حقن SQL.
  const contactCol = channel === "email" ? "email" : "phone";
  where.push(`c."${contactCol}" IS NOT NULL AND c."${contactCol}" <> ''`);
  const cap = Math.min(Math.max(limit ?? 5000, 1), 5000);
  params.push(cap);
  return rawQuery<ClientAudienceRow>(
    `SELECT c.id, c.name, c.phone, c.email, c.code, c.nationality, c.classification
     FROM clients c
     WHERE ${where.join(" AND ")}
     ORDER BY c.id
     LIMIT $${params.length}`,
    params,
  );
}

// ── قوالب واتساب المعتمدة ────────────────────────────────────────────

const createTemplateSchema = z.object({
  name: z.string({ required_error: "اسم القالب مطلوب" }).trim().min(1, "اسم القالب مطلوب").max(120, "اسم القالب طويل جداً"),
  language: z.string().trim().max(10).optional().nullable(),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"], { invalid_type_error: "فئة غير صالحة" }).optional(),
  status: z.enum(["draft", "pending", "approved", "rejected"], { invalid_type_error: "حالة غير صالحة" }).optional(),
  headerText: z.string().trim().max(200).optional().nullable(),
  bodyText: z.string({ required_error: "نص القالب مطلوب" }).trim().min(1, "نص القالب مطلوب").max(2000, "نص القالب طويل جداً"),
  footerText: z.string().trim().max(200).optional().nullable(),
  rejectionReason: z.string().trim().max(500).optional().nullable(),
  sampleParams: z.array(z.string()).max(20).optional().nullable(),
});

const updateTemplateSchema = z.object({
  name: z.string().trim().min(1, "اسم القالب مطلوب").max(120).optional(),
  language: z.string().trim().max(10).optional().nullable(),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]).optional(),
  status: z.enum(["draft", "pending", "approved", "rejected"]).optional(),
  headerText: z.string().trim().max(200).optional().nullable(),
  bodyText: z.string().trim().min(1, "نص القالب مطلوب").max(2000).optional(),
  footerText: z.string().trim().max(200).optional().nullable(),
  rejectionReason: z.string().trim().max(500).optional().nullable(),
  sampleParams: z.array(z.string()).max(20).optional().nullable(),
});

router.get("/whatsapp-templates", authorize({ feature: "marketing", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<WhatsAppTemplateRow>(
      `SELECT * FROM whatsapp_templates WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`,
      [scope.companyId],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.get("/whatsapp-templates/:id", authorize({ feature: "marketing", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<WhatsAppTemplateRow>(
      `SELECT * FROM whatsapp_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!row) throw new NotFoundError("القالب غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.post("/whatsapp-templates", authorize({ feature: "marketing", action: "create" }), async (req, res) => {
  try {
    const parsed = zodParse(createTemplateSchema.safeParse(req.body));
    const scope = req.scope!;
    assertContiguousPlaceholders(parsed.bodyText);
    const varCount = countPlaceholders(parsed.bodyText);
    const r = await rawExecute(
      `INSERT INTO whatsapp_templates
         ("companyId", name, language, category, status, "headerText", "bodyText", "footerText",
          "variableCount", "sampleParams", "rejectionReason", "createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        scope.companyId, parsed.name, parsed.language || "ar", parsed.category || "MARKETING",
        parsed.status || "draft", parsed.headerText ?? null, parsed.bodyText, parsed.footerText ?? null,
        varCount, parsed.sampleParams ? JSON.stringify(parsed.sampleParams) : null,
        parsed.rejectionReason ?? null, scope.userId,
      ],
    ).catch((e: unknown) => {
      if ((e as { code?: string })?.code === "23505") {
        throw new ValidationError("يوجد قالب بنفس الاسم واللغة", { field: "name", fix: "اختر اسماً مختلفاً أو غيّر اللغة" });
      }
      throw e;
    });
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "whatsapp_templates", entityId: r.insertId,
      after: { name: parsed.name, language: parsed.language || "ar", status: parsed.status || "draft" },
    }).catch((e) => logger.error(e, "marketing background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "marketing.whatsapp_template.created", entity: "whatsapp_templates", entityId: r.insertId,
      details: JSON.stringify({ name: parsed.name }),
    }).catch((e) => logger.error(e, "marketing background task failed"));
    const [row] = await rawQuery<WhatsAppTemplateRow>(`SELECT * FROM whatsapp_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, name: parsed.name });
  } catch (err) { handleRouteError(err, res, "Create whatsapp template error:"); }
});

router.patch("/whatsapp-templates/:id", authorize({ feature: "marketing", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(updateTemplateSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number }>(`SELECT id FROM whatsapp_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("القالب غير موجود");
    const sets: string[] = [];
    const params: unknown[] = [];
    if (parsed.name !== undefined) { params.push(parsed.name); sets.push(`name=$${params.length}`); }
    if (parsed.language !== undefined) { params.push(parsed.language); sets.push(`language=$${params.length}`); }
    if (parsed.category !== undefined) { params.push(parsed.category); sets.push(`category=$${params.length}`); }
    if (parsed.status !== undefined) { params.push(parsed.status); sets.push(`status=$${params.length}`); }
    if (parsed.headerText !== undefined) { params.push(parsed.headerText); sets.push(`"headerText"=$${params.length}`); }
    if (parsed.bodyText !== undefined) {
      assertContiguousPlaceholders(parsed.bodyText);
      params.push(parsed.bodyText); sets.push(`"bodyText"=$${params.length}`);
      params.push(countPlaceholders(parsed.bodyText)); sets.push(`"variableCount"=$${params.length}`);
    }
    if (parsed.footerText !== undefined) { params.push(parsed.footerText); sets.push(`"footerText"=$${params.length}`); }
    if (parsed.rejectionReason !== undefined) { params.push(parsed.rejectionReason); sets.push(`"rejectionReason"=$${params.length}`); }
    if (parsed.sampleParams !== undefined) { params.push(parsed.sampleParams ? JSON.stringify(parsed.sampleParams) : null); sets.push(`"sampleParams"=$${params.length}`); }
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    const { affectedRows } = await rawExecute(
      `UPDATE whatsapp_templates SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`,
      params,
    ).catch((e: unknown) => {
      if ((e as { code?: string })?.code === "23505") {
        throw new ValidationError("يوجد قالب بنفس الاسم واللغة", { field: "name", fix: "اختر اسماً مختلفاً أو غيّر اللغة" });
      }
      throw e;
    });
    if (!affectedRows) throw new NotFoundError("القالب غير موجود");
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "update", entity: "whatsapp_templates", entityId: id, after: parsed }).catch((e) => logger.error(e, "marketing background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "marketing.whatsapp_template.updated", entity: "whatsapp_templates", entityId: id, details: JSON.stringify(parsed) }).catch((e) => logger.error(e, "marketing background task failed"));
    const [row] = await rawQuery<WhatsAppTemplateRow>(`SELECT * FROM whatsapp_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

router.delete("/whatsapp-templates/:id", authorize({ feature: "marketing", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE whatsapp_templates SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("القالب غير موجود");
    createAuditLog({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "delete", entity: "whatsapp_templates", entityId: id }).catch((e) => logger.error(e, "marketing background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "marketing.whatsapp_template.deleted", entity: "whatsapp_templates", entityId: id, details: JSON.stringify({ id }) }).catch((e) => logger.error(e, "marketing background task failed"));
    res.json({ message: "تم حذف القالب بنجاح" });
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

// ── معاينة الجمهور ───────────────────────────────────────────────────

router.get("/audience/preview", authorize({ feature: "marketing", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const channel = (["whatsapp", "email", "sms"].includes(String(req.query.channel)) ? String(req.query.channel) : "whatsapp") as "whatsapp" | "email" | "sms";
    const segment: SegmentFilter = {
      type: req.query.type ? String(req.query.type) : null,
      classification: req.query.classification ? String(req.query.classification) : null,
      source: req.query.source ? String(req.query.source) : null,
    };
    const rows = await resolveAudience(scope.companyId, channel, segment, 5000);
    const sample = rows.slice(0, 10).map((r) => ({ id: r.id, name: r.name, classification: r.classification }));
    res.json(maskFields(req, { count: rows.length, channel, sample }));
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

// ── الإرسال الجماعي ──────────────────────────────────────────────────

const paramMappingItem = z.object({
  source: z.enum(["field", "text"]),
  value: z.string().max(500),
});

const broadcastSchema = z.object({
  channel: z.enum(["whatsapp", "email", "sms"], { required_error: "القناة مطلوبة" }),
  templateId: z.coerce.number().int().positive().optional().nullable(),
  language: z.string().trim().max(10).optional().nullable(),
  paramMapping: z.array(paramMappingItem).max(20).optional().nullable(),
  subject: z.string().trim().max(200).optional().nullable(),
  body: z.string().trim().max(4000).optional().nullable(),
  segment: z.object({
    type: z.string().trim().max(30).optional().nullable(),
    classification: z.string().trim().max(30).optional().nullable(),
    source: z.string().trim().max(30).optional().nullable(),
  }).optional().nullable(),
  limit: z.coerce.number().int().positive().max(5000).optional().nullable(),
});

router.post("/campaigns/:id/send", authorize({ feature: "marketing", action: "update" }), async (req, res) => {
  try {
    const parsed = zodParse(broadcastSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [campaign] = await rawQuery<MarketingCampaignRow>(
      `SELECT id, name, status FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!campaign) throw new NotFoundError("الحملة غير موجودة");

    const channel = parsed.channel;

    // قالب واتساب: مطلوب ومعتمد من Meta.
    let template: WhatsAppTemplateRow | null = null;
    if (channel === "whatsapp") {
      if (!parsed.templateId) throw new ValidationError("يجب اختيار قالب واتساب معتمد", { field: "templateId", fix: "اختر قالباً حالته معتمد (approved)" });
      const [t] = await rawQuery<WhatsAppTemplateRow>(`SELECT * FROM whatsapp_templates WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [parsed.templateId, scope.companyId]);
      if (!t) throw new NotFoundError("قالب واتساب غير موجود");
      if (t.status !== "approved") throw new ValidationError("القالب غير معتمد من Meta بعد", { field: "templateId", fix: "لا يمكن الإرسال إلا بقالب حالته معتمد (approved)" });
      const need = countPlaceholders(t.bodyText);
      const provided = (parsed.paramMapping ?? []).length;
      if (provided < need) {
        throw new ValidationError(`القالب يتطلب ${need} متغيّراً وتم تزويد ${provided} فقط`, { field: "paramMapping", fix: `أدخل قيم جميع المتغيرات (${need})` });
      }
      template = t;
    } else if (!parsed.body || !parsed.body.trim()) {
      throw new ValidationError("نص الرسالة مطلوب", { field: "body", fix: "أدخل نص الرسالة" });
    }

    // فحص DLP مرة واحدة للنص الحر (بريد/رسائل). قوالب واتساب معتمدة مسبقاً.
    let baseBody = parsed.body?.trim() ?? "";
    if (channel !== "whatsapp") {
      const dlp = await applyDlp(baseBody, channel, scope.companyId);
      if (dlp.blocked) throw new ValidationError("الرسالة محظورة بموجب سياسة حماية البيانات (DLP)", { field: "body", fix: dlp.reason ?? "عدّل نص الرسالة" });
      baseBody = dlp.body;
    }

    // الجمهور — مع إزالة التكرار حسب قناة التواصل.
    const audience = await resolveAudience(scope.companyId, channel, parsed.segment ?? null, parsed.limit ?? null);
    const seen = new Set<string>();
    const recipients: { client: ClientAudienceRow; contact: string }[] = [];
    for (const c of audience) {
      const contact = (channel === "email" ? c.email : c.phone)?.trim();
      if (!contact) continue;
      if (seen.has(contact)) continue;
      seen.add(contact);
      recipients.push({ client: c, contact });
    }
    if (recipients.length === 0) {
      throw new ValidationError("لا يوجد مستلمون مطابقون للشريحة المحددة", { field: "segment", fix: "وسّع معايير الشريحة أو تحقق من بيانات التواصل" });
    }

    const paramMapping = parsed.paramMapping ?? [];
    const lang = (parsed.language || template?.language || "ar").trim();
    const subject = channel === "email" ? (parsed.subject ?? null) : null;

    // إدراج مجمّع مقسّم (chunked). لضمان عدم التكرار (idempotency): نُدرج جدول
    // المستلمين أولاً كبوابة (ON CONFLICT DO NOTHING RETURNING) فيحسم الفهرس الفريد
    // مَن هو مستلِم جديد فعلاً، ثم نصفّ في السجل/الطابور المستلمين الجُدد فقط —
    // إعادة إرسال نفس الحملة لا تُنشئ رسائل مكرّرة في outbound_queue.
    const CHUNK = 500;
    let queued = 0;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const chunk = recipients.slice(i, i + CHUNK);

      // 1) بوابة منع التكرار: campaign_recipients أولاً؛ نأخذ المستلمين الجُدد فقط.
      const gateVals: string[] = [];
      const gateParams: unknown[] = [];
      for (const { client, contact } of chunk) {
        const b = gateParams.length;
        gateParams.push(scope.companyId, id, client.id, channel, contact, client.name ?? null);
        gateVals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},'queued',NOW(),NOW())`);
      }
      const gateRows = await rawQuery<{ recipient: string }>(
        `INSERT INTO campaign_recipients ("companyId", "campaignId", "clientId", channel, recipient, "recipientName", status, "createdAt", "updatedAt")
         VALUES ${gateVals.join(",")}
         ON CONFLICT ("campaignId", channel, recipient) DO NOTHING
         RETURNING recipient`,
        gateParams,
      );
      const freshSet = new Set(gateRows.map((r) => r.recipient));
      const prepared = chunk
        .filter(({ contact }) => freshSet.has(contact))
        .map(({ client, contact }) => {
          const resolvedParams = channel === "whatsapp"
            ? paramMapping.map((p) => (p.source === "field" ? clientField(client, p.value) : p.value))
            : [];
          const renderedBody = channel === "whatsapp"
            ? renderTemplate(template!.bodyText, resolvedParams)
            : personalize(baseBody, client);
          const templateParams = channel === "whatsapp" ? { lang, body: resolvedParams } : null;
          return { client, contact, renderedBody, templateParams };
        });
      if (prepared.length === 0) continue; // كل مستلمي هذه الدفعة سبق إرسالهم.

      // 2) message_log (يظهر في أرشيف الرسائل الصادرة).
      const mlVals: string[] = [];
      const mlParams: unknown[] = [];
      for (const p of prepared) {
        const b = mlParams.length;
        mlParams.push(scope.companyId, channel, subject, p.renderedBody, p.contact, "clients", p.client.id);
        mlVals.push(`($${b + 1},$${b + 2},'outbound',$${b + 3},$${b + 4},'queued','sent',$${b + 5},$${b + 6},$${b + 7},NOW())`);
      }
      const logRows = await rawQuery<{ id: number; toAddress: string }>(
        `INSERT INTO message_log ("companyId", channel, direction, subject, body, status, folder, "toAddress", "relatedType", "relatedId", "createdAt")
         VALUES ${mlVals.join(",")} RETURNING id, "toAddress"`,
        mlParams,
      );
      const logByAddr = new Map(logRows.map((r) => [r.toAddress, r.id]));

      // 3) outbound_queue (يقرؤه عامل الكرون ويرسل عبر Meta/SMTP).
      const oqVals: string[] = [];
      const oqParams: unknown[] = [];
      for (const p of prepared) {
        const b = oqParams.length;
        oqParams.push(
          scope.companyId, channel, p.contact, p.client.name ?? null, subject, p.renderedBody,
          "marketing_campaign", id, logByAddr.get(p.contact) ?? null,
          template?.name ?? null, p.templateParams ? JSON.stringify(p.templateParams) : null,
        );
        oqVals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},'pending',$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},NOW(),NOW())`);
      }
      const oqRows = await rawQuery<{ id: string; recipient: string }>(
        `INSERT INTO outbound_queue ("companyId", channel, recipient, "recipientName", status, subject, body, "refType", "refId", "messageLogId", "templateName", "templateParams", "createdAt", "updatedAt")
         VALUES ${oqVals.join(",")} RETURNING id, recipient`,
        oqParams,
      );
      const oqByRecipient = new Map(oqRows.map((r) => [r.recipient, r.id]));

      // 4) ربط المفاتيح الخارجية في صفوف المستلمين الجديدة (backfill).
      const linkVals: string[] = [];
      const linkParams: unknown[] = [];
      for (const p of prepared) {
        const b = linkParams.length;
        linkParams.push(p.contact, oqByRecipient.get(p.contact) ?? null, logByAddr.get(p.contact) ?? null);
        linkVals.push(`($${b + 1},$${b + 2}::bigint,$${b + 3}::bigint)`);
      }
      linkParams.push(id, channel, scope.companyId);
      const campIdx = linkParams.length - 2, chanIdx = linkParams.length - 1, coIdx = linkParams.length;
      await rawExecute(
        `UPDATE campaign_recipients cr SET "outboundQueueId"=v.oq, "messageLogId"=v.ml, "updatedAt"=NOW()
         FROM (VALUES ${linkVals.join(",")}) AS v(recipient, oq, ml)
         WHERE cr."campaignId"=$${campIdx} AND cr.channel=$${chanIdx} AND cr."companyId"=$${coIdx} AND cr.recipient=v.recipient`,
        linkParams,
      );
      queued += prepared.length;
    }

    // تفعيل الحملة إن كانت مسودّة.
    if (campaign.status === "draft" || !campaign.status) {
      await rawExecute(`UPDATE marketing_campaigns SET status='active', "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]).catch((e) => logger.error(e, "marketing campaign activate failed"));
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "campaign_recipients", entityId: id,
      after: { campaignId: id, channel, queued, total: recipients.length, templateId: parsed.templateId ?? null },
    }).catch((e) => logger.error(e, "marketing background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "marketing.campaign.broadcast", entity: "marketing_campaigns", entityId: id,
      details: JSON.stringify({ channel, queued, total: recipients.length }),
    }).catch((e) => logger.error(e, "marketing background task failed"));

    res.status(201).json({ campaignId: id, channel, queued, total: recipients.length, message: `تمّت جدولة ${queued} رسالة للإرسال` });
  } catch (err) { handleRouteError(err, res, "Campaign broadcast error:"); }
});

router.get("/campaigns/:id/recipients", authorize({ feature: "marketing", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [campaign] = await rawQuery<{ id: number }>(`SELECT id FROM marketing_campaigns WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!campaign) throw new NotFoundError("الحملة غير موجودة");
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    const [countRow] = await rawQuery<CountRow>(`SELECT COUNT(*) AS count FROM campaign_recipients WHERE "campaignId"=$1 AND "companyId"=$2`, [id, scope.companyId]);
    const rows = await rawQuery<RecipientReportRow>(
      `SELECT cr.id, cr."clientId", cr.recipient, cr."recipientName", cr.status,
              cr."errorMessage", cr."createdAt", oq.status AS "queueStatus"
       FROM campaign_recipients cr
       LEFT JOIN outbound_queue oq ON oq.id = cr."outboundQueueId"
       WHERE cr."campaignId"=$1 AND cr."companyId"=$2
       ORDER BY cr.id DESC
       LIMIT $3 OFFSET $4`,
      [id, scope.companyId, limit, offset],
    );
    res.json(maskFields(req, { data: rows, total: Number(countRow?.count ?? 0), page, pageSize: limit }));
  } catch (err) { handleRouteError(err, res, "marketing"); }
});

export default router;
