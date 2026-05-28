/**
 * Fleet Telematics routes — issue #1354
 * ─────────────────────────────────────────────────────────────────────────
 * Mounts under /api/fleet (sibling to existing fleet.ts). Every route is
 * RBAC-gated against the new `fleet.telematics.*` features added in
 * featureCatalog.ts. CMSV6 is reached only through `cmsv6Adapter`; routes
 * never touch the vendor URL directly. Persistence happens here under
 * withTransaction; the adapter returns normalised rows and stays IO-only.
 *
 * Policy (issue #1354 §7):
 *   • GPS, events and sensor readings are continuous and indexed.
 *   • Video is on-demand. Opening a session writes a row to
 *     fleet_video_sessions and emits a critical audit event.
 *   • Idempotency: every CMSV6 event/alert/reading carries an
 *     externalEventId; the DB has a partial unique index per device so
 *     a replay simply no-ops.
 *   • CMSV6 outage: the live map degrades but the DB-backed history,
 *     events and last-known positions remain readable.
 */
import { Router } from "express";
import { z } from "zod";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  IntegrationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { auditMutation, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { encryptSecret, decryptSecret, isEncrypted } from "../lib/secrets.js";
import { telematicsBreaker } from "../lib/fleet/telematicsReliability.js";
import { config } from "../lib/config.js";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createCmsv6Adapter,
  validateCmsv6BaseUrl,
  type CMSV6Adapter,
  type NormalizedPosition,
  type NormalizedEvent,
  type NormalizedAlert,
  type NormalizedSensorReading,
} from "../lib/integrations/cmsv6Adapter.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────
const upsertIntegrationSchema = z.object({
  displayName: z.string().min(1, "اسم التكامل مطلوب"),
  provider: z.enum(["cmsv6", "wialon", "teltonika", "manual"]).optional(),
  baseUrl: z.string().min(1, "عنوان CMSV6 مطلوب"),
  vendorSecretSlug: z.string().optional().nullable(),
  pollIntervalSec: z.coerce.number().int().min(5).max(3600).optional(),
  videoOnDemandOnly: z.boolean().optional(),
  status: z.enum(["active", "inactive", "paused"]).optional(),
  config: z.record(z.unknown()).optional(),
  /**
   * HMAC shared secret for /api/webhooks/cmsv6/:id. Stored encrypted.
   * Accepts null to allow explicit clearing via PATCH (re-rotation
   * workflow: PATCH null → PATCH "<new>"). Minimum 16 chars when set.
   */
  webhookSecret: z
    .union([
      z.string().min(16, "مفتاح webhook يجب أن يكون 16 حرفًا على الأقل"),
      z.literal(null),
    ])
    .optional(),
  // Retention / heartbeat tunables (migration 230). Range-checked at
  // the DB level too; we mirror the bounds here for a nice error message.
  positionRetentionDays: z.coerce.number().int().min(1).max(3650).optional(),
  syncLogRetentionDays: z.coerce.number().int().min(1).max(365).optional(),
  offlineThresholdSec: z.coerce.number().int().min(60).max(86400).optional(),
  notes: z.string().optional().nullable(),
});

const linkDeviceSchema = z.object({
  cmsv6DeviceNo: z.string().min(1, "رقم الجهاز مطلوب"),
  vehicleId: z.coerce.number().int().positive("المركبة مطلوبة"),
  integrationId: z.coerce.number().int().optional(),
  deviceLabel: z.string().optional(),
  deviceModel: z.string().optional(),
  firmwareVersion: z.string().optional(),
  channelCount: z.coerce.number().int().min(1).max(16).optional(),
  imei: z.string().optional(),
  sim: z.string().optional(),
  plateNumber: z.string().optional(),
  capabilities: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
});

const syncPositionsSchema = z.object({
  integrationId: z.coerce.number().int().optional(),
  deviceIds: z.array(z.coerce.number().int()).optional(),
});

