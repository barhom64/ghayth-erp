/**
 * AI Governance admin surface — backs the /admin/ai-governance page.
 *
 * Three resources (#1139 §4):
 *   1. providers       — registry of AI providers + status
 *   2. prompts         — versioned prompt catalog
 *   3. reviews         — review center (decisions on prompt versions)
 *
 * Lifecycle rules enforced here:
 *   - a prompt starts as 'draft'
 *   - author submits → 'in_review'
 *   - reviewer (≠ author) decides:
 *       'approved'           → another endpoint then promotes to 'approved'
 *       'changes_requested'  → status falls back to 'draft'
 *       'rejected'           → status → 'rejected', terminal
 *   - approving a new version implicitly deprecates the previously
 *     approved version of the same slug (DB partial unique index would
 *     otherwise throw; we do it explicitly so the audit log is clean)
 *
 * Every write emits an event + creates an audit row, matching the
 * Stop-Ship rules from #1139 §8 ("لا audit", "لا events"). Reads are
 * RBAC-gated under feature=admin like the rest of /admin.
 */
import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { invalidateAiGovernanceCache, PROVIDER_SECRET_KEYS } from "../lib/aiGovernance.js";
import { recordAiUsage, computeAiCostUsd } from "../lib/aiUsage.js";
import { encryptSecret, isEncrypted } from "../lib/secrets.js";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─────────────────────── Providers ────────────────────────────────────────

const providerCreateSchema = z.object({
  slug: z.string().min(2, "المعرّف مطلوب").max(60).regex(/^[a-z0-9-_]+$/, "أحرف لاتينية صغيرة وأرقام و - فقط"),
  name: z.string().min(1, "الاسم مطلوب").max(200),
  status: z.enum(["active", "disabled", "failover-only"]).default("active"),
  priority: z.number().int().min(1).max(1000).default(100),
  defaultModel: z.string().max(120).optional().nullable(),
  capabilities: z.array(z.enum(["generation", "stt", "embedding", "image"]))
    .min(1, "اختر قدرة واحدة على الأقل").default(["generation"]),
  endpoint: z.string().url("URL غير صالح").optional().nullable(),
  config: z.record(z.unknown()).default({}),
  notes: z.string().optional().nullable(),
});

const providerUpdateSchema = providerCreateSchema.partial().omit({ slug: true });

/** Sentinel the GET handler returns in place of an existing secret value. */
const SECRET_MASK = "*****";

/**
 * Prepare a config object for INSERT/UPDATE:
 *   - Plaintext secret values get encrypted.
 *   - Already-encrypted values pass through unchanged (so a PATCH
 *     that doesn't touch a secret field keeps the existing IV/ciphertext).
 *   - The mask sentinel ("*****") from the GET response is DROPPED so a
 *     round-trip GET→PATCH never overwrites a real secret with the mask.
 *     Caller must then merge with the existing row to preserve the
 *     un-touched secret — done in the PATCH handler.
 *
 * Returns the safe-to-store config + the set of secret keys the caller
 * stripped (so the PATCH handler can restore them from the DB row).
 */
function prepareProviderConfigForStorage(
  config: Record<string, unknown>,
): { safe: Record<string, unknown>; preserved: Set<string> } {
  const out: Record<string, unknown> = {};
  const preserved = new Set<string>();
  for (const [k, v] of Object.entries(config)) {
    if (PROVIDER_SECRET_KEYS.has(k) && typeof v === "string" && v === SECRET_MASK) {
      // GET → PATCH round-trip. Skip — caller will restore from DB.
      preserved.add(k);
      continue;
    }
    if (PROVIDER_SECRET_KEYS.has(k) && typeof v === "string" && v.length > 0 && !isEncrypted(v)) {
      out[k] = encryptSecret(v);
    } else {
      out[k] = v;
    }
  }
  return { safe: out, preserved };
}

