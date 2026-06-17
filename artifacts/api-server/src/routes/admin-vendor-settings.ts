/**
 * Admin → Vendor Settings hub (#1139 §6).
 *
 * Single CRUD surface for the vendor_secrets table — every external
 * integration the operator might wire (PBX webhook signing, WhatsApp,
 * SMTP, web push, SIEM forwarder, ZATCA endpoints). Each slug renders
 * as its own card in /admin/vendor-settings with a form for the keys
 * the seed declared.
 *
 * Secrets are encrypted at rest via secrets.ts (same pattern
 * /admin/ai-governance uses) and masked as "*****" on read so the GET
 * response never leaks an encrypted blob. A round-trip GET → PATCH
 * that leaves "*****" in the form preserves the existing value.
 */
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  zodParse,
} from "../lib/errorHandler.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { invalidateVendorSettingsCache, getVendorConfig, type VendorSlug } from "../lib/vendorSettings.js";
import {
  resolveSystemSmtpConfig,
  formatFromHeader,
  scrubSmtpSecrets,
  smtpTransportOptions,
} from "../lib/systemSmtp.js";
import { encryptSecret, isEncrypted } from "../lib/secrets.js";
import { logger } from "../lib/logger.js";

const router = Router();

/** Same set vendorSettings.ts uses for encryption. Kept in sync by hand. */
const SECRET_KEYS = new Set<string>([
  "apiKey", "accessToken", "secret", "authToken", "token",
  "appSecret", "clientSecret", "privateKey",
  "webhookSecret", "verifyToken", "password",
  "authHeader",
]);

const SECRET_MASK = "*****";

/**
 * Prepare a submitted config for storage:
 *   - plaintext secret values get encrypted
 *   - already-encrypted blobs pass through (PATCH that doesn't touch
 *     a secret field keeps the existing ciphertext)
 *   - "*****" sentinel is DROPPED (preserved set), to be restored from
 *     the existing row in the PATCH handler — prevents the mask from
 *     overwriting a real secret on a GET → form → PATCH round-trip
 */
function prepareConfigForStorage(
  config: Record<string, unknown>,
): { safe: Record<string, unknown>; preserved: Set<string> } {
  const out: Record<string, unknown> = {};
  const preserved = new Set<string>();
  for (const [k, v] of Object.entries(config)) {
    if (SECRET_KEYS.has(k) && typeof v === "string" && v === SECRET_MASK) {
      preserved.add(k);
      continue;
    }
    if (SECRET_KEYS.has(k) && typeof v === "string" && v.length > 0 && !isEncrypted(v)) {
      out[k] = encryptSecret(v);
    } else {
      out[k] = v;
    }
  }
  return { safe: out, preserved };
}

/** Mask every secret key in `config` for response. */
function maskConfigForResponse(config: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (SECRET_KEYS.has(k)) {
      out[k] = typeof v === "string" && v.length > 0 ? SECRET_MASK : "";
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ─────────────────────── List / get ───────────────────────────────────────

router.get("/", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const rows = await rawQuery<{
      id: number; slug: string; name: string; description: string | null;
      status: string; config: Record<string, unknown>; createdAt: string; updatedAt: string;
    }>(
      `SELECT id, slug, name, description, status, config, "createdAt", "updatedAt"
         FROM vendor_secrets
        WHERE "companyId" IS NULL
        ORDER BY slug ASC`,
    );
    // For each row, also report whether the env fallback would
    // satisfy it (lets the UI distinguish "no DB row, env-driven"
    // from "no config at all").
    const data = await Promise.all(rows.map(async (r) => {
      const resolved = await getVendorConfig(r.slug as VendorSlug);
      return {
        ...r,
        config: maskConfigForResponse(r.config),
        effectiveSource: resolved.source,
        effectiveActive: resolved.active,
      };
    }));
    res.json(maskFields(req, { data, total: data.length }));
  } catch (err) {
    handleRouteError(err, res, "admin/vendor-settings/list");
  }
});

router.get("/:slug", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const slug = String(req.params.slug);
    const [row] = await rawQuery<{
      id: number; slug: string; name: string; description: string | null;
      status: string; config: Record<string, unknown>; createdAt: string; updatedAt: string;
    }>(
      `SELECT id, slug, name, description, status, config, "createdAt", "updatedAt"
         FROM vendor_secrets WHERE slug = $1 AND "companyId" IS NULL`,
      [slug],
    );
    if (!row) throw new NotFoundError("الإعداد غير موجود");
    const resolved = await getVendorConfig(slug as VendorSlug);
    res.json(maskFields(req, {
      ...row,
      config: maskConfigForResponse(row.config),
      effectiveSource: resolved.source,
      effectiveActive: resolved.active,
    }));
  } catch (err) {
    handleRouteError(err, res, "admin/vendor-settings/get");
  }
});