const syncEventsSchema = z.object({
  integrationId: z.coerce.number().int().optional(),
  deviceIds: z.array(z.coerce.number().int()).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const openVideoSchema = z.object({
  deviceId: z.coerce.number().int().positive(),
  channelNo: z.coerce.number().int().min(0).max(15),
  streamType: z.enum(["rtsp", "hls", "http_flv"]).optional(),
  durationSec: z.coerce.number().int().min(15).max(3600).optional(),
  reason: z.string().optional(),
  linkedAlertId: z.coerce.number().int().optional(),
});

const ackAlertSchema = z.object({
  resolutionNote: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
export interface IntegrationRow {
  id: number;
  companyId: number;
  branchId: number | null;
  provider: string;
  displayName: string;
  baseUrl: string;
  vendorSecretSlug: string | null;
  pollIntervalSec: number;
  videoOnDemandOnly: boolean;
  status: string;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
  config: Record<string, unknown>;
  /** Encrypted HMAC secret for /api/webhooks/cmsv6/:id (migration 229). */
  webhookSecret: string | null;
  /** Per-tenant retention / heartbeat tunables (migration 230). */
  positionRetentionDays: number;
  syncLogRetentionDays: number;
  offlineThresholdSec: number;
  notes: string | null;
}

export interface DeviceRow {
  id: number;
  companyId: number;
  branchId: number | null;
  integrationId: number | null;
  vehicleId: number | null;
  cmsv6DeviceNo: string;
  deviceLabel: string | null;
  deviceModel: string | null;
  status: string;
  channelCount: number;
  plateNumber: string | null;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
  lastPositionAt: Date | null;
}

export async function loadIntegration(
  companyId: number,
  integrationId?: number,
): Promise<IntegrationRow | null> {
  const rows = await rawQuery<IntegrationRow>(
    integrationId
      ? `SELECT * FROM fleet_telematics_integrations
         WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`
      : `SELECT * FROM fleet_telematics_integrations
         WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status = 'active'
         ORDER BY id ASC LIMIT 1`,
    integrationId ? [integrationId, companyId] : [companyId],
  );
  return rows[0] ?? null;
}

/** Field names inside `config` JSONB that hold secret material. */
const ENCRYPTED_CONFIG_KEYS = new Set(["password", "apiKey", "secret", "token"]);

/**
 * Encrypts the secret fields in a config object in-place. Idempotent —
 * already-encrypted values are passed through. Used on write (CREATE +
 * PATCH) so plaintext credentials never reach `fleet_telematics_integrations.config`.
 */
function encryptConfigSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (ENCRYPTED_CONFIG_KEYS.has(k) && typeof v === "string" && v.length > 0) {
      out[k] = encryptSecret(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Mirror of encryptConfigSecrets — used right before passing to the adapter. */
function decryptConfigSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (ENCRYPTED_CONFIG_KEYS.has(k) && typeof v === "string" && isEncrypted(v)) {
      out[k] = decryptSecret(v) ?? "";
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Build a CMSV6Adapter for the given integration row. Credentials come
 * from config (DB) and are NOT fetched from env — operators manage the
 * vendor through the settings UI. Returns null when the integration
 * doesn't have the minimum credentials to attempt a request.
 *
 * Exported so the auto-poll cron (lib/fleet/telematicsCron.ts) reuses
 * the same decryption + construction path the routes do — duplicating
 * the logic was the #6 finding from the engineering review.
 */
export function buildAdapter(integration: IntegrationRow): CMSV6Adapter | null {
  const cfg = decryptConfigSecrets(integration.config ?? {});
  const account = cfg.account as string | undefined;
  const password = cfg.password as string | undefined;
  if (!account || !password) return null;
  return createCmsv6Adapter({
    baseUrl: integration.baseUrl,
    account,
    password,
    apiKey: cfg.apiKey as string | undefined,
    sessionTtlSec: cfg.sessionTtlSec as number | undefined,
    timeoutMs: cfg.timeoutMs as number | undefined,
  });
}

export async function logSync(params: {
  companyId: number;
  integrationId: number | null;
  deviceId?: number | null;
  operation: string;
  status: "success" | "partial" | "failure" | "skipped";
  durationMs?: number;
  itemsProcessed?: number;
  itemsCreated?: number;
  itemsSkipped?: number;
  message?: string;
  payload?: unknown;
}) {
  try {
    await rawExecute(
      `INSERT INTO fleet_device_sync_logs
         ("companyId","integrationId","deviceId",operation,status,"durationMs",
          "itemsProcessed","itemsCreated","itemsSkipped",message,payload,"finishedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [
        params.companyId,
        params.integrationId,
        params.deviceId ?? null,
        params.operation,
        params.status,
        params.durationMs ?? null,
        params.itemsProcessed ?? 0,
        params.itemsCreated ?? 0,
        params.itemsSkipped ?? 0,
        params.message ?? null,
        params.payload ? JSON.stringify(params.payload) : null,
      ],
    );
  } catch (err) {
    logger.error({ err }, "fleet_device_sync_logs insert failed");
  }
}

const sensorEventMap: Record<string, string> = {
  fuel_level: "fleet.telematics.sensor.fuel_changed",
  weight: "fleet.telematics.sensor.weight_changed",
};

function ptoEventForState(state?: string): string | null {
  if (!state) return null;
  const s = state.toLowerCase();
  if (s === "on" || s === "1" || s === "true") return "fleet.telematics.sensor.pto_on";
  if (s === "off" || s === "0" || s === "false") return "fleet.telematics.sensor.pto_off";
  return null;
}

function dumpPistonEventForState(state?: string): string | null {
  if (!state) return null;
  const s = state.toLowerCase();
  if (s === "up" || s === "raised" || s === "1") return "fleet.telematics.sensor.dump_piston_up";
  if (s === "down" || s === "lowered" || s === "0") return "fleet.telematics.sensor.dump_piston_down";
  return null;
}

function aiCategoryEvent(cat: string): string | null {
  if (cat === "dms") return "fleet.telematics.ai.dms_alert";
  if (cat === "adas") return "fleet.telematics.ai.adas_alert";
  if (cat === "bsd") return "fleet.telematics.ai.bsd_alert";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// /fleet/telematics/devices — list + link
// ─────────────────────────────────────────────────────────────────────────
router.get(
  "/telematics/devices",
  authorize({ feature: "fleet.telematics.devices", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery<DeviceRow & { vehiclePlate: string | null }>(
        `SELECT d.*, v."plateNumber" AS "vehiclePlate"
           FROM fleet_telematics_devices d
           LEFT JOIN vehicles v ON v.id = d."vehicleId"
          WHERE d."companyId" = ANY($1::int[]) AND d."deletedAt" IS NULL
          ORDER BY d.id DESC
          LIMIT 500`,
        [scope.allowedCompanies],
      );
      res.json({ data: rows });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.post(
  "/telematics/devices/link",
  authorize({ feature: "fleet.telematics.devices", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const body = zodParse(linkDeviceSchema.safeParse(req.body));

      // Verify the vehicle belongs to the caller's company before linking —
      // otherwise a scoped user could link a device to another tenant's
      // vehicle id and read its positions.
      const veh = await rawQuery<{ id: number }>(
        `SELECT id FROM vehicles
          WHERE id = $1 AND "companyId" = ANY($2::int[])`,
        [body.vehicleId, scope.allowedCompanies],
      );
      if (veh.length === 0) {
        throw new NotFoundError("المركبة غير موجودة أو خارج نطاق صلاحيتك");
      }

      const result = await withTransaction(async () => {
        const { insertId } = await rawExecute(
          `INSERT INTO fleet_telematics_devices
             ("companyId","branchId","integrationId","vehicleId","cmsv6DeviceNo",
              "deviceLabel","deviceModel","firmwareVersion","channelCount",
              imei,sim,"plateNumber",capabilities,notes,status,"createdBy")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'linked',$15)
           ON CONFLICT ("companyId","cmsv6DeviceNo") WHERE "deletedAt" IS NULL
           DO UPDATE SET
             "vehicleId"      = EXCLUDED."vehicleId",
             "integrationId"  = EXCLUDED."integrationId",
             "deviceLabel"    = EXCLUDED."deviceLabel",
             "deviceModel"    = EXCLUDED."deviceModel",
             "firmwareVersion"= EXCLUDED."firmwareVersion",
             "channelCount"   = EXCLUDED."channelCount",
             imei             = EXCLUDED.imei,
             sim              = EXCLUDED.sim,
             "plateNumber"    = EXCLUDED."plateNumber",
             capabilities     = EXCLUDED.capabilities,
             notes            = EXCLUDED.notes,
             status           = 'linked',
             "updatedAt"      = NOW()
           RETURNING id`,
          [
            scope.companyId,
            scope.branchId,
            body.integrationId ?? null,
            body.vehicleId,
            body.cmsv6DeviceNo,
            body.deviceLabel ?? null,
            body.deviceModel ?? null,
            body.firmwareVersion ?? null,
            body.channelCount ?? 4,
            body.imei ?? null,
            body.sim ?? null,
            body.plateNumber ?? null,
            JSON.stringify(body.capabilities ?? {}),
            body.notes ?? null,
            scope.userId,
          ],
        );
        return assertInsert(insertId, "fleet_telematics_devices");
      });

      void auditMutation(req, {
        entity: "fleet_telematics_devices",
        action: "link",
        entityId: result,
        after: body,
        reason: `ربط جهاز ${body.cmsv6DeviceNo} بالمركبة #${body.vehicleId}`,
      });

      res.status(201).json({ data: { id: result } });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// /fleet/telematics/integrations — CRUD + test
// ─────────────────────────────────────────────────────────────────────────
router.get(
  "/telematics/integrations",
  authorize({ feature: "fleet.telematics.configure", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery<IntegrationRow>(
        `SELECT * FROM fleet_telematics_integrations
          WHERE "companyId" = ANY($1::int[]) AND "deletedAt" IS NULL
          ORDER BY id DESC`,
        [scope.allowedCompanies],
      );
      // Never leak account/password/webhookSecret to the wire. Decrypt for
      // the masker so it can show the last 2 chars (operator UX) — the
      // ciphertext envelope itself isn't useful client-side.
      const masked = rows.map((r) => {
        const decrypted = decryptConfigSecrets(r.config ?? {});
        return {
          ...r,
          config: maskCmsv6Config(decrypted),
          webhookSecret: r.webhookSecret ? "***configured***" : null,
        };
      });
      res.json({ data: masked });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.post(
  "/telematics/integrations",
  authorize({ feature: "fleet.telematics.configure", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const body = zodParse(upsertIntegrationSchema.safeParse(req.body));
      const err = await validateCmsv6BaseUrl(body.baseUrl);
      if (err) throw new ValidationError(err);

      // Encrypt secrets in config before they hit the DB. encryptSecret
      // is idempotent — passing an already-encrypted value through is a
      // no-op, so a future re-save doesn't double-wrap.
      const encryptedConfig = encryptConfigSecrets(body.config ?? {});
      const encryptedWebhookSecret = body.webhookSecret
        ? encryptSecret(body.webhookSecret)
        : null;

      const { insertId } = await rawExecute(
        `INSERT INTO fleet_telematics_integrations
           ("companyId","branchId",provider,"displayName","baseUrl",
            "vendorSecretSlug","pollIntervalSec","videoOnDemandOnly",
            status,config,"webhookSecret",
            "positionRetentionDays","syncLogRetentionDays","offlineThresholdSec",
            notes,"createdBy")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [
          scope.companyId,
          scope.branchId,
          body.provider ?? "cmsv6",
          body.displayName,
          body.baseUrl,
          body.vendorSecretSlug ?? null,
          body.pollIntervalSec ?? 30,
          body.videoOnDemandOnly ?? true,
          body.status ?? "inactive",
          JSON.stringify(encryptedConfig),
          encryptedWebhookSecret,
          body.positionRetentionDays ?? 90,
          body.syncLogRetentionDays ?? 30,
          body.offlineThresholdSec ?? 600,
          body.notes ?? null,
          scope.userId,
        ],
      );
      const id = assertInsert(insertId, "fleet_telematics_integrations");
      void auditMutation(req, {
        entity: "fleet_telematics_integrations",
        action: "create",
        entityId: id,
        // Pass the MASKED form through so the audit log doesn't store
        // plaintext credentials either.
        after: {
          ...body,
          config: maskCmsv6Config(body.config ?? {}),
          webhookSecret: body.webhookSecret ? "***" : null,
        },
      });
      res.status(201).json({ data: { id } });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.patch(
  "/telematics/integrations/:id",
  authorize({ feature: "fleet.telematics.configure", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const body = zodParse(upsertIntegrationSchema.partial().safeParse(req.body));

      const existing = await loadIntegration(scope.companyId, id);
      if (!existing) throw new NotFoundError("التكامل غير موجود");

      if (body.baseUrl) {
        const err = await validateCmsv6BaseUrl(body.baseUrl);
        if (err) throw new ValidationError(err);
      }

      const sets: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;
      const setField = (col: string, val: unknown) => {
        sets.push(`"${col}" = $${paramIdx++}`);
        params.push(val);
      };
      if (body.displayName !== undefined) setField("displayName", body.displayName);
      if (body.baseUrl !== undefined) setField("baseUrl", body.baseUrl);
      if (body.vendorSecretSlug !== undefined) setField("vendorSecretSlug", body.vendorSecretSlug);
      if (body.pollIntervalSec !== undefined) setField("pollIntervalSec", body.pollIntervalSec);
      if (body.videoOnDemandOnly !== undefined) setField("videoOnDemandOnly", body.videoOnDemandOnly);
      if (body.status !== undefined) setField("status", body.status);
      if (body.config !== undefined) {
        // Merge so a partial PATCH keeps secrets already on file. Anything
        // in body.config that is a known secret key gets encrypted before
        // the merge so plaintext never lands in JSONB.
        const incoming = encryptConfigSecrets(body.config);
        const merged = { ...(existing.config ?? {}), ...incoming };
        sets.push(`config = $${paramIdx++}`);
        params.push(JSON.stringify(merged));
      }
      if (body.webhookSecret !== undefined) {
        // null clears the secret (rotation step 1 of 2); a non-empty
        // string sets a new one. zod already enforced the 16-char min
        // for non-null values so we don't re-check here.
        setField("webhookSecret", body.webhookSecret ? encryptSecret(body.webhookSecret) : null);
      }
      if (body.positionRetentionDays !== undefined) setField("positionRetentionDays", body.positionRetentionDays);
      if (body.syncLogRetentionDays !== undefined) setField("syncLogRetentionDays", body.syncLogRetentionDays);
      if (body.offlineThresholdSec !== undefined) setField("offlineThresholdSec", body.offlineThresholdSec);
      if (body.notes !== undefined) setField("notes", body.notes);
      if (sets.length === 0) {
        res.json({ data: existing });
        return;
      }
      sets.push(`"updatedAt" = NOW()`);
      params.push(id);
      params.push(scope.companyId);
      await rawExecute(
        `UPDATE fleet_telematics_integrations
            SET ${sets.join(", ")}
          WHERE id = $${paramIdx++} AND "companyId" = $${paramIdx}`,
        params,
      );
      void auditMutation(req, {
        entity: "fleet_telematics_integrations",
        action: "update",
        entityId: id,
        before: { ...existing, config: maskCmsv6Config(existing.config ?? {}) },
        after: { ...body, config: maskCmsv6Config(body.config ?? {}) },
      });
      res.json({ data: { id } });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.post(
  "/telematics/integrations/:id/test",
  authorize({ feature: "fleet.telematics.configure", action: "update" }),
  async (req, res) => {
    const started = Date.now();
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const integration = await loadIntegration(scope.companyId, id);
      if (!integration) throw new NotFoundError("التكامل غير موجود");
      const adapter = buildAdapter(integration);
      if (!adapter) {
        throw new ValidationError("بيانات الاعتماد ناقصة — يجب تعبئة account و password");
      }
      try {
        const session = await adapter.login();
        await rawExecute(
          `UPDATE fleet_telematics_integrations
              SET "lastSyncAt" = NOW(),
                  "lastSyncStatus" = 'success',
                  "lastSyncError" = NULL,
                  "updatedAt" = NOW()
            WHERE id = $1`,
          [id],
        );
        void logSync({
          companyId: scope.companyId,
          integrationId: id,
          operation: "login",
          status: "success",
          durationMs: Date.now() - started,
          message: "نجاح اختبار CMSV6 login",
        });
        res.json({
          data: { ok: true, expiresAt: session.expiresAt.toISOString() },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await rawExecute(
          `UPDATE fleet_telematics_integrations
              SET "lastSyncAt" = NOW(),
                  "lastSyncStatus" = 'failure',
                  "lastSyncError" = $1,
                  "updatedAt" = NOW()
            WHERE id = $2`,
          [msg.slice(0, 1000), id],
        );
        void logSync({
          companyId: scope.companyId,
          integrationId: id,
          operation: "login",
          status: "failure",
          durationMs: Date.now() - started,
          message: msg,
        });
        throw new IntegrationError(`فشل الاتصال بـ CMSV6: ${msg}`);
      }
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Per-vehicle endpoints
// ─────────────────────────────────────────────────────────────────────────
router.get(
  "/telematics/vehicles/:vehicleId/position",
  authorize({ feature: "fleet.telematics.live", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId);
      const rows = await rawQuery(
        `SELECT p.*, d."cmsv6DeviceNo", d."deviceLabel"
           FROM fleet_device_positions p
           JOIN fleet_telematics_devices d ON d.id = p."deviceId"
          WHERE p."vehicleId" = $1 AND p."companyId" = ANY($2::int[])
          ORDER BY p."occurredAt" DESC
          LIMIT 1`,
        [vehicleId, scope.allowedCompanies],
      );
      res.json({ data: rows[0] ?? null });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.get(
  "/telematics/vehicles/:vehicleId/live",
  authorize({ feature: "fleet.telematics.live", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId);
      // Hand the SPA a single bundle: device, last position, last 10 events,
      // last 10 sensor readings, last 5 AI alerts, channel catalogue.
      const [device] = await rawQuery<DeviceRow>(
        `SELECT * FROM fleet_telematics_devices
          WHERE "vehicleId" = $1 AND "companyId" = ANY($2::int[]) AND "deletedAt" IS NULL
          ORDER BY id ASC LIMIT 1`,
        [vehicleId, scope.allowedCompanies],
      );
      if (!device) {
        res.json({ data: null });
        return;
      }
      const [position, events, sensors, alerts, channels] = await Promise.all([
        rawQuery(
          `SELECT * FROM fleet_device_positions WHERE "deviceId" = $1 ORDER BY "occurredAt" DESC LIMIT 1`,
          [device.id],
        ),
        rawQuery(
          `SELECT * FROM fleet_device_events WHERE "deviceId" = $1 ORDER BY "occurredAt" DESC LIMIT 10`,
          [device.id],
        ),
        rawQuery(
          `SELECT * FROM fleet_sensor_readings WHERE "deviceId" = $1 ORDER BY "occurredAt" DESC LIMIT 20`,
          [device.id],
        ),
        rawQuery(
          `SELECT * FROM fleet_ai_alerts WHERE "deviceId" = $1 ORDER BY "occurredAt" DESC LIMIT 5`,
          [device.id],
        ),
        rawQuery(
          `SELECT * FROM fleet_video_channels WHERE "deviceId" = $1 ORDER BY "channelNo" ASC`,
          [device.id],
        ),
      ]);
      res.json({
        data: {
          device,
          position: position[0] ?? null,
          events,
          sensors,
          alerts,
          channels,
        },
      });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.get(
  "/telematics/vehicles/:vehicleId/events",
  authorize({ feature: "fleet.telematics.ai_alerts", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId);
      const rows = await rawQuery(
        `SELECT * FROM fleet_device_events
          WHERE "vehicleId" = $1 AND "companyId" = ANY($2::int[])
          ORDER BY "occurredAt" DESC LIMIT 500`,
        [vehicleId, scope.allowedCompanies],
      );
      res.json({ data: rows });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.get(
  "/telematics/vehicles/:vehicleId/sensors",
  authorize({ feature: "fleet.telematics.sensors", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId);
      const rows = await rawQuery(
        `SELECT * FROM fleet_sensor_readings
          WHERE "vehicleId" = $1 AND "companyId" = ANY($2::int[])
          ORDER BY "occurredAt" DESC LIMIT 500`,
        [vehicleId, scope.allowedCompanies],
      );
      res.json({ data: rows });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.get(
  "/telematics/vehicles/:vehicleId/ai-alerts",
  authorize({ feature: "fleet.telematics.ai_alerts", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const vehicleId = parseId(req.params.vehicleId);
      const rows = await rawQuery(
        `SELECT * FROM fleet_ai_alerts
          WHERE "vehicleId" = $1 AND "companyId" = ANY($2::int[])
          ORDER BY "occurredAt" DESC LIMIT 200`,
        [vehicleId, scope.allowedCompanies],
      );
      res.json({ data: rows });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Cross-fleet aggregates — used by the live map + AI alerts pages
// ─────────────────────────────────────────────────────────────────────────
router.get(
  "/telematics/live",
  authorize({ feature: "fleet.telematics.live", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery(
        `WITH last_pos AS (
            SELECT DISTINCT ON ("deviceId") *
              FROM fleet_device_positions
              WHERE "companyId" = ANY($1::int[])
              ORDER BY "deviceId", "occurredAt" DESC
         )
         SELECT d.id AS "deviceId",
                d."cmsv6DeviceNo",
                d."deviceLabel",
                d.status,
                d."vehicleId",
                v."plateNumber" AS "vehiclePlate",
                p.lat,
                p.lng,
                p.speed,
                p.direction,
                p."occurredAt" AS "lastPositionAt"
           FROM fleet_telematics_devices d
           LEFT JOIN vehicles v ON v.id = d."vehicleId"
           LEFT JOIN last_pos p ON p."deviceId" = d.id
          WHERE d."companyId" = ANY($1::int[]) AND d."deletedAt" IS NULL
          ORDER BY d.id ASC`,
        [scope.allowedCompanies],
      );
      res.json({ data: rows });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.get(
  "/telematics/ai-alerts",
  authorize({ feature: "fleet.telematics.ai_alerts", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const status = String(req.query.status ?? "");
      const category = String(req.query.category ?? "");
      const conditions: string[] = [`a."companyId" = ANY($1::int[])`];
      const params: unknown[] = [scope.allowedCompanies];
      let paramIdx = 2;
      if (status) {
        conditions.push(`a.status = $${paramIdx++}`);
        params.push(status);
      }
      if (category) {
        conditions.push(`a.category = $${paramIdx++}`);
        params.push(category);
      }
      const rows = await rawQuery(
        `SELECT a.*, v."plateNumber" AS "vehiclePlate", d."deviceLabel"
           FROM fleet_ai_alerts a
           LEFT JOIN vehicles v ON v.id = a."vehicleId"
           LEFT JOIN fleet_telematics_devices d ON d.id = a."deviceId"
          WHERE ${conditions.join(" AND ")}
          ORDER BY a."occurredAt" DESC LIMIT 500`,
        params,
      );
      res.json({ data: rows });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.post(
  "/telematics/ai-alerts/:id/acknowledge",
  authorize({ feature: "fleet.telematics.ai_alerts", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const body = zodParse(ackAlertSchema.safeParse(req.body));
      const { affectedRows } = await rawExecute(
        `UPDATE fleet_ai_alerts
            SET status = 'acknowledged',
                "acknowledgedBy" = $1,
                "acknowledgedAt" = NOW(),
                "resolutionNote" = COALESCE($2, "resolutionNote")
          WHERE id = $3 AND "companyId" = ANY($4::int[])`,
        [scope.userId, body.resolutionNote ?? null, id, scope.allowedCompanies],
      );
      if (affectedRows === 0) throw new NotFoundError("التنبيه غير موجود");
      void auditMutation(req, {
        entity: "fleet_ai_alerts",
        action: "acknowledge",
        entityId: id,
        reason: body.resolutionNote,
      });
      res.json({ data: { id, status: "acknowledged" } });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.post(
  "/telematics/ai-alerts/:id/resolve",
  authorize({ feature: "fleet.telematics.ai_alerts", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const body = zodParse(ackAlertSchema.safeParse(req.body));
      const { affectedRows } = await rawExecute(
        `UPDATE fleet_ai_alerts
            SET status = 'resolved',
                "resolvedBy" = $1,
                "resolvedAt" = NOW(),
                "resolutionNote" = COALESCE($2, "resolutionNote")
          WHERE id = $3 AND "companyId" = ANY($4::int[])`,
        [scope.userId, body.resolutionNote ?? null, id, scope.allowedCompanies],
      );
      if (affectedRows === 0) throw new NotFoundError("التنبيه غير موجود");
      void auditMutation(req, {
        entity: "fleet_ai_alerts",
        action: "resolve",
        entityId: id,
        reason: body.resolutionNote,
      });
      res.json({ data: { id, status: "resolved" } });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Sync endpoints — pull from CMSV6 + persist
// ─────────────────────────────────────────────────────────────────────────
router.post(
  "/telematics/sync/positions",
  authorize({ feature: "fleet.telematics.sync", action: "create" }),
  async (req, res) => {
    const started = Date.now();
    try {
      const scope = req.scope!;
      const body = zodParse(syncPositionsSchema.safeParse(req.body));
      const integration = await loadIntegration(scope.companyId, body.integrationId);
      if (!integration) throw new NotFoundError("لا يوجد تكامل CMSV6 نشط");
      const adapter = buildAdapter(integration);
      if (!adapter) throw new ValidationError("بيانات اعتماد CMSV6 ناقصة");

      const deviceRows = await rawQuery<DeviceRow>(
        body.deviceIds && body.deviceIds.length > 0
          ? `SELECT * FROM fleet_telematics_devices
              WHERE id = ANY($1::int[]) AND "companyId" = $2 AND "deletedAt" IS NULL`
          : `SELECT * FROM fleet_telematics_devices
              WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status <> 'decommissioned'`,
        body.deviceIds && body.deviceIds.length > 0
          ? [body.deviceIds, scope.companyId]
          : [scope.companyId],
      );
      if (deviceRows.length === 0) {
        res.json({ data: { processed: 0, created: 0 } });
        return;
      }
      const deviceMap = new Map(deviceRows.map((d) => [d.cmsv6DeviceNo, d]));
      let processed = 0;
      let created = 0;
      try {
        const positions = await adapter.getLatestPositions(deviceRows.map((d) => d.cmsv6DeviceNo));
        processed = positions.length;
        for (const p of positions) {
          const dev = deviceMap.get(p.cmsv6DeviceNo);
          if (!dev) continue;
          const inserted = await persistPosition(scope.companyId, scope.branchId, dev, p);
          if (inserted) created++;
        }
        await rawExecute(
          `UPDATE fleet_telematics_integrations
              SET "lastSyncAt" = NOW(),
                  "lastSyncStatus" = 'success',
                  "lastSyncError" = NULL
            WHERE id = $1`,
          [integration.id],
        );
        void logSync({
          companyId: scope.companyId,
          integrationId: integration.id,
          operation: "sync_positions",
          status: "success",
          durationMs: Date.now() - started,
          itemsProcessed: processed,
          itemsCreated: created,
        });
        res.json({ data: { processed, created } });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await rawExecute(
          `UPDATE fleet_telematics_integrations
              SET "lastSyncAt" = NOW(), "lastSyncStatus" = 'failure', "lastSyncError" = $1
            WHERE id = $2`,
          [msg.slice(0, 1000), integration.id],
        );
        void logSync({
          companyId: scope.companyId,
          integrationId: integration.id,
          operation: "sync_positions",
          status: "failure",
          durationMs: Date.now() - started,
          message: msg,
        });
        throw new IntegrationError(`فشل مزامنة المواقع: ${msg}`);
      }
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.post(
  "/telematics/sync/events",
  authorize({ feature: "fleet.telematics.sync", action: "create" }),
  async (req, res) => {
    const started = Date.now();
    try {
      const scope = req.scope!;
      const body = zodParse(syncEventsSchema.safeParse(req.body));
      const integration = await loadIntegration(scope.companyId, body.integrationId);
      if (!integration) throw new NotFoundError("لا يوجد تكامل CMSV6 نشط");
      const adapter = buildAdapter(integration);
      if (!adapter) throw new ValidationError("بيانات اعتماد CMSV6 ناقصة");

      const deviceRows = await rawQuery<DeviceRow>(
        body.deviceIds && body.deviceIds.length > 0
          ? `SELECT * FROM fleet_telematics_devices
              WHERE id = ANY($1::int[]) AND "companyId" = $2 AND "deletedAt" IS NULL`
          : `SELECT * FROM fleet_telematics_devices
              WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status <> 'decommissioned'`,
        body.deviceIds && body.deviceIds.length > 0
          ? [body.deviceIds, scope.companyId]
          : [scope.companyId],
      );

      const range = {
        from: body.from ? new Date(body.from) : new Date(Date.now() - 60 * 60 * 1000),
        to: body.to ? new Date(body.to) : new Date(),
      };

      let totalEvents = 0;
      let totalAlerts = 0;
      let totalSensors = 0;
      let createdEvents = 0;
      let createdAlerts = 0;
      let createdSensors = 0;

      try {
        for (const dev of deviceRows) {
          const [evts, alerts, sensors] = await Promise.all([
            adapter.getEvents(dev.cmsv6DeviceNo, range),
            adapter.getAIAlerts(dev.cmsv6DeviceNo, range),
            adapter.getSensorReadings(dev.cmsv6DeviceNo, range),
          ]);
          totalEvents += evts.length;
          totalAlerts += alerts.length;
          totalSensors += sensors.length;
          for (const e of evts) {
            if (await persistEvent(scope.companyId, scope.branchId, dev, e)) createdEvents++;
          }
          for (const a of alerts) {
            if (await persistAlert(scope.companyId, scope.branchId, dev, a)) createdAlerts++;
          }
          for (const s of sensors) {
            if (await persistSensor(scope.companyId, scope.branchId, dev, s)) createdSensors++;
          }
        }
        await rawExecute(
          `UPDATE fleet_telematics_integrations
              SET "lastSyncAt" = NOW(), "lastSyncStatus" = 'success', "lastSyncError" = NULL
            WHERE id = $1`,
          [integration.id],
        );
        void logSync({
          companyId: scope.companyId,
          integrationId: integration.id,
          operation: "sync_events",
          status: "success",
          durationMs: Date.now() - started,
          itemsProcessed: totalEvents + totalAlerts + totalSensors,
          itemsCreated: createdEvents + createdAlerts + createdSensors,
        });
        res.json({
          data: {
            events: { processed: totalEvents, created: createdEvents },
            alerts: { processed: totalAlerts, created: createdAlerts },
            sensors: { processed: totalSensors, created: createdSensors },
          },
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        await rawExecute(
          `UPDATE fleet_telematics_integrations
              SET "lastSyncAt" = NOW(), "lastSyncStatus" = 'failure', "lastSyncError" = $1
            WHERE id = $2`,
          [msg.slice(0, 1000), integration.id],
        );
        void logSync({
          companyId: scope.companyId,
          integrationId: integration.id,
          operation: "sync_events",
          status: "failure",
          durationMs: Date.now() - started,
          message: msg,
        });
        throw new IntegrationError(`فشل مزامنة الأحداث: ${msg}`);
      }
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Internal testing surface for QA — pushes a CMSV6-shaped payload through
// the SAME normaliser + persist helpers the real webhook uses. The
// production webhook lives at /api/webhooks/cmsv6/:integrationId and is
// HMAC-signed; this route is JWT-authenticated and intended for internal
// payload injection during pilot testing only.
// ─────────────────────────────────────────────────────────────────────────
router.post(
  "/telematics/webhook/cmsv6/test",
  authorize({ feature: "fleet.telematics.sync", action: "create" }),
  async (req, res) => {
    const started = Date.now();
    try {
      const scope = req.scope!;
      const integration = await loadIntegration(scope.companyId);
      const adapter = integration ? buildAdapter(integration) : null;
      const normalized = adapter
        ? adapter.normalizeWebhookPayload(req.body)
        : { events: [], alerts: [], sensors: [], positions: [] };

      const devices = await rawQuery<DeviceRow>(
        `SELECT * FROM fleet_telematics_devices
          WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [scope.companyId],
      );
      const devByNo = new Map(devices.map((d) => [d.cmsv6DeviceNo, d]));
      let created = 0;
      for (const p of normalized.positions) {
        const dev = devByNo.get(p.cmsv6DeviceNo);
        if (dev && (await persistPosition(scope.companyId, scope.branchId, dev, p))) created++;
      }
      for (const e of normalized.events) {
        const dev = devByNo.get(e.cmsv6DeviceNo);
        if (dev && (await persistEvent(scope.companyId, scope.branchId, dev, e))) created++;
      }
      for (const a of normalized.alerts) {
        const dev = devByNo.get(a.cmsv6DeviceNo);
        if (dev && (await persistAlert(scope.companyId, scope.branchId, dev, a))) created++;
      }
      for (const s of normalized.sensors) {
        const dev = devByNo.get(s.cmsv6DeviceNo);
        if (dev && (await persistSensor(scope.companyId, scope.branchId, dev, s))) created++;
      }
      void logSync({
        companyId: scope.companyId,
        integrationId: integration?.id ?? null,
        operation: "webhook",
        status: "success",
        durationMs: Date.now() - started,
        itemsProcessed:
          normalized.positions.length +
          normalized.events.length +
          normalized.alerts.length +
          normalized.sensors.length,
        itemsCreated: created,
      });
      res.json({ data: { ok: true, created } });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Video sessions — on-demand only, audited
// ─────────────────────────────────────────────────────────────────────────
router.post(
  "/telematics/video/session",
  authorize({ feature: "fleet.telematics.video", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const body = zodParse(openVideoSchema.safeParse(req.body));
      const [device] = await rawQuery<DeviceRow>(
        `SELECT * FROM fleet_telematics_devices
          WHERE id = $1 AND "companyId" = ANY($2::int[]) AND "deletedAt" IS NULL`,
        [body.deviceId, scope.allowedCompanies],
      );
      if (!device) throw new NotFoundError("جهاز MDVR غير موجود");

      const integration = await loadIntegration(
        device.companyId,
        device.integrationId ?? undefined,
      );
      if (!integration) throw new NotFoundError("التكامل غير موجود");
      const adapter = buildAdapter(integration);
      if (!adapter) throw new ValidationError("بيانات اعتماد CMSV6 ناقصة");

      const handle = await adapter.openVideoSession({
        cmsv6DeviceNo: device.cmsv6DeviceNo,
        channelNo: body.channelNo,
        streamType: body.streamType ?? "hls",
        durationSec: body.durationSec,
      });

      const expiresAt = handle.expiresAt
        ?? new Date(Date.now() + (body.durationSec ?? 300) * 1000);

      // #1354 Ibrahim review — Video Security Layer. The client never
      // receives the raw CMSV6 streamUrl on session open. Instead it
      // gets a one-shot proxy token bound to this session, valid for
      // config.fleetTelematics.proxyTtlSec seconds. The proxy endpoint
      // verifies the token, audits the access, and ONLY then returns
      // the underlying URL (or in a future iteration, stream-proxies
      // the bytes themselves).
      const proxyToken = randomBytes(32).toString("base64url");
      const proxyTtlMs = config.fleetTelematics.proxyTtlSec * 1000;
      const proxyExpiresAt = new Date(Date.now() + proxyTtlMs);

      const { insertId } = await rawExecute(
        `INSERT INTO fleet_video_sessions
           ("companyId","branchId","deviceId","vehicleId","channelNo",
            "streamType","streamUrl","expiresAt","requestedBy",reason,
            "linkedAlertId","externalSessionId","streamProxyToken",
            "streamProxyExpiresAt",status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active')
         RETURNING id`,
        [
          scope.companyId,
          scope.branchId,
          device.id,
          device.vehicleId,
          body.channelNo,
          handle.streamType,
          handle.streamUrl,
          expiresAt,
          scope.userId,
          body.reason ?? null,
          body.linkedAlertId ?? null,
          handle.externalSessionId ?? null,
          proxyToken,
          proxyExpiresAt,
        ],
      );
      const id = assertInsert(insertId, "fleet_video_sessions");

      void emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "fleet.telematics.video.session_started",
        entity: "fleet_video_sessions",
        entityId: id,
        details: `بدء بث مباشر — جهاز ${device.cmsv6DeviceNo} قناة ${body.channelNo}`,
        after: { sessionId: id, deviceId: device.id, vehicleId: device.vehicleId, channelNo: body.channelNo, requestedBy: scope.userId },
      });
      void auditMutation(req, {
        entity: "fleet_video_sessions",
        action: "open",
        entityId: id,
        reason: body.reason,
      });

      // streamUrl is intentionally NOT returned — the proxy URL is the
      // only thing the client should see. The raw CMSV6 URL stays
      // server-side; if it leaks, an attacker still can't replay it
      // without a current token + session.
      res.status(201).json({
        data: {
          id,
          streamType: handle.streamType,
          expiresAt: expiresAt.toISOString(),
          proxyUrl: `/api/fleet/telematics/video/proxy/${id}?token=${proxyToken}`,
          proxyExpiresAt: proxyExpiresAt.toISOString(),
        },
      });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.post(
  "/telematics/video/session/:id/stop",
  authorize({ feature: "fleet.telematics.video", action: "delete" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const [sess] = await rawQuery<{
        id: number;
        companyId: number;
        deviceId: number;
        status: string;
        streamUrl: string | null;
        externalSessionId: string | null;
      }>(
        `SELECT id, "companyId", "deviceId", status, "streamUrl", "externalSessionId"
           FROM fleet_video_sessions
          WHERE id = $1 AND "companyId" = ANY($2::int[])`,
        [id, scope.allowedCompanies],
      );
      if (!sess) throw new NotFoundError("الجلسة غير موجودة");
      if (sess.status !== "active") {
        res.json({ data: { id, status: sess.status } });
        return;
      }

      // Best-effort vendor stop. We always close the local row even if
      // CMSV6 is unreachable so the audit trail is correct. The vendor
      // session id was persisted on open (migration 229), so the close
      // call no longer regex-parses the URL — which was hostile-input
      // adjacent and fragile.
      try {
        const [device] = await rawQuery<DeviceRow>(
          `SELECT * FROM fleet_telematics_devices WHERE id = $1`,
          [sess.deviceId],
        );
        if (device) {
          const integration = await loadIntegration(
            sess.companyId,
            device.integrationId ?? undefined,
          );
          const adapter = integration ? buildAdapter(integration) : null;
          if (adapter && sess.externalSessionId) {
            await adapter.closeVideoSession(sess.externalSessionId);
          }
        }
      } catch (err) {
        logger.warn({ err, id }, "Best-effort CMSV6 stop failed");
      }

      // Clear the proxy token on close so a leaked URL can't be replayed
      // even within its TTL window after the operator closed the stream.
      await rawExecute(
        `UPDATE fleet_video_sessions
            SET status = 'stopped',
                "endedAt" = NOW(),
                "streamProxyToken" = NULL,
                "streamProxyExpiresAt" = NULL
          WHERE id = $1`,
        [id],
      );
      void emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "fleet.telematics.video.session_stopped",
        entity: "fleet_video_sessions",
        entityId: id,
        details: "إيقاف بث مباشر",
        after: { sessionId: id, deviceId: sess.deviceId },
      });
      void auditMutation(req, {
        entity: "fleet_video_sessions",
        action: "close",
        entityId: id,
      });
      res.json({ data: { id, status: "stopped" } });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Video Security Layer — signed proxy (Ibrahim PR review, #1354).
//
// The raw CMSV6 streamUrl never leaves this server. The frontend calls
// /telematics/video/proxy/:sessionId?token=<short-lived> to redeem the
// underlying URL; this endpoint:
//   1. Verifies the token against fleet_video_sessions.streamProxyToken
//      with a timing-safe compare so brute-force is observable but
//      doesn't leak via response timing.
//   2. Checks streamProxyExpiresAt > now (60-second window by default).
//   3. Checks the session is still 'active' and the streamUrl exists.
//   4. Records the access in fleet_video_access_logs WHETHER OR NOT
//      it is granted — denied attempts are forensically visible.
//   5. Confirms the caller is the user who opened the session (the
//      `fleet.telematics.video:list` permission is required to even
//      reach this route, but per-user binding stops one auditor from
//      hot-link to another's open session).
// ─────────────────────────────────────────────────────────────────────────
router.get(
  "/telematics/video/proxy/:id",
  authorize({ feature: "fleet.telematics.video", action: "view" }),
  async (req, res) => {
    const sessionId = parseId(req.params.id);
    const presentedToken = String(req.query.token ?? "");
    const accessIp = req.ip ?? null;
    const userAgent = req.header("user-agent") ?? null;

    const logAccess = async (
      companyId: number,
      userId: number | null,
      status: "granted" | "denied_token" | "denied_expired" | "denied_session" | "denied_user",
      errorReason?: string,
    ) => {
      try {
        await rawExecute(
          `INSERT INTO fleet_video_access_logs
             ("companyId","sessionId","accessedBy","accessIp","userAgent",
              status,"errorReason")
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [companyId, sessionId, userId, accessIp, userAgent, status, errorReason ?? null],
        );
      } catch (err) {
        logger.error({ err, sessionId }, "video access log insert failed");
      }
    };

    try {
      const scope = req.scope!;
      const [sess] = await rawQuery<{
        id: number;
        companyId: number;
        status: string;
        streamUrl: string | null;
        streamType: string;
        streamProxyToken: string | null;
        streamProxyExpiresAt: Date | null;
        requestedBy: number;
      }>(
        `SELECT id, "companyId", status, "streamUrl", "streamType",
                "streamProxyToken", "streamProxyExpiresAt", "requestedBy"
           FROM fleet_video_sessions
          WHERE id = $1 AND "companyId" = ANY($2::int[])`,
        [sessionId, scope.allowedCompanies],
      );
      if (!sess) {
        // Don't audit — there's no session row to FK against.
        throw new NotFoundError("الجلسة غير موجودة");
      }

      // Layer 1: token presence + timing-safe compare.
      if (!presentedToken || !sess.streamProxyToken ||
          presentedToken.length !== sess.streamProxyToken.length ||
          !timingSafeEqual(Buffer.from(presentedToken), Buffer.from(sess.streamProxyToken))) {
        await logAccess(sess.companyId, scope.userId, "denied_token", "token mismatch");
        res.status(401).json({ error: "رمز الوصول غير صالح" });
        return;
      }

      // Layer 2: expiry.
      if (!sess.streamProxyExpiresAt || sess.streamProxyExpiresAt.getTime() < Date.now()) {
        await logAccess(sess.companyId, scope.userId, "denied_expired", "proxy token expired");
        res.status(401).json({ error: "انتهت صلاحية رمز الوصول" });
        return;
      }

      // Layer 3: session must still be active.
      if (sess.status !== "active" || !sess.streamUrl) {
        await logAccess(sess.companyId, scope.userId, "denied_session", `session status=${sess.status}`);
        res.status(409).json({ error: "الجلسة غير نشطة" });
        return;
      }

      // Layer 4: user binding. The requester must be the user who opened
      // the session; an auditor with the same permission still has to
      // open their own session to view a stream.
      if (sess.requestedBy !== scope.userId) {
        await logAccess(sess.companyId, scope.userId, "denied_user", "different user");
        res.status(403).json({ error: "هذه الجلسة لمستخدم آخر" });
        return;
      }

      await logAccess(sess.companyId, scope.userId, "granted");

      // Pilot delivery: return the URL in a tightly-scoped JSON response.
      // Phase 2 production hardening (tracked in known limitations) will
      // upgrade this to true HTTP byte-proxying so the raw CMSV6 URL
      // never reaches the browser at all.
      res.json({
        data: {
          streamUrl: sess.streamUrl,
          streamType: sess.streamType,
          expiresAt: sess.streamProxyExpiresAt.toISOString(),
        },
      });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics-video-proxy");
    }
  },
);

router.get(
  "/telematics/video/sessions",
  authorize({ feature: "fleet.telematics.video", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      // streamUrl + streamProxyToken are intentionally NOT selected —
      // this is an audit surface, not a replay surface (Ibrahim review).
      // For an active stream the operator already has the proxyUrl from
      // POST /video/session; for a closed/expired one the URL is dead
      // anyway, so showing it here only invites copy-paste leaks.
      const rows = await rawQuery(
        `SELECT s.id, s."companyId", s."branchId", s."deviceId", s."vehicleId",
                s."channelNo", s."streamType", s."startedAt", s."endedAt",
                s."expiresAt", s."requestedBy", s.reason, s.status,
                s."linkedAlertId", s."externalSessionId",
                v."plateNumber" AS "vehiclePlate",
                d."deviceLabel"
           FROM fleet_video_sessions s
           LEFT JOIN vehicles v ON v.id = s."vehicleId"
           LEFT JOIN fleet_telematics_devices d ON d.id = s."deviceId"
          WHERE s."companyId" = ANY($1::int[])
          ORDER BY s."startedAt" DESC LIMIT 200`,
        [scope.allowedCompanies],
      );
      res.json({ data: rows });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// Per-session access audit log — admin observability. Returns every
// granted/denied proxy fetch ordered newest-first.
router.get(
  "/telematics/video/sessions/:id/access-logs",
  authorize({ feature: "fleet.telematics.video", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const sessionId = parseId(req.params.id);
      const rows = await rawQuery(
        `SELECT l.* FROM fleet_video_access_logs l
          WHERE l."sessionId" = $1 AND l."companyId" = ANY($2::int[])
          ORDER BY l."accessedAt" DESC LIMIT 500`,
        [sessionId, scope.allowedCompanies],
      );
      res.json({ data: rows });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Sync logs — operator observability
// ─────────────────────────────────────────────────────────────────────────
router.get(
  "/telematics/sync-logs",
  authorize({ feature: "fleet.telematics.sync", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery(
        `SELECT * FROM fleet_device_sync_logs
          WHERE "companyId" = ANY($1::int[])
          ORDER BY "startedAt" DESC LIMIT 200`,
        [scope.allowedCompanies],
      );
      res.json({ data: rows });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Circuit breaker observability — operator sees which integrations the
// auto-poll cron is currently short-circuiting on. Scoped to the caller's
// companies so a sub-tenant doesn't see neighbours' integration ids.
// ─────────────────────────────────────────────────────────────────────────
router.get(
  "/telematics/breaker-state",
  authorize({ feature: "fleet.telematics.sync", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const all = telematicsBreaker.snapshot();
      // Filter to integrations the caller actually owns. A platform-wide
      // breaker state is fine in-memory but must NOT leak to a tenant UI.
      const allowed = await rawQuery<{ id: number }>(
        `SELECT id FROM fleet_telematics_integrations
          WHERE "companyId" = ANY($1::int[]) AND "deletedAt" IS NULL`,
        [scope.allowedCompanies],
      );
      const allowedIds = new Set(allowed.map((r) => r.id));
      const filtered = all
        .filter((s) => allowedIds.has(s.integrationId))
        .map((s) => ({
          integrationId: s.integrationId,
          failures: s.failures,
          openedAt: s.openedAt,
          status: s.openedAt ? "open" : "closed",
        }));
      res.json({ data: filtered });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Persistence helpers — return TRUE iff a new row was created.
// Idempotency lives in the DB unique indexes; ON CONFLICT DO NOTHING is
// the right level of strictness here.
// ─────────────────────────────────────────────────────────────────────────
/**
 * Per-device throttle for `fleet.telematics.position.updated`. Persistence
 * still happens on every GPS point (the live map needs that) but emitting
 * an event for every point at 20 vehicles × every-30s would mean 57k
 * events/day, each one fanning out to every listener registered on the
 * bus. Throttle to 1 event/device/minute so the bus stays useful.
 *
 * In-memory map is fine: missing a throttle window across a process
 * restart just means one extra event — same effect as if the next
 * point landed in a new window.
 */
const POSITION_EVENT_THROTTLE_MS = 60_000;
const lastPositionEventAt = new Map<number, number>();

export async function persistPosition(
  companyId: number,
  branchId: number | null,
  device: DeviceRow,
  p: NormalizedPosition,
): Promise<boolean> {
  const { affectedRows } = await rawExecute(
    `INSERT INTO fleet_device_positions
       ("companyId","branchId","deviceId","vehicleId","occurredAt",
        lat,lng,speed,direction,altitude,accuracy,"ignitionOn",
        "satelliteCount","rawPayload")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      companyId,
      branchId,
      device.id,
      device.vehicleId,
      p.occurredAt,
      p.lat,
      p.lng,
      p.speed ?? null,
      p.direction ?? null,
      p.altitude ?? null,
      p.accuracy ?? null,
      p.ignitionOn ?? null,
      p.satelliteCount ?? null,
      JSON.stringify(p.rawPayload ?? {}),
    ],
  );
  // Touch the device's last-known timestamps.
  await rawExecute(
    `UPDATE fleet_telematics_devices
        SET "lastPositionAt" = $1, "lastOnlineAt" = NOW(), status = 'online'
      WHERE id = $2`,
    [p.occurredAt, device.id],
  );
  if (affectedRows > 0) {
    const now = Date.now();
    const last = lastPositionEventAt.get(device.id) ?? 0;
    if (now - last >= POSITION_EVENT_THROTTLE_MS) {
      lastPositionEventAt.set(device.id, now);
      void emitEvent({
        companyId,
        branchId: branchId ?? undefined,
        userId: null,
        action: "fleet.telematics.position.updated",
        entity: "fleet_device_positions",
        entityId: device.id,
        details: `موقع جديد للجهاز #${device.id}`,
        after: { deviceId: device.id, vehicleId: device.vehicleId, lat: p.lat, lng: p.lng, speed: p.speed },
      });
    }
  }
  return affectedRows > 0;
}

export async function persistEvent(
  companyId: number,
  branchId: number | null,
  device: DeviceRow,
  e: NormalizedEvent,
): Promise<boolean> {
  const { affectedRows } = await rawExecute(
    `INSERT INTO fleet_device_events
       ("companyId","branchId","deviceId","vehicleId","eventType","eventCode",
        severity,"occurredAt",lat,lng,speed,message,"externalEventId",
        "rawPayload","normalizedPayload")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT ("deviceId","externalEventId") DO NOTHING`,
    [
      companyId,
      branchId,
      device.id,
      device.vehicleId,
      e.eventType,
      e.eventCode ?? null,
      e.severity,
      e.occurredAt,
      e.lat ?? null,
      e.lng ?? null,
      e.speed ?? null,
      e.message ?? null,
      e.externalEventId ?? null,
      JSON.stringify(e.rawPayload ?? {}),
      e.normalizedPayload ? JSON.stringify(e.normalizedPayload) : null,
    ],
  );
  if (affectedRows > 0 && (e.eventType === "online" || e.eventType === "offline")) {
    const evt = e.eventType === "online"
      ? "fleet.telematics.device.online"
      : "fleet.telematics.device.offline";
    void emitEvent({
      companyId,
      branchId: branchId ?? undefined,
      userId: null,
      action: evt,
      entity: "fleet_telematics_devices",
      entityId: device.id,
      details: `حالة الجهاز ${e.eventType}`,
      after: { deviceId: device.id, vehicleId: device.vehicleId, lastSeenAt: e.occurredAt.toISOString() },
    });
  }
  return affectedRows > 0;
}

export async function persistAlert(
  companyId: number,
  branchId: number | null,
  device: DeviceRow,
  a: NormalizedAlert,
): Promise<boolean> {
  const { affectedRows, insertId } = await rawExecute(
    `INSERT INTO fleet_ai_alerts
       ("companyId","branchId","deviceId","vehicleId",category,"alertType",
        "alertCode",severity,confidence,"occurredAt",lat,lng,speed,
        "imageUrl","videoUrl","externalAlertId","rawPayload","normalizedPayload")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT ("deviceId","externalAlertId") DO NOTHING
     RETURNING id`,
    [
      companyId,
      branchId,
      device.id,
      device.vehicleId,
      a.category,
      a.alertType,
      a.alertCode ?? null,
      a.severity,
      a.confidence ?? null,
      a.occurredAt,
      a.lat ?? null,
      a.lng ?? null,
      a.speed ?? null,
      a.imageUrl ?? null,
      a.videoUrl ?? null,
      a.externalAlertId ?? null,
      JSON.stringify(a.rawPayload ?? {}),
      a.normalizedPayload ? JSON.stringify(a.normalizedPayload) : null,
    ],
  );
  if (affectedRows > 0) {
    const evt = aiCategoryEvent(a.category);
    if (evt) {
      void emitEvent({
        companyId,
        branchId: branchId ?? undefined,
        userId: null,
        action: evt,
        entity: "fleet_ai_alerts",
        entityId: insertId,
        details: `${a.category.toUpperCase()} — ${a.alertType}`,
        after: { alertId: insertId, deviceId: device.id, vehicleId: device.vehicleId, alertType: a.alertType, severity: a.severity },
      });
    }
    // Auto-attach media evidence if the alert carries an image/video URL.
    if (a.imageUrl) {
      await rawExecute(
        `INSERT INTO fleet_media_evidence
           ("companyId","branchId","deviceId","vehicleId","alertId",
            "mediaType","mediaUrl","occurredAt","externalMediaId","rawPayload")
         VALUES ($1,$2,$3,$4,$5,'image',$6,$7,$8,$9)`,
        [
          companyId,
          branchId,
          device.id,
          device.vehicleId,
          insertId,
          a.imageUrl,
          a.occurredAt,
          a.externalAlertId ?? null,
          JSON.stringify(a.rawPayload ?? {}),
        ],
      );
    }
    if (a.videoUrl) {
      await rawExecute(
        `INSERT INTO fleet_media_evidence
           ("companyId","branchId","deviceId","vehicleId","alertId",
            "mediaType","mediaUrl","occurredAt","externalMediaId","rawPayload")
         VALUES ($1,$2,$3,$4,$5,'video',$6,$7,$8,$9)`,
        [
          companyId,
          branchId,
          device.id,
          device.vehicleId,
          insertId,
          a.videoUrl,
          a.occurredAt,
          a.externalAlertId ?? null,
          JSON.stringify(a.rawPayload ?? {}),
        ],
      );
    }
  }
  return affectedRows > 0;
}

/**
 * Sensor-type-specific thresholds for `*_changed` event emission. Without
 * these, every fuel/weight reading would emit an event (57k+/day for a
 * 20-vehicle fleet) — most listeners only care about meaningful deltas
 * (a top-up, a load drop, a dump truck unloading). Numbers are tunable
 * but conservative enough to surface real operational events while
 * suppressing sensor noise.
 */
const SENSOR_DELTA_THRESHOLDS: Record<string, number> = {
  fuel_level: 5,    // litres — sub-5L drift is noise; ≥5L is a fill/drain.
  weight: 200,      // kg     — under 200kg is suspension noise.
};

export async function persistSensor(
  companyId: number,
  branchId: number | null,
  device: DeviceRow,
  s: NormalizedSensorReading,
): Promise<boolean> {
  const { affectedRows, insertId } = await rawExecute(
    `INSERT INTO fleet_sensor_readings
       ("companyId","branchId","deviceId","vehicleId","sensorType",
        "sensorChannel","readingValue","readingState",unit,"occurredAt",
        "externalReadingId","rawPayload")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT ("deviceId","externalReadingId") DO NOTHING
     RETURNING id`,
    [
      companyId,
      branchId,
      device.id,
      device.vehicleId,
      s.sensorType,
      s.sensorChannel ?? null,
      s.readingValue ?? null,
      s.readingState ?? null,
      s.unit ?? null,
      s.occurredAt,
      s.externalReadingId ?? null,
      JSON.stringify(s.rawPayload ?? {}),
    ],
  );
  if (affectedRows > 0) {
    const eventName =
      s.sensorType === "pto"
        ? ptoEventForState(s.readingState)
        : s.sensorType === "dump_piston"
          ? dumpPistonEventForState(s.readingState)
          : sensorEventMap[s.sensorType];

    if (eventName) {
      let shouldEmit = true;
      const threshold = SENSOR_DELTA_THRESHOLDS[s.sensorType];

      // Delta-aware emission for fuel/weight. PTO and dump_piston are
      // state-transitions (on/off, up/down) and already emit only on
      // genuine changes via *EventForState above — so we only enforce
      // a threshold when the sensor type has a numeric threshold AND
      // the current reading is numeric.
      if (threshold !== undefined && s.readingValue !== undefined && s.readingValue !== null) {
        const prev = await rawQuery<{ readingValue: string | null }>(
          `SELECT "readingValue" FROM fleet_sensor_readings
            WHERE "deviceId" = $1 AND "sensorType" = $2 AND id <> $3
            ORDER BY "occurredAt" DESC LIMIT 1`,
          [device.id, s.sensorType, insertId],
        );
        const prevVal = prev[0]?.readingValue != null ? Number(prev[0].readingValue) : null;
        if (prevVal !== null && Math.abs(s.readingValue - prevVal) < threshold) {
          shouldEmit = false;
        }
      }

      if (shouldEmit) {
        void emitEvent({
          companyId,
          branchId: branchId ?? undefined,
          userId: null,
          action: eventName,
          entity: "fleet_sensor_readings",
          entityId: insertId,
          details: `${s.sensorType} — ${s.readingValue ?? s.readingState ?? "—"}`,
          after: { readingId: insertId, vehicleId: device.vehicleId, readingValue: s.readingValue },
        });
      }
    }
  }
  return affectedRows > 0;
}

function maskCmsv6Config(config: unknown): Record<string, unknown> {
  if (!config || typeof config !== "object") return {};
  const masked: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
    if (["password", "apiKey", "secret", "token"].includes(k) && typeof v === "string") {
      masked[k] = v.length > 4 ? `***${v.slice(-2)}` : "***";
    } else {
      masked[k] = v;
    }
  }
  return masked;
}

export default router;