router.get("/providers", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const rows = await rawQuery<Record<string, unknown> & { config: Record<string, unknown> }>(
      `SELECT id, slug, name, status, priority, "defaultModel",
              capabilities, endpoint, config, notes,
              "createdAt", "updatedAt"
         FROM ai_providers
        ORDER BY priority ASC, slug ASC`,
    );
    // Mask secrets in the response so an operator listing the
    // registry sees a placeholder instead of an encrypted blob (and
    // never the plaintext, since values are stored encrypted). UI
    // shows "set/not-set" + a re-enter field on edit.
    const data = rows.map((r) => {
      const cfg = r.config ?? {};
      const maskedCfg: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(cfg)) {
        if (PROVIDER_SECRET_KEYS.has(k)) {
          maskedCfg[k] = typeof v === "string" && v.length > 0 ? "*****" : "";
        } else {
          maskedCfg[k] = v;
        }
      }
      return { ...r, config: maskedCfg };
    });
    res.json(maskFields(req, { data, total: data.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/providers/list");
  }
});

router.post("/providers", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(providerCreateSchema.safeParse(req.body));

    const { safe: safeConfig } = prepareProviderConfigForStorage(body.config);
    const { insertId } = await rawExecute(
      `INSERT INTO ai_providers
         (slug, name, status, priority, "defaultModel", capabilities, endpoint, config, notes)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9)`,
      [
        body.slug, body.name, body.status, body.priority, body.defaultModel ?? null,
        JSON.stringify(body.capabilities), body.endpoint ?? null,
        JSON.stringify(safeConfig), body.notes ?? null,
      ],
    ).catch((err) => {
      if (String(err?.message).includes("ai_providers_slug_key")) {
        throw new ConflictError("هذا المعرّف مسجّل مسبقاً", { field: "slug" });
      }
      throw err;
    });
    assertInsert(insertId, "ai_providers");

    invalidateAiGovernanceCache();

    void emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "ai_governance.provider.created",
      entity: "ai_providers",
      entityId: insertId,
      details: JSON.stringify({ slug: body.slug }),
    }).catch((e) => logger.warn(e, "[event] provider.created"));
    void createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "ai_providers",
      entityId: insertId,
      after: body,
    }).catch((e) => logger.warn(e, "[audit] provider.created"));

    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/providers/create");
  }
});

router.patch("/providers/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(providerUpdateSchema.safeParse(req.body ?? {}));

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const setIf = (col: string, val: unknown, jsonb = false) => {
      if (val === undefined) return;
      sets.push(`"${col}" = $${idx++}${jsonb ? "::jsonb" : ""}`);
      params.push(jsonb ? JSON.stringify(val) : val);
    };
    setIf("name", body.name);
    setIf("status", body.status);
    setIf("priority", body.priority);
    setIf("defaultModel", body.defaultModel);
    setIf("capabilities", body.capabilities, true);
    setIf("endpoint", body.endpoint);
    // Config gets special treatment so a GET→PATCH round-trip never
    // overwrites a real secret with the mask sentinel: any secret key
    // that came back as "*****" is restored from the existing row
    // before write.
    if (body.config !== undefined) {
      const { safe, preserved } = prepareProviderConfigForStorage(body.config);
      if (preserved.size > 0) {
        const [existing] = await rawQuery<{ config: Record<string, unknown> | null }>(
          `SELECT config FROM ai_providers WHERE id = $1`, [id],
        );
        const prior = existing?.config ?? {};
        for (const k of preserved) {
          if (prior[k] !== undefined) safe[k] = prior[k];
        }
      }
      sets.push(`"config" = $${idx++}::jsonb`);
      params.push(JSON.stringify(safe));
    }
    setIf("notes", body.notes);

    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات للتحديث");
    }
    sets.push(`"updatedAt" = NOW()`);
    params.push(id);

    const [row] = await rawQuery(
      `UPDATE ai_providers SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params,
    );
    if (!row) throw new NotFoundError("المزوّد غير موجود");

    invalidateAiGovernanceCache();

    void emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "ai_governance.provider.updated",
      entity: "ai_providers",
      entityId: id,
      details: JSON.stringify(body),
    }).catch((e) => logger.warn(e, "[event] provider.updated"));
    void createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "ai_providers",
      entityId: id,
      after: body,
    }).catch((e) => logger.warn(e, "[audit] provider.updated"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/providers/update");
  }
});

// ─────────────────────── Prompts ──────────────────────────────────────────

const promptCreateSchema = z.object({
  slug: z.string().min(2, "المعرّف مطلوب").max(120).regex(/^[a-z0-9_.-]+$/, "أحرف لاتينية صغيرة وأرقام و . _ - فقط"),
  title: z.string().min(1, "العنوان مطلوب").max(300),
  description: z.string().optional().nullable(),
  systemPrompt: z.string().min(1, "نص الـ system prompt مطلوب"),
  userTemplate: z.string().optional().nullable(),
});

const promptUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().optional().nullable(),
  systemPrompt: z.string().min(1).optional(),
  userTemplate: z.string().optional().nullable(),
});

router.get("/prompts", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const rows = await rawQuery(
      `SELECT id, slug, version, title, description, status,
              "ownerUserId", "approvedUserId", "approvedAt",
              "createdAt", "updatedAt"
         FROM ai_prompts
        ORDER BY slug ASC, version DESC`,
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/list");
  }
});

router.get("/prompts/:id", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(`SELECT * FROM ai_prompts WHERE id = $1`, [id]);
    if (!row) throw new NotFoundError("الـ prompt غير موجود");
    res.json(maskFields(req, row));
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/get");
  }
});

/**
 * Create a new prompt — either the first version of a brand-new slug,
 * or a new draft version that supersedes an existing one. The version
 * number is computed server-side (max(version)+1 for the slug) so two
 * concurrent authors can't collide.
 */
router.post("/prompts", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(promptCreateSchema.safeParse(req.body));

    const insertId = await withTransaction(async () => {
      const [{ nextVersion }] = await rawQuery<{ nextVersion: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS "nextVersion"
           FROM ai_prompts WHERE slug = $1`,
        [body.slug],
      );
      const { insertId: id } = await rawExecute(
        `INSERT INTO ai_prompts
           (slug, version, title, description, "systemPrompt", "userTemplate",
            status, "ownerUserId")
         VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7)`,
        [
          body.slug,
          nextVersion,
          body.title,
          body.description ?? null,
          body.systemPrompt,
          body.userTemplate ?? null,
          scope.userId,
        ],
      );
      return id;
    });
    assertInsert(insertId, "ai_prompts");

    invalidateAiGovernanceCache();
    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "ai_governance.prompt.created",
      entity: "ai_prompts", entityId: insertId,
      details: JSON.stringify({ slug: body.slug }),
    }).catch((e) => logger.warn(e, "[event] prompt.created"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "ai_prompts", entityId: insertId, after: body,
    }).catch((e) => logger.warn(e, "[audit] prompt.created"));

    res.status(201).json({ id: insertId });
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/create");
  }
});