// ─────────────────────── Update ───────────────────────────────────────────

const updateSchema = z.object({
  status: z.enum(["active", "disabled"]).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  config: z.record(z.unknown()).optional(),
});

router.patch("/:slug", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const slug = String(req.params.slug);
    const body = zodParse(updateSchema.safeParse(req.body ?? {}));

    const [existing] = await rawQuery<{ id: number; config: Record<string, unknown> | null }>(
      `SELECT id, config FROM vendor_secrets WHERE slug = $1 AND "companyId" IS NULL`,
      [slug],
    );
    if (!existing) throw new NotFoundError("الإعداد غير موجود");

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (body.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(body.status);
    }
    if (body.name !== undefined) {
      sets.push(`name = $${idx++}`);
      params.push(body.name);
    }
    if (body.description !== undefined) {
      sets.push(`description = $${idx++}`);
      params.push(body.description);
    }
    if (body.config !== undefined) {
      const { safe, preserved } = prepareConfigForStorage(body.config);
      // Restore preserved secret keys from the existing row so a
      // round-trip GET (returns "*****") → PATCH never overwrites
      // a real value with the mask.
      if (preserved.size > 0) {
        const prior = existing.config ?? {};
        for (const k of preserved) {
          if (prior[k] !== undefined) safe[k] = prior[k];
        }
      }
      sets.push(`config = $${idx++}::jsonb`);
      params.push(JSON.stringify(safe));
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"updatedAt" = NOW()`);
    params.push(slug);

    const [row] = await rawQuery(
      `UPDATE vendor_secrets SET ${sets.join(", ")} WHERE slug = $${idx} AND "companyId" IS NULL RETURNING *`,
      params,
    );
    invalidateVendorSettingsCache();

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "vendor_settings.updated",
      entity: "vendor_secrets", entityId: existing.id,
      details: JSON.stringify({ slug, fields: Object.keys(body) }),
    }).catch((e) => logger.warn(e, "[event] vendor_settings.updated"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "vendor_secrets", entityId: existing.id,
      after: { slug, ...body, config: body.config ? "[masked]" : undefined },
    }).catch((e) => logger.warn(e, "[audit] vendor_settings.updated"));

    res.json({ ...row, config: maskConfigForResponse(row.config) });
  } catch (err) {
    handleRouteError(err, res, "admin/vendor-settings/update");
  }
});

// ─────────────────────── Test connectivity ────────────────────────────────

/**
 * POST /:slug/test — vendor-specific connectivity probe. Each slug has
 * a synthetic check that confirms the secrets are well-formed without
 * actually doing the production action. Reads the LIVE merged config
 * (DB → env fallback) so the operator's UI button reflects the
 * runtime path, not the form's draft state.
 */
router.post("/:slug/test", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const slug = String(req.params.slug) as VendorSlug;
    const resolved = await getVendorConfig(slug);
    if (!resolved.active) {
      res.json({
        ok: false,
        message: "غير مفعّل — اضبط الحقول وفعّل الحالة من الواجهة أو متغيّرات البيئة.",
        source: resolved.source,
      });
      return;
    }
    const result = await runVendorTest(slug, resolved.config);
    res.json({ ...result, source: resolved.source });
  } catch (err) {
    handleRouteError(err, res, "admin/vendor-settings/test");
  }
});

// ─────────────────────── Real SMTP test send (#2137) ──────────────────────

const testSendSchema = z.object({
  to: z.string().email("صيغة بريد المستلم غير صحيحة").max(300),
});

/**
 * POST /smtp/test-send — the REAL proof: resolve through the exact
 * resolver processEmailQueue uses, verify the login, then deliver an
 * actual test message to an operator-chosen recipient. The outcome is
 * persisted on the vendor_secrets row (lastTestAt / lastTestStatus /
 * lastTestError / lastTestSource — non-secret keys, visible in the UI
 * card) and audited WITHOUT any secret material.
 */
router.post("/smtp/test-send", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(testSendSchema.safeParse(req.body ?? {}));

    const smtp = await resolveSystemSmtpConfig();
    let ok = false;
    let message: string;
    let fromUsed: string | null = null;

    if (!smtp) {
      message = "لا يوجد إعداد SMTP صالح — اضبط بريد النظام من البطاقة أعلاه وفعّل الحالة، أو وفّر متغيّرات البيئة.";
    } else {
      fromUsed = formatFromHeader(smtp);
      try {
        const { createTransport } = await import("nodemailer");
        const transporter = createTransport(smtpTransportOptions(smtp));
        await transporter.verify();
        await transporter.sendMail({
          from: fromUsed,
          to: body.to,
          ...(smtp.replyTo ? { replyTo: smtp.replyTo } : {}),
          subject: "رسالة اختبار من نظام غيث",
          html: `<p>هذه رسالة اختبار حقيقية من بريد نظام غيث.</p><p>المصدر: ${smtp.source} — ${new Date().toISOString()}</p>`,
        });
        ok = true;
        message = `أُرسلت رسالة اختبار حقيقية إلى ${body.to} من ${fromUsed}.`;
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        message = `فشل الإرسال الحقيقي: ${scrubSmtpSecrets(raw, smtp)}`;
      }
    }

    // Persist the outcome on the row (jsonb merge keeps the secrets
    // untouched). These keys are NOT in SECRET_KEYS so the UI sees them.
    await rawExecute(
      `UPDATE vendor_secrets
          SET config = COALESCE(config, '{}'::jsonb) || $1::jsonb, "updatedAt" = NOW()
        WHERE slug = 'smtp'`,
      [JSON.stringify({
        lastTestAt: new Date().toISOString(),
        lastTestStatus: ok ? "ok" : "failed",
        lastTestError: ok ? null : message,
        lastTestSource: smtp?.source ?? "none",
      })],
    ).catch((e) => logger.warn(e, "[vendor-settings] persisting smtp test outcome failed"));
    invalidateVendorSettingsCache();

    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: ok ? "vendor_settings.smtp.test_send_ok" : "vendor_settings.smtp.test_send_failed",
      entity: "vendor_secrets", entityId: 0,
      details: JSON.stringify({ to: body.to.replace(/.(?=.{4})/g, "*"), source: smtp?.source ?? "none", ok }),
    }).catch((e) => logger.warn(e, "[event] smtp.test_send"));
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "update", entity: "vendor_secrets", entityId: 0,
      after: { slug: "smtp", testSend: ok ? "ok" : "failed", source: smtp?.source ?? "none" },
    }).catch((e) => logger.warn(e, "[audit] smtp.test_send"));

    res.status(ok ? 200 : 422).json({
      ok,
      message,
      source: smtp?.source ?? "none",
      from: fromUsed,
    });
  } catch (err) {
    handleRouteError(err, res, "admin/vendor-settings/smtp/test-send");
  }
});

// ─────────────────── Per-company SMTP ("بريد الشركة") — migration 389 ───────
// A company admin manages THEIR OWN outbound mailbox. scope.companyId scopes
// every read/write, so no one touches another tenant's row or the platform
// default. When status='active', resolveSystemSmtpConfig (step 0) makes this
// row OVERRIDE the platform mailbox for this company only.

router.get("/company/smtp", authorize({ feature: "admin", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<{ id: number; status: string; config: Record<string, unknown> }>(
      `SELECT id, status, config FROM vendor_secrets WHERE slug = 'smtp' AND "companyId" = $1`,
      [scope.companyId],
    );
    res.json(maskFields(req, {
      data: row
        ? { configured: true, status: row.status, config: maskConfigForResponse(row.config) }
        : { configured: false, status: "disabled", config: {} },
    }));
  } catch (err) {
    handleRouteError(err, res, "admin/vendor-settings/company-smtp/get");
  }
});

const companySmtpSchema = z.object({
  status: z.enum(["active", "disabled"]).optional(),
  config: z.record(z.unknown()).optional(),
});

router.patch("/company/smtp", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(companySmtpSchema.safeParse(req.body ?? {}));
    const [existing] = await rawQuery<{ id: number; config: Record<string, unknown> | null }>(
      `SELECT id, config FROM vendor_secrets WHERE slug = 'smtp' AND "companyId" = $1`,
      [scope.companyId],
    );

    let finalConfig: Record<string, unknown> = (existing?.config ?? {}) as Record<string, unknown>;
    if (body.config !== undefined) {
      // Encrypt secrets; restore masked ("*****") secret keys from the prior
      // row so a GET→PATCH round-trip never overwrites a real value.
      const { safe, preserved } = prepareConfigForStorage(body.config);
      const prior = (existing?.config ?? {}) as Record<string, unknown>;
      for (const k of preserved) if (prior[k] !== undefined) safe[k] = prior[k];
      finalConfig = safe;
    }

    if (existing) {
      await rawExecute(
        `UPDATE vendor_secrets SET config = $1::jsonb, status = COALESCE($2, status), "updatedAt" = NOW()
           WHERE id = $3 AND "companyId" = $4`,
        [JSON.stringify(finalConfig), body.status ?? null, existing.id, scope.companyId],
      );
    } else {
      await rawExecute(
        `INSERT INTO vendor_secrets (slug, name, description, status, config, "companyId")
         VALUES ('smtp', $1, 'بريد صادر خاص بالشركة — يتقدّم على بريد النظام.', $2, $3::jsonb, $4)`,
        [`بريد الشركة #${scope.companyId}`, body.status ?? "disabled", JSON.stringify(finalConfig), scope.companyId],
      );
    }
    invalidateVendorSettingsCache();

    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: existing ? "update" : "create", entity: "vendor_secrets", entityId: existing?.id ?? 0,
      after: { slug: "smtp", scope: "company", status: body.status, config: body.config ? "[masked]" : undefined },
    }).catch((e) => logger.warn(e, "[audit] company_smtp.updated"));
    void emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "vendor_settings.company_smtp.updated", entity: "vendor_secrets", entityId: existing?.id ?? 0,
      details: JSON.stringify({ status: body.status }),
    }).catch((e) => logger.warn(e, "[event] company_smtp.updated"));

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(err, res, "admin/vendor-settings/company-smtp/update");
  }
});

