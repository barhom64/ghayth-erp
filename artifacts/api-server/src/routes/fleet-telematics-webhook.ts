/**
 * CMSV6 Webhook receiver — anonymous, HMAC-signed (#1354 security hardening)
 * ─────────────────────────────────────────────────────────────────────────
 *   POST /api/webhooks/cmsv6/:integrationId
 *     Headers:
 *       x-cmsv6-signature: sha256=<hex digest>
 *       x-cmsv6-timestamp: <unix epoch ms>     (replay window enforcement)
 *     Body: vendor JSON envelope (positions / events / alarms / sensors)
 *
 * This router is mounted BEFORE authMiddleware in routes/index.ts because
 * CMSV6 vendors do not send Authorization headers. We replace JWT auth
 * with three layers:
 *
 *   1. Per-IP rate limit (anonymous edge protection).
 *   2. HMAC-SHA256 verification against the integration's
 *      `webhookSecret` (decrypted via lib/secrets.ts).
 *   3. Timestamp window — reject requests older than 5min so a leaked
 *      signature can't be replayed forever. Timing-safe comparison so the
 *      verifier doesn't leak the secret through response-time side channels.
 *
 * Persistence flows through the SAME normaliser + persist helpers exported
 * from routes/fleet-telematics.ts — there's exactly one path that writes
 * into telematics tables.
 */
import { Router, type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import rateLimit from "express-rate-limit";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";
import { decryptSecret } from "../lib/secrets.js";
import { makeRateLimitStore } from "../lib/rateLimitStore.js";
import { handleRouteError } from "../lib/errorHandler.js";
import {
  persistPosition,
  persistEvent,
  persistAlert,
  persistSensor,
  logSync,
  type DeviceRow,
  type IntegrationRow,
} from "./fleet-telematics.js";
import { normalizeWebhookEnvelope } from "../lib/integrations/cmsv6Adapter.js";

const router = Router();

const REPLAY_WINDOW_MS = 5 * 60 * 1000;

// Per-IP cap — anonymous surface, per-user limiter doesn't apply. 600/min
// covers a chatty vendor (20 vehicles × ~10 events/min headroom) but stops
// a hostile burst from filling the device_positions table.
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لطلبات webhook" },
  validate: { ip: false, trustProxy: false },
  store: makeRateLimitStore("cmsv6-webhook"),
});

function verifySignature(
  rawBody: Buffer,
  timestamp: string,
  signatureHeader: string,
  secret: string,
): boolean {
  // `timestamp.body` is the signed string. Including the timestamp in the
  // digest stops an attacker stripping it from a captured request and
  // resubmitting under a fresh window.
  const payload = Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), rawBody]);
  const digest = createHmac("sha256", secret).update(payload).digest("hex");
  const expected = `sha256=${digest}`;
  if (signatureHeader.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(signatureHeader, "utf8"),
      Buffer.from(expected, "utf8"),
    );
  } catch {
    return false;
  }
}

router.post(
  "/:integrationId",
  webhookLimiter,
  async (req: Request, res: Response) => {
    const started = Date.now();
    try {
      const integrationId = Number(req.params.integrationId);
      if (!Number.isFinite(integrationId) || integrationId <= 0) {
        res.status(404).json({ error: "تكامل غير موجود" });
        return;
      }

      const signature = String(req.header("x-cmsv6-signature") ?? "");
      const timestamp = String(req.header("x-cmsv6-timestamp") ?? "");
      if (!signature || !timestamp) {
        res.status(401).json({ error: "توقيع HMAC مطلوب" });
        return;
      }

      // Replay window. We accept ±5min around server time to absorb clock
      // skew; outside that window an attacker can't ride a leaked signature
      // indefinitely.
      const ts = Number(timestamp);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
        res.status(401).json({ error: "نافذة التوقيع منتهية" });
        return;
      }

      const rows = await rawQuery<IntegrationRow & { webhookSecret: string | null }>(
        `SELECT * FROM fleet_telematics_integrations
          WHERE id = $1 AND "deletedAt" IS NULL`,
        [integrationId],
      );
      const integration = rows[0];
      if (!integration) {
        res.status(404).json({ error: "تكامل غير موجود" });
        return;
      }
      if (integration.status === "paused" || integration.status === "inactive") {
        // Acknowledge so the vendor doesn't retry forever, but don't write.
        res.json({ ok: true, ignored: "integration_not_active" });
        return;
      }

      const secret = decryptSecret(integration.webhookSecret ?? "");
      if (!secret) {
        logger.warn(
          { integrationId },
          "CMSV6 webhook arrived for integration without a configured secret",
        );
        res.status(401).json({ error: "التكامل لا يملك مفتاح webhook" });
        return;
      }

      const rawBody =
        (req as unknown as { rawBody?: Buffer }).rawBody ??
        Buffer.from(JSON.stringify(req.body ?? {}), "utf8");

      if (!verifySignature(rawBody, timestamp, signature, secret)) {
        // Don't tell the caller WHY it failed — that helps an attacker
        // iterate a brute-force.
        res.status(401).json({ error: "توقيع غير صالح" });
        return;
      }

      const normalized = normalizeWebhookEnvelope(req.body);

      // Load the device set scoped to THIS integration's company. Without
      // the join an attacker who guessed an integrationId could push
      // payloads that match another tenant's devNo and we'd misroute.
      const devices = await rawQuery<DeviceRow>(
        `SELECT * FROM fleet_telematics_devices
          WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [integration.companyId],
      );
      const devByNo = new Map(devices.map((d) => [d.cmsv6DeviceNo, d]));

      let created = 0;
      let processed = 0;
      for (const p of normalized.positions) {
        const dev = devByNo.get(p.cmsv6DeviceNo);
        processed++;
        if (dev && (await persistPosition(integration.companyId, integration.branchId, dev, p))) created++;
      }
      for (const e of normalized.events) {
        const dev = devByNo.get(e.cmsv6DeviceNo);
        processed++;
        if (dev && (await persistEvent(integration.companyId, integration.branchId, dev, e))) created++;
      }
      for (const a of normalized.alerts) {
        const dev = devByNo.get(a.cmsv6DeviceNo);
        processed++;
        if (dev && (await persistAlert(integration.companyId, integration.branchId, dev, a))) created++;
      }
      for (const s of normalized.sensors) {
        const dev = devByNo.get(s.cmsv6DeviceNo);
        processed++;
        if (dev && (await persistSensor(integration.companyId, integration.branchId, dev, s))) created++;
      }

      // Touch the integration row so the "last received" indicator on
      // the settings page reflects real-time webhook activity, not just
      // explicit /sync/* calls.
      try {
        await rawExecute(
          `UPDATE fleet_telematics_integrations
              SET "lastSyncAt" = NOW(),
                  "lastSyncStatus" = 'success',
                  "lastSyncError" = NULL
            WHERE id = $1`,
          [integration.id],
        );
      } catch (err) {
        logger.warn({ err, integrationId: integration.id }, "webhook lastSync touch failed");
      }

      void logSync({
        companyId: integration.companyId,
        integrationId: integration.id,
        operation: "webhook_signed",
        status: "success",
        durationMs: Date.now() - started,
        itemsProcessed: processed,
        itemsCreated: created,
      });

      res.json({ ok: true, processed, created });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics-webhook");
    }
  },
);

export default router;