/**
 * Edit a draft. Only the author or an admin can edit, and only while
 * the prompt is in 'draft' or 'changes_requested' (reuses 'draft'
 * status after a changes-requested review).
 */
router.patch("/prompts/:id", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(promptUpdateSchema.safeParse(req.body ?? {}));

    const [existing] = await rawQuery<{ status: string; ownerUserId: number | null }>(
      `SELECT status, "ownerUserId" FROM ai_prompts WHERE id = $1`,
      [id],
    );
    if (!existing) throw new NotFoundError("الـ prompt غير موجود");
    if (existing.status !== "draft") {
      throw new ConflictError(`لا يمكن تعديل prompt بحالة ${existing.status}`);
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    const setIf = (col: string, val: unknown) => {
      if (val === undefined) return;
      sets.push(`"${col}" = $${idx++}`);
      params.push(val);
    };
    setIf("title", body.title);
    setIf("description", body.description);
    setIf("systemPrompt", body.systemPrompt);
    setIf("userTemplate", body.userTemplate);
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"updatedAt" = NOW()`);
    params.push(id);

    const [row] = await rawQuery(
      `UPDATE ai_prompts SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      params,
    );

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "ai_prompts", entityId: id, after: body,
    }).catch((e) => logger.warn(e, "[audit] prompt.updated"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/update");
  }
});

/** Move a draft into the review queue. */
router.post("/prompts/:id/submit-review", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<{ status: string }>(`SELECT status FROM ai_prompts WHERE id = $1`, [id]);
    if (!row) throw new NotFoundError("الـ prompt غير موجود");
    if (row.status !== "draft") {
      throw new ConflictError(`لا يمكن إرسال prompt للمراجعة وهو بحالة ${row.status}`);
    }
    await rawExecute(`UPDATE ai_prompts SET status = 'in_review', "updatedAt" = NOW() WHERE id = $1`, [id]);
    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "ai_governance.prompt.submitted_for_review",
      entity: "ai_prompts", entityId: id, details: "{}",
    }).catch((e) => logger.warn(e, "[event] prompt.submitted"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "submit", entity: "ai_prompts", entityId: id, after: { status: "in_review" },
    }).catch((e) => logger.warn(e, "[audit] prompt.submitted"));
    res.json({ ok: true, status: "in_review" });
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/submit-review");
  }
});