router.post("/company/smtp/test", authorize({ feature: "admin", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // resolveSystemSmtpConfig(companyId) returns the company row first (step 0),
    // so this verifies the company's own mailbox end-to-end (full SMTP login).
    const smtp = await resolveSystemSmtpConfig(scope.companyId);
    if (!smtp) {
      res.status(422).json({ ok: false, message: "لا يوجد إعداد SMTP صالح لهذه الشركة — اضبط الحقول وفعّل الحالة." });
      return;
    }
    try {
      const { createTransport } = await import("nodemailer");
      await createTransport(smtpTransportOptions(smtp)).verify();
      res.json({ ok: true, message: `تم تسجيل الدخول إلى ${smtp.host}:${smtp.port} بنجاح.`, source: smtp.source });
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      res.status(422).json({ ok: false, message: `فشلت مصادقة SMTP: ${scrubSmtpSecrets(raw, smtp)}`, source: smtp.source });
    }
  } catch (err) {
    handleRouteError(err, res, "admin/vendor-settings/company-smtp/test");
  }
});

async function runVendorTest(
  slug: VendorSlug,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; message: string; details?: Record<string, unknown> }> {
  switch (slug) {
    case "pbx-webhook":
      // Smoke check — the secret just needs to be non-empty + long
      // enough to defeat brute-force. The end-to-end signature
      // round-trip lives in /admin/pbx-control → Setup.
      if (typeof config.webhookSecret !== "string" || config.webhookSecret.length < 16) {
        return { ok: false, message: "webhookSecret أقصر من 16 محرفاً — استخدم 32 بايت hex على الأقل." };
      }
      return { ok: true, message: "السرّ مهيّأ. اختبر التوقيع الكامل من /admin/pbx-control → Setup." };

    case "whatsapp": {
      const phoneId = String(config.phoneId ?? "");
      const accessToken = String(config.accessToken ?? "");
      if (!phoneId || !accessToken) {
        return { ok: false, message: "phoneId و accessToken كلاهما مطلوب." };
      }
      // Hit /<phone-id>?fields=verified_name on the Graph API. Returns
      // 200 with name + 401 if token bad. Times out at 8s.
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(phoneId)}?fields=verified_name`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          return { ok: false, message: `Graph API rejected: HTTP ${r.status}`, details: { body: text.slice(0, 200) } };
        }
        const data = (await r.json().catch(() => null)) as { verified_name?: string } | null;
        return { ok: true, message: "WhatsApp Cloud API يستجيب — accessToken + phoneId صالحان.", details: { verifiedName: data?.verified_name } };
      } catch (err) {
        return { ok: false, message: `الاتصال فشل: ${(err as Error)?.message ?? String(err)}` };
      }
    }

    case "smtp": {
      // #2137 slice 1: REAL SMTP verify — TCP-only reachability is no
      // longer accepted as "configured". nodemailer's verify() performs
      // the full greeting/EHLO/STARTTLS/AUTH handshake against the SAME
      // resolved config processEmailQueue sends with, so a green check
      // here means the worker can actually log in — not merely that
      // something listens on the port.
      const smtp = await resolveSystemSmtpConfig();
      if (!smtp) {
        return { ok: false, message: "لا يوجد إعداد SMTP صالح — اضبط الخادم والمنفذ والمستخدم وكلمة المرور ثم فعّل الحالة." };
      }
      try {
        const { createTransport } = await import("nodemailer");
        await createTransport(smtpTransportOptions(smtp)).verify();
        return {
          ok: true,
          message: `تم تسجيل الدخول إلى ${smtp.host}:${smtp.port} بنجاح (handshake + مصادقة كاملة). جرّب «إرسال بريد اختبار حقيقي» للتأكد النهائي.`,
          details: { from: formatFromHeader(smtp), configSource: smtp.source },
        };
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          message: `فشلت مصادقة SMTP: ${scrubSmtpSecrets(raw, smtp)}`,
          details: { host: smtp.host, port: smtp.port, configSource: smtp.source },
        };
      }
    }

    case "vapid": {
      const pub = String(config.publicKey ?? "");
      const priv = String(config.privateKey ?? "");
      if (!pub || !priv) {
        return { ok: false, message: "publicKey و privateKey مطلوبان." };
      }
      // VAPID keys are base64-url-encoded EC P-256 keys. Public key
      // length should be 87 chars, private 43 chars. Conservative
      // structural check — actual web-push send is left to the
      // notification engine path.
      if (pub.length < 80 || priv.length < 40) {
        return { ok: false, message: "أطوال مفاتيح VAPID غير معتادة (افحص base64url بدون padding)." };
      }
      return { ok: true, message: "مفاتيح VAPID مهيّأة بأطوال صحيحة. جرّب إرسال إشعار اختباري من /notifications." };
    }

    case "siem": {
      const url = String(config.webhookUrl ?? "");
      if (!url) return { ok: false, message: "webhookUrl مطلوب." };
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const auth = String(config.authHeader ?? "");
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(auth ? { Authorization: auth } : {}),
          },
          body: JSON.stringify({ event: "ghayth.test", source: "vendor-settings", timestamp: new Date().toISOString() }),
          signal: ctrl.signal,
        });
        clearTimeout(t);
        return r.ok
          ? { ok: true, message: `SIEM webhook قبلت الـ POST (HTTP ${r.status}).` }
          : { ok: false, message: `SIEM رفضت: HTTP ${r.status}` };
      } catch (err) {
        return { ok: false, message: `فشل الاتصال: ${(err as Error)?.message ?? String(err)}` };
      }
    }

    case "zatca": {
      const url = String(config.sandboxUrl ?? config.prodUrl ?? "");
      if (!url) return { ok: false, message: "حدّد على الأقل sandboxUrl أو prodUrl." };
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(url, { method: "GET", signal: ctrl.signal });
        clearTimeout(t);
        return { ok: r.ok || r.status === 404, message: `ZATCA endpoint استجاب بـ HTTP ${r.status}.` };
      } catch (err) {
        return { ok: false, message: `فشل: ${(err as Error)?.message ?? String(err)}` };
      }
    }

    case "sms": {
      const accountSid = String(config.accountSid ?? "");
      const authToken = String(config.authToken ?? "");
      const fromNumber = String(config.fromNumber ?? "");
      if (!accountSid || !authToken) {
        return { ok: false, message: "Account SID و Auth Token كلاهما مطلوب." };
      }
      if (fromNumber && !/^\+[1-9]\d{6,14}$/.test(fromNumber)) {
        return { ok: false, message: "رقم المرسل يجب أن يكون بصيغة E.164 (مثل +14155552671)." };
      }
      // GET the Account resource — validates SID + token via Basic auth
      // WITHOUT sending an SMS (no cost, no side effect). 200 = valid,
      // 401 = bad credentials. Mirrors the WhatsApp probe; 8s timeout.
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const creds = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
        const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`, {
          headers: { Authorization: `Basic ${creds}` },
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!r.ok) {
          const text = await r.text().catch(() => "");
          return { ok: false, message: `Twilio رفض: HTTP ${r.status} (تحقّق من Account SID و Auth Token).`, details: { body: text.slice(0, 200) } };
        }
        const data = (await r.json().catch(() => null)) as { friendly_name?: string; status?: string } | null;
        return { ok: true, message: "Twilio يستجيب — Account SID و Auth Token صالحان.", details: { friendlyName: data?.friendly_name, status: data?.status } };
      } catch (err) {
        return { ok: false, message: `الاتصال فشل: ${(err as Error)?.message ?? String(err)}` };
      }
    }

    default:
      return { ok: false, message: `لا يوجد اختبار محدّد لهذا الـ slug: ${String(slug)}` };
  }
}

export default router;