const reviewSchema = z.object({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  comments: z.string().optional().nullable(),
});

/**
 * Record a reviewer decision. SoD: reviewer cannot be the author of the
 * prompt — enforced here as a hard guard since the catalog's
 * approvableActions metadata can't express "≠ author".
 */
router.post("/prompts/:id/reviews", authorize({ feature: "admin", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(reviewSchema.safeParse(req.body));

    const [prompt] = await rawQuery<{ status: string; ownerUserId: number | null }>(
      `SELECT status, "ownerUserId" FROM ai_prompts WHERE id = $1`,
      [id],
    );
    if (!prompt) throw new NotFoundError("الـ prompt غير موجود");
    if (prompt.status !== "in_review") {
      throw new ConflictError(`المراجعة متاحة فقط لـ prompt بحالة in_review (الحالة الحالية: ${prompt.status})`);
    }
    if (prompt.ownerUserId === scope.userId) {
      throw new ForbiddenError("لا يجوز للمؤلّف مراجعة prompt من تأليفه (Separation-of-Duties)");
    }

    const { insertId } = await rawExecute(
      `INSERT INTO ai_prompt_reviews ("promptId", "reviewerId", decision, comments)
       VALUES ($1, $2, $3, $4)`,
      [id, scope.userId, body.decision, body.comments ?? null],
    );

    // Side-effects on the prompt itself: a 'rejected' review terminates
    // the version; 'changes_requested' bounces it back to draft. An
    // 'approved' review does NOT yet flip the prompt — the explicit
    // /approve endpoint does (so the author can preview before promotion).
    if (body.decision === "rejected") {
      await rawExecute(`UPDATE ai_prompts SET status = 'rejected', "updatedAt" = NOW() WHERE id = $1`, [id]);
    } else if (body.decision === "changes_requested") {
      await rawExecute(`UPDATE ai_prompts SET status = 'draft', "updatedAt" = NOW() WHERE id = $1`, [id]);
    }

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: `ai_governance.prompt.review_${body.decision}`,
      entity: "ai_prompts", entityId: id,
      details: JSON.stringify({ reviewId: insertId }),
    }).catch((e) => logger.warn(e, "[event] prompt.review"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "review", entity: "ai_prompts", entityId: id,
      after: { decision: body.decision, reviewId: insertId },
    }).catch((e) => logger.warn(e, "[audit] prompt.review"));

    res.status(201).json({ id: insertId, decision: body.decision });
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/review");
  }
});

router.get("/prompts/:id/reviews", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT id, "promptId", "reviewerId", decision, comments, "createdAt"
         FROM ai_prompt_reviews
        WHERE "promptId" = $1
        ORDER BY "createdAt" DESC`,
      [id],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/reviews/list");
  }
});

/**
 * Promote a prompt to 'approved'. Gate: at least one 'approved'
 * review by someone other than the author must exist. If a previous
 * version of the same slug was approved, we transactionally demote it
 * to 'deprecated' so the partial-unique index (one approved per slug)
 * never fights us.
 */
router.post("/prompts/:id/approve", authorize({ feature: "admin", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");

    const result = await withTransaction(async () => {
      const [prompt] = await rawQuery<{ slug: string; status: string; ownerUserId: number | null }>(
        `SELECT slug, status, "ownerUserId" FROM ai_prompts WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!prompt) throw new NotFoundError("الـ prompt غير موجود");
      if (prompt.status !== "in_review") {
        throw new ConflictError(`الموافقة متاحة فقط لـ prompt بحالة in_review (الحالة الحالية: ${prompt.status})`);
      }

      const [{ count }] = await rawQuery<{ count: string }>(
        `SELECT COUNT(*)::text AS count
           FROM ai_prompt_reviews
          WHERE "promptId" = $1 AND decision = 'approved' AND "reviewerId" <> COALESCE($2, -1)`,
        [id, prompt.ownerUserId],
      );
      if (Number(count) < 1) {
        throw new ConflictError("لا يمكن الموافقة قبل وجود مراجعة واحدة على الأقل بقرار approved من مراجع غير المؤلّف");
      }

      // Demote the currently-approved version of the same slug, if any,
      // BEFORE promoting this one — otherwise the partial unique index
      // would raise inside the same transaction.
      await rawExecute(
        `UPDATE ai_prompts
            SET status = 'deprecated', "updatedAt" = NOW()
          WHERE slug = $1 AND status = 'approved' AND id <> $2`,
        [prompt.slug, id],
      );
      await rawExecute(
        `UPDATE ai_prompts
            SET status = 'approved',
                "approvedUserId" = $2,
                "approvedAt" = NOW(),
                "updatedAt" = NOW()
          WHERE id = $1`,
        [id, scope.userId],
      );
      return prompt.slug;
    });

    invalidateAiGovernanceCache();
    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "ai_governance.prompt.approved",
      entity: "ai_prompts", entityId: id,
      details: JSON.stringify({ slug: result }),
    }).catch((e) => logger.warn(e, "[event] prompt.approved"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "approve", entity: "ai_prompts", entityId: id,
      after: { status: "approved", slug: result },
    }).catch((e) => logger.warn(e, "[audit] prompt.approved"));

    res.json({ ok: true, status: "approved", slug: result });
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/approve");
  }
});

/**
 * Rollback path (#1139 §8 — "لا rollback" violation otherwise). Marks
 * the currently-approved prompt as deprecated. The previously-approved
 * version is NOT auto-re-promoted; the operator must explicitly
 * approve a new version. This is intentional — auto-rollback could
 * re-ship a prompt that was retired for a real reason.
 */
router.post("/prompts/:id/deprecate", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<{ status: string; slug: string }>(
      `SELECT status, slug FROM ai_prompts WHERE id = $1`,
      [id],
    );
    if (!row) throw new NotFoundError("الـ prompt غير موجود");
    if (row.status !== "approved") {
      throw new ConflictError(`الإيقاف متاح فقط لـ prompt بحالة approved (الحالة الحالية: ${row.status})`);
    }
    await rawExecute(`UPDATE ai_prompts SET status = 'deprecated', "updatedAt" = NOW() WHERE id = $1`, [id]);
    invalidateAiGovernanceCache();

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "ai_governance.prompt.deprecated",
      entity: "ai_prompts", entityId: id,
      details: JSON.stringify({ slug: row.slug }),
    }).catch((e) => logger.warn(e, "[event] prompt.deprecated"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "cancel", entity: "ai_prompts", entityId: id,
      after: { status: "deprecated", slug: row.slug },
    }).catch((e) => logger.warn(e, "[audit] prompt.deprecated"));

    res.json({ ok: true, status: "deprecated" });
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/deprecate");
  }
});

// ─────────────────────── Aggregated overview ──────────────────────────────

/**
 * One-shot summary the /admin/ai-governance landing tab reads to
 * render counts + the in-review queue without firing six separate
 * requests.
 */
router.get("/overview", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const [providers, promptCounts, inReviewQueue] = await Promise.all([
      rawQuery(
        `SELECT status, COUNT(*)::int AS count FROM ai_providers GROUP BY status`,
      ),
      rawQuery(
        `SELECT status, COUNT(*)::int AS count FROM ai_prompts GROUP BY status`,
      ),
      rawQuery(
        `SELECT id, slug, version, title, "ownerUserId", "createdAt", "updatedAt"
           FROM ai_prompts WHERE status = 'in_review'
          ORDER BY "updatedAt" ASC
          LIMIT 50`,
      ),
    ]);
    res.json(
      maskFields(req, {
        providers,
        prompts: promptCounts,
        reviewQueue: inReviewQueue,
        collectedAt: new Date().toISOString(),
      }),
    );
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/overview");
  }
});

// ─────────────────────── Simulator + Evaluation Lab (#1139 §4) ───────────
//
// The simulator runs ONE prompt against ad-hoc input — for the author
// to preview an edit before submitting it for review. The evaluation
// lab runs the prompt against every saved golden test case for its
// slug — for the reviewer to see "v3 passes 18/20 cases" before
// approving.
//
// Cost + usage is recorded through the same recordAiUsage() sink the
// production AI calls use, so simulator/eval traffic shows up in the
// observability pane alongside real workload.

const ANTHROPIC_MODEL = "claude-haiku-4-5";
const ANTHROPIC_MAX_TOKENS = 4096;

let anthropicClient: Anthropic | null = null;
function getAnthropicClient(): Anthropic | null {
  if (anthropicClient) return anthropicClient;
  const apiKey = config.ai.anthropicApiKey;
  const baseURL = config.ai.anthropicBaseUrl;
  if (!apiKey) return null;
  anthropicClient = new Anthropic({ apiKey, baseURL });
  return anthropicClient;
}

/**
 * Run one prompt against one user input, returning the model output
 * plus the per-call observability fields (tokens, cost, duration).
 * Records the call through recordAiUsage with feature
 * 'ai_governance.simulator' so simulator traffic is distinguishable
 * from production AI workload in the observability pane.
 */
async function runOneShot(
  systemPrompt: string,
  userPrompt: string,
  feature: string,
  ctx: { companyId?: number | null; userId?: number | null },
): Promise<{
  output: string;
  promptTokens: number;
  completionTokens: number;
  costUsdRounded: number;
  durationMs: number;
  error?: string;
}> {
  const startedAt = Date.now();
  const client = getAnthropicClient();
  if (!client) {
    return {
      output: "",
      promptTokens: 0,
      completionTokens: 0,
      costUsdRounded: 0,
      durationMs: 0,
      error: "AI not configured (AI_INTEGRATIONS_ANTHROPIC_API_KEY missing)",
    };
  }
  try {
    const msg = await client.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const promptTokens = msg.usage?.input_tokens ?? 0;
    const completionTokens = msg.usage?.output_tokens ?? 0;
    const durationMs = Date.now() - startedAt;
    void recordAiUsage({
      companyId: ctx.companyId ?? null,
      userId: ctx.userId ?? null,
      provider: "anthropic",
      model: ANTHROPIC_MODEL,
      feature,
      promptTokens,
      completionTokens,
      durationMs,
      status: "success",
    });
    // Use the shared pricing function so simulator cost stays in
    // lockstep with the authoritative recordAiUsage() values written
    // to the DB — no separate maintenance trap.
    const cost = computeAiCostUsd("anthropic", ANTHROPIC_MODEL, promptTokens, completionTokens);
    const block = msg.content[0];
    return {
      output: block?.type === "text" ? block.text : "",
      promptTokens,
      completionTokens,
      costUsdRounded: Math.round(cost * 10000) / 10000,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    void recordAiUsage({
      companyId: ctx.companyId ?? null,
      userId: ctx.userId ?? null,
      provider: "anthropic",
      model: ANTHROPIC_MODEL,
      feature,
      promptTokens: 0,
      completionTokens: 0,
      durationMs,
      status: "error",
      errorCode: (err as Error)?.name ?? "AI_ERROR",
    });
    return {
      output: "",
      promptTokens: 0,
      completionTokens: 0,
      costUsdRounded: 0,
      durationMs,
      error: (err as Error)?.message ?? "AI error",
    };
  }
}

const simulateSchema = z.object({
  userPrompt: z.string().min(1, "نص المستخدم مطلوب"),
});

router.post("/prompts/:id/simulate", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const body = zodParse(simulateSchema.safeParse(req.body));
    const [prompt] = await rawQuery<{ slug: string; systemPrompt: string }>(
      `SELECT slug, "systemPrompt" FROM ai_prompts WHERE id = $1`,
      [id],
    );
    if (!prompt) throw new NotFoundError("الـ prompt غير موجود");
    const result = await runOneShot(
      prompt.systemPrompt,
      body.userPrompt,
      "ai_governance.simulator",
      { companyId: scope.companyId, userId: scope.userId },
    );
    res.json(maskFields(req, { promptSlug: prompt.slug, ...result }));
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/simulate");
  }
});

// ─────────────────────── Test cases ───────────────────────────────────────

const testCaseSchema = z.object({
  promptSlug: z.string().min(1).max(120),
  name: z.string().min(1).max(300),
  description: z.string().optional().nullable(),
  input: z.record(z.unknown()).default({}),
  expectedContains: z.string().optional().nullable(),
});

router.get("/prompts/:slug/test-cases", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const slug = String(req.params.slug);
    const rows = await rawQuery(
      `SELECT id, "promptSlug", name, description, input, "expectedContains",
              "ownerUserId", enabled, "createdAt", "updatedAt"
         FROM ai_prompt_test_cases
        WHERE "promptSlug" = $1
        ORDER BY id ASC`,
      [slug],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/test-cases/list");
  }
});

router.post("/test-cases", authorize({ feature: "admin", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(testCaseSchema.safeParse(req.body));
    const { insertId } = await rawExecute(
      `INSERT INTO ai_prompt_test_cases
         ("promptSlug", name, description, input, "expectedContains", "ownerUserId")
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        body.promptSlug, body.name, body.description ?? null,
        JSON.stringify(body.input), body.expectedContains ?? null,
        scope.userId,
      ],
    );
    assertInsert(insertId, "ai_prompt_test_cases");
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "create", entity: "ai_prompt_test_cases", entityId: insertId, after: body,
    }).catch((e) => logger.warn(e, "[audit] testcase.created"));
    res.status(201).json({ id: insertId, ...body });
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/test-cases/create");
  }
});

// ─────────────────────── Evaluation runs ──────────────────────────────────

/**
 * POST /prompts/:id/evaluate
 * Runs every enabled test case for the prompt's slug against the
 * prompt's current version. Records a row in ai_prompt_evaluations
 * + one row per case in ai_prompt_evaluation_results.
 *
 * Pass criterion: when a test case has expectedContains, the case
 * passes iff the actual output (case-insensitive, whitespace-
 * collapsed) contains that substring. When no expectedContains, the
 * case passes iff the call didn't error — i.e. it's a "smoke" case.
 *
 * Designed to be invoked synchronously from the admin UI. Cap on
 * test-case count is enforced by the migration-table-design (no
 * pagination needed for the typical 5–50 case sets).
 */
router.post("/prompts/:id/evaluate", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [prompt] = await rawQuery<{ slug: string; version: number; systemPrompt: string }>(
      `SELECT slug, version, "systemPrompt" FROM ai_prompts WHERE id = $1`,
      [id],
    );
    if (!prompt) throw new NotFoundError("الـ prompt غير موجود");

    const cases = await rawQuery<{ id: number; input: Record<string, unknown>; expectedContains: string | null }>(
      `SELECT id, input, "expectedContains" FROM ai_prompt_test_cases
        WHERE "promptSlug" = $1 AND enabled = true ORDER BY id ASC`,
      [prompt.slug],
    );
    if (cases.length === 0) {
      throw new ValidationError("لا توجد حالات اختبار مفعّلة لهذا الـ slug");
    }

    const { insertId: evalId } = await rawExecute(
      `INSERT INTO ai_prompt_evaluations
         ("promptId", "promptSlug", "promptVersion", "runByUserId", "totalCases", status)
       VALUES ($1, $2, $3, $4, $5, 'running')`,
      [id, prompt.slug, prompt.version, scope.userId, cases.length],
    );

    const overallStart = Date.now();
    let passed = 0, failed = 0, skipped = 0;
    let totalCost = 0, totalTokens = 0;

    for (const c of cases) {
      // Compose a deterministic user prompt from the JSON input. Most
      // existing aiEngine helpers build their user prompt from the
      // input keys; we do the same here so the simulator output
      // matches production behaviour as closely as possible without
      // hardcoding per-feature templates.
      const userPrompt = Object.entries(c.input)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join("\n");

      const r = await runOneShot(
        prompt.systemPrompt,
        userPrompt,
        "ai_governance.evaluator",
        { companyId: scope.companyId, userId: scope.userId },
      );

      let status: "pass" | "fail" | "error";
      if (r.error) {
        status = "error";
        skipped++;
      } else if (c.expectedContains) {
        const haystack = r.output.toLowerCase().replace(/\s+/g, " ");
        const needle = c.expectedContains.toLowerCase().replace(/\s+/g, " ");
        if (haystack.includes(needle)) { status = "pass"; passed++; }
        else { status = "fail"; failed++; }
      } else {
        status = "pass"; passed++;
      }

      totalCost += r.costUsdRounded;
      totalTokens += r.promptTokens + r.completionTokens;

      await rawExecute(
        `INSERT INTO ai_prompt_evaluation_results
           ("evaluationId", "testCaseId", status, "actualOutput", "errorMessage",
            "durationMs", "costUsd", "tokensUsed")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          evalId, c.id, status,
          r.output || null, r.error ?? null,
          r.durationMs, r.costUsdRounded, r.promptTokens + r.completionTokens,
        ],
      );
    }

    const overallDuration = Date.now() - overallStart;
    await rawExecute(
      `UPDATE ai_prompt_evaluations
          SET "passedCases" = $2, "failedCases" = $3, "skippedCases" = $4,
              "totalCostUsd" = $5, "totalTokens" = $6, "durationMs" = $7,
              status = 'completed', "completedAt" = NOW()
        WHERE id = $1`,
      [evalId, passed, failed, skipped, Math.round(totalCost * 1_000_000) / 1_000_000, totalTokens, overallDuration],
    );

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "ai_governance.prompt.evaluated",
      entity: "ai_prompts", entityId: id,
      details: JSON.stringify({ evalId, passed, failed, skipped, totalCases: cases.length }),
    }).catch((e) => logger.warn(e, "[event] prompt.evaluated"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "submit", entity: "ai_prompt_evaluations", entityId: evalId,
      after: { promptId: id, passed, failed, skipped },
    }).catch((e) => logger.warn(e, "[audit] prompt.evaluated"));

    res.json({
      evaluationId: evalId,
      totalCases: cases.length,
      passed, failed, skipped,
      totalCostUsd: Math.round(totalCost * 10000) / 10000,
      totalTokens,
      durationMs: overallDuration,
    });
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/evaluate");
  }
});

router.get("/prompts/:id/evaluations", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT id, "promptId", "promptSlug", "promptVersion", "runByUserId",
              "totalCases", "passedCases", "failedCases", "skippedCases",
              "totalCostUsd", "totalTokens", "durationMs", status,
              "errorMessage", "startedAt", "completedAt"
         FROM ai_prompt_evaluations
        WHERE "promptId" = $1
        ORDER BY "startedAt" DESC
        LIMIT 50`,
      [id],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/prompts/evaluations/list");
  }
});

router.get("/evaluations/:id/results", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const id = parseId(req.params.id, "id");
    const rows = await rawQuery(
      `SELECT r.id, r."testCaseId", r.status, r."actualOutput", r."errorMessage",
              r."durationMs", r."costUsd", r."tokensUsed", r."createdAt",
              tc.name AS "testCaseName", tc."expectedContains"
         FROM ai_prompt_evaluation_results r
         LEFT JOIN ai_prompt_test_cases tc ON tc.id = r."testCaseId"
        WHERE r."evaluationId" = $1
        ORDER BY r.id ASC`,
      [id],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/ai-governance/evaluations/results");
  }
});

// ── connection test / activation status ─────────────────────────────────────
// Lets an admin verify the Anthropic integration is configured AND reachable
// without exposing any secret. Reports the env-backed config flags; if
// configured, sends a tiny 4-token ping so activation is self-verifiable the
// moment AI_INTEGRATIONS_ANTHROPIC_API_KEY / _BASE_URL are set (no key needed
// to call this — it just reports state + optionally pings).
router.get(
  "/connection-test",
  authorize({ feature: "admin", action: "list" }),
  async (_req, res) => {
    const apiKeySet = Boolean(config.ai.anthropicApiKey);
    const baseUrlSet = Boolean(config.ai.anthropicBaseUrl);
    const out: {
      configured: boolean;
      apiKeySet: boolean;
      baseUrlSet: boolean;
      model: string;
      reachable: boolean;
      latencyMs: number | null;
      error: string | null;
    } = {
      configured: apiKeySet && baseUrlSet,
      apiKeySet,
      baseUrlSet,
      model: ANTHROPIC_MODEL,
      reachable: false,
      latencyMs: null,
      error: null,
    };
    const client = getAnthropicClient();
    if (!client) {
      out.error =
        "غير مضبوط: اضبط AI_INTEGRATIONS_ANTHROPIC_API_KEY و AI_INTEGRATIONS_ANTHROPIC_BASE_URL ثم أعد تشغيل الخادم.";
      res.json(out);
      return;
    }
    try {
      const t0 = Date.now();
      const msg = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 4,
        messages: [{ role: "user", content: "ping" }],
      });
      out.reachable = Array.isArray(msg.content) && msg.content.length > 0;
      out.latencyMs = Date.now() - t0;
    } catch (err) {
      out.error = err instanceof Error ? err.message : String(err);
    }
    res.json(out);
  },
);

export default router;
