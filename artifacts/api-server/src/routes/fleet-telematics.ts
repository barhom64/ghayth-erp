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
import { isCoordinationHealthy } from "../lib/fleet/telematicsBreakerCoordinator.js";
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
  // Retention / heartbeat tunables (migration 230 + 232). Range-checked
  // at the DB level too; we mirror the bounds here for a nice error.
  positionRetentionDays: z.coerce.number().int().min(1).max(3650).optional(),
  syncLogRetentionDays: z.coerce.number().int().min(1).max(365).optional(),
  videoAccessLogRetentionDays: z.coerce.number().int().min(1).max(365).optional(),
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
// Pagination helper — offset-based, clamped. Cursor pagination would be
// nicer at very large scale but offset is enough for the Pilot's row
// counts (≤ 100k positions/day, even smaller for alerts/logs). The
// `meta.hasMore` field is a heuristic: when data.length === limit we
// assume there's at least one more row available. This avoids the
// COUNT(*) cost that exact pagination would require.
// ─────────────────────────────────────────────────────────────────────────
function parsePagination(req: { query: Record<string, unknown> }): {
  limit: number;
  offset: number;
} {
  const rawLimit = Number(req.query.limit);
  const rawOffset = Number(req.query.offset);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(500, Math.max(1, Math.floor(rawLimit)))
    : 100;
  const offset = Number.isFinite(rawOffset)
    ? Math.min(100_000, Math.max(0, Math.floor(rawOffset)))
    : 0;
  return { limit, offset };
}

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
  /** Days of fleet_video_access_logs kept (migration 232). */
  videoAccessLogRetentionDays: number;
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
           LEFT JOIN fleet_vehicles v ON v.id = d."vehicleId" AND v."companyId" = d."companyId" AND v."deletedAt" IS NULL
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
        `SELECT id FROM fleet_vehicles
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
            "positionRetentionDays","syncLogRetentionDays",
            "videoAccessLogRetentionDays","offlineThresholdSec",
            notes,"createdBy")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
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
          body.videoAccessLogRetentionDays ?? 90,
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
      if (body.videoAccessLogRetentionDays !== undefined) setField("videoAccessLogRetentionDays", body.videoAccessLogRetentionDays);
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
           JOIN fleet_telematics_devices d ON d.id = p."deviceId" AND d."companyId" = p."companyId" AND d."deletedAt" IS NULL
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
           LEFT JOIN fleet_vehicles v ON v.id = d."vehicleId" AND v."companyId" = d."companyId" AND v."deletedAt" IS NULL
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
        `SELECT a.*, v."plateNumber" AS "vehiclePlate", d."deviceLabel",
                dr.name AS "driverName"
           FROM fleet_ai_alerts a
           LEFT JOIN fleet_vehicles v ON v.id = a."vehicleId" AND v."companyId" = a."companyId" AND v."deletedAt" IS NULL
           LEFT JOIN fleet_telematics_devices d ON d.id = a."deviceId" AND d."companyId" = a."companyId" AND d."deletedAt" IS NULL
           LEFT JOIN fleet_drivers dr ON dr.id = a."driverId" AND dr."companyId" = a."companyId" AND dr."deletedAt" IS NULL
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

      // #1354 Ibrahim review — Video Security Layer.
      //
      // Phase 1 (cb870a1): the client never receives the raw streamUrl
      // on session open; only a proxy URL bound to a short-lived token.
      //
      // Phase 2 (this commit): for HLS streams (the browser-playable
      // format) the proxy URL leads to a server-side stream proxy —
      // the raw streamUrl never reaches the browser at all.
      //
      // The proxy token TTL matches the session duration so HLS players
      // can keep fetching segments throughout a live stream (60s default
      // would expire mid-playback). Clearing on close + retention sweep
      // bounds the leak window to the session lifetime.
      const proxyToken = randomBytes(32).toString("base64url");
      const sessionTtlMs = expiresAt.getTime() - Date.now();
      const baseTtlMs = config.fleetTelematics.proxyTtlSec * 1000;
      const proxyExpiresAt = new Date(Date.now() + Math.max(baseTtlMs, sessionTtlMs));

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
// Phase 1 (cb870a1): the raw CMSV6 streamUrl never appears in the open
// session response; the client gets a one-shot proxy URL bound to a
// short-lived token, and every redemption is audited in
// fleet_video_access_logs.
//
// Phase 2 (this commit): for HLS streams the raw URL never reaches the
// browser AT ALL. The proxy fetches the M3U8 playlist server-side,
// rewrites every segment line to point back at our /segment/:filename
// route, and streams segment bytes through Express → the client. The
// CMSV6 URL stays inside the server boundary; an attacker watching the
// network tab sees only our proxy URLs.
//
// Non-HLS streams (RTSP, http-flv, webrtc) still use the JSON gate —
// they need a native player anyway and aren't browser-replayable
// without one. The proxy URL there returns the underlying URL only
// after token + user + audit checks pass.
// ─────────────────────────────────────────────────────────────────────────

interface VideoSessionGate {
  id: number;
  companyId: number;
  status: string;
  streamUrl: string | null;
  streamType: string;
  streamProxyToken: string | null;
  streamProxyExpiresAt: Date | null;
  requestedBy: number;
}

type AccessLogStatus =
  | "granted"
  | "denied_token"
  | "denied_expired"
  | "denied_session"
  | "denied_user";

/**
 * Loads the session row needed by every proxy variant. Filters by the
 * caller's allowedCompanies so cross-tenant probing returns 404.
 */
async function loadVideoSession(
  sessionId: number,
  allowedCompanies: number[],
): Promise<VideoSessionGate | null> {
  const rows = await rawQuery<VideoSessionGate>(
    `SELECT id, "companyId", status, "streamUrl", "streamType",
            "streamProxyToken", "streamProxyExpiresAt", "requestedBy"
       FROM fleet_video_sessions
      WHERE id = $1 AND "companyId" = ANY($2::int[])`,
    [sessionId, allowedCompanies],
  );
  return rows[0] ?? null;
}

/**
 * Forensic write to fleet_video_access_logs. Best-effort: a DB failure
 * here MUST NOT crash the stream request, but it IS logged loudly so
 * the operator can investigate.
 */
async function logVideoAccess(
  companyId: number,
  sessionId: number,
  userId: number | null,
  status: AccessLogStatus,
  accessIp: string | null,
  userAgent: string | null,
  errorReason?: string,
): Promise<void> {
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
}

/**
 * Returns null when the request is allowed to proceed, otherwise the
 * (status, errorReason) tuple to log + the HTTP status + JSON message
 * the caller should write. Centralised so the four proxy routes
 * (playlist, segment, JSON, and the existing one-shot endpoint) all
 * apply the same five-layer gate identically — a future change to the
 * security model touches one function, not four.
 */
async function gateVideoProxyRequest(opts: {
  sessionId: number;
  allowedCompanies: number[];
  userId: number;
  presentedToken: string;
  accessIp: string | null;
  userAgent: string | null;
}): Promise<
  | { ok: true; session: VideoSessionGate }
  | { ok: false; httpStatus: number; body: { error: string } }
> {
  const session = await loadVideoSession(opts.sessionId, opts.allowedCompanies);
  if (!session) {
    return { ok: false, httpStatus: 404, body: { error: "الجلسة غير موجودة" } };
  }
  // Token: timing-safe compare + length guard.
  if (
    !opts.presentedToken ||
    !session.streamProxyToken ||
    opts.presentedToken.length !== session.streamProxyToken.length ||
    !timingSafeEqual(Buffer.from(opts.presentedToken), Buffer.from(session.streamProxyToken))
  ) {
    await logVideoAccess(
      session.companyId, session.id, opts.userId, "denied_token",
      opts.accessIp, opts.userAgent, "token mismatch",
    );
    return { ok: false, httpStatus: 401, body: { error: "رمز الوصول غير صالح" } };
  }
  // TTL.
  if (!session.streamProxyExpiresAt || session.streamProxyExpiresAt.getTime() < Date.now()) {
    await logVideoAccess(
      session.companyId, session.id, opts.userId, "denied_expired",
      opts.accessIp, opts.userAgent, "proxy token expired",
    );
    return { ok: false, httpStatus: 401, body: { error: "انتهت صلاحية رمز الوصول" } };
  }
  // Session lifecycle.
  if (session.status !== "active" || !session.streamUrl) {
    await logVideoAccess(
      session.companyId, session.id, opts.userId, "denied_session",
      opts.accessIp, opts.userAgent, `session status=${session.status}`,
    );
    return { ok: false, httpStatus: 409, body: { error: "الجلسة غير نشطة" } };
  }
  // User binding.
  if (session.requestedBy !== opts.userId) {
    await logVideoAccess(
      session.companyId, session.id, opts.userId, "denied_user",
      opts.accessIp, opts.userAgent, "different user",
    );
    return { ok: false, httpStatus: 403, body: { error: "هذه الجلسة لمستخدم آخر" } };
  }
  return { ok: true, session };
}

/**
 * Rewrites an HLS playlist (`.m3u8` text) so every URL points at our
 * proxy routes. Supports both media playlists (segments) and master
 * playlists (variant streams + alternate media).
 *
 * Routing rules:
 *   • URL preceded by `#EXT-X-STREAM-INF` / `#EXT-X-I-FRAME-STREAM-INF`
 *     → `/playlist.m3u8?token=…&variant=<path>` (variant playlist)
 *   • `#EXT-X-MEDIA:URI="…"` (audio/subtitle alternate playlists)
 *     → rewritten URI inside the tag, same variant route
 *   • `#EXT-X-MAP:URI="…"` (init segment for fmp4 streams)
 *     → rewritten URI inside the tag, segment route
 *   • `#EXT-X-KEY:URI="…"` (encryption key URL)
 *     → rewritten URI inside the tag, segment route
 *   • Any other URL → `/segment/<filename>?token=…` (media segment)
 *
 * Same-origin enforcement: any URL whose resolved host differs from the
 * original playlist host is DROPPED (URI tag) or LINE-SKIPPED (bare URL).
 * This means a CMSV6 playlist that points segments at evil.example.net
 * never makes us proxy that host — defence against vendor compromise.
 *
 * @param body         text of the original .m3u8 fetched from CMSV6
 * @param originalUrl  full CMSV6 playlist URL (used to resolve relative
 *                     URLs and enforce same-origin)
 * @param sessionId    fleet_video_sessions.id
 * @param token        streamProxyToken
 * @returns rewritten playlist (still valid M3U8 syntax)
 */
function rewriteHlsPlaylist(
  body: string,
  originalUrl: string,
  sessionId: number,
  token: string,
): string {
  const base = new URL(originalUrl);
  const segmentRoot = `/api/fleet/telematics/video/proxy/${sessionId}/segment`;
  const playlistRoot = `/api/fleet/telematics/video/proxy/${sessionId}/playlist.m3u8`;
  const encodedToken = encodeURIComponent(token);

  // Try to resolve `urlText` against the playlist URL and return the
  // proxied URL. Returns null when the URL is off-origin or unparseable
  // — caller decides what to do with that (drop the line / drop the
  // attribute).
  const proxify = (urlText: string, mode: "segment" | "variant"): string | null => {
    let resolved: URL;
    try {
      resolved = new URL(urlText, base);
    } catch {
      return null;
    }
    if (resolved.host !== base.host) return null;
    // Preserve the absolute pathname (with leading `/`) so when the
    // segment / playlist endpoint resolves the encoded tail against the
    // session's streamUrl, it lands on the right absolute path instead
    // of being doubled up under the playlist's own directory.
    const tail =
      resolved.pathname +
      (resolved.search.length > 0 ? resolved.search : "");
    if (mode === "variant") {
      return `${playlistRoot}?token=${encodedToken}&variant=${encodeURIComponent(tail)}`;
    }
    return `${segmentRoot}/${encodeURIComponent(tail)}?token=${encodedToken}`;
  };

  // Rewrites `URI="..."` attributes inside an EXT-X-MEDIA / EXT-X-MAP /
  // EXT-X-KEY tag. Off-origin URIs cause the WHOLE tag to be dropped —
  // a missing alternate audio track is recoverable; a leaked URL is not.
  const rewriteUriAttribute = (
    tagLine: string,
    mode: "segment" | "variant",
  ): string | null => {
    const match = tagLine.match(/URI="([^"]*)"/);
    if (!match) return tagLine; // no URI attribute present
    const proxied = proxify(match[1], mode);
    if (proxied === null) return null;
    return tagLine.replace(/URI="[^"]*"/, `URI="${proxied}"`);
  };

  let prevTag = "";
  const isVariantContext = (tag: string): boolean =>
    /^#EXT-X-STREAM-INF/i.test(tag) || /^#EXT-X-I-FRAME-STREAM-INF/i.test(tag);

  const out: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      out.push(rawLine);
      continue;
    }
    if (line.startsWith("#")) {
      // Tags that carry inline URIs need rewriting:
      //   • EXT-X-MEDIA  (audio/subtitle alternate playlists) → variant
      //   • EXT-X-MAP    (initialization segment for fmp4)    → segment
      //   • EXT-X-KEY    (decryption key URL)                 → segment
      if (
        /^#EXT-X-MEDIA[: ]/.test(line) ||
        /^#EXT-X-I-FRAME-STREAM-INF[: ]/.test(line)
      ) {
        // EXT-X-MEDIA = alternate renditions (audio / subtitles)
        // EXT-X-I-FRAME-STREAM-INF = trick-play variant playlist
        // Both reference a sub-playlist via URI="…".
        const rewritten = rewriteUriAttribute(line, "variant");
        if (rewritten !== null) out.push(rewritten);
        // off-origin URI ⇒ drop the whole tag
      } else if (/^#EXT-X-MAP[: ]/.test(line) || /^#EXT-X-KEY[: ]/.test(line)) {
        const rewritten = rewriteUriAttribute(line, "segment");
        if (rewritten !== null) out.push(rewritten);
      } else {
        out.push(rawLine);
      }
      prevTag = line;
      continue;
    }
    // Bare URL line — variant or segment depending on the prior tag.
    const mode: "segment" | "variant" = isVariantContext(prevTag)
      ? "variant"
      : "segment";
    const proxied = proxify(line, mode);
    if (proxied !== null) out.push(proxied);
    // off-origin or unparseable ⇒ drop, leave a gap; player will skip.
    prevTag = "";
  }
  return out.join("\n");
}

router.get(
  "/telematics/video/proxy/:id",
  authorize({ feature: "fleet.telematics.video", action: "view" }),
  async (req, res) => {
    const sessionId = parseId(req.params.id);
    const presentedToken = String(req.query.token ?? "");
    const accessIp = req.ip ?? null;
    const userAgent = req.header("user-agent") ?? null;

    try {
      const scope = req.scope!;
      const gate = await gateVideoProxyRequest({
        sessionId,
        allowedCompanies: scope.allowedCompanies,
        userId: scope.userId,
        presentedToken,
        accessIp,
        userAgent,
      });
      if (!gate.ok) {
        res.status(gate.httpStatus).json(gate.body);
        return;
      }
      await logVideoAccess(
        gate.session.companyId, sessionId, scope.userId, "granted",
        accessIp, userAgent,
      );
      // The response carries a token-bound URL — even though it's per-
      // user and short-lived, browsers + reverse proxies must not store
      // it. Without these headers a back-button or shared cache could
      // resurrect a token-bound URL after the operator closed the
      // stream. Mirror the headers used by the playlist + segment routes.
      res.setHeader("cache-control", "no-store, no-cache, must-revalidate, private");
      res.setHeader("pragma", "no-cache");
      // For HLS streams Phase 2 takes over: redirect the caller to the
      // playlist proxy so the raw streamUrl never leaves this server.
      if (gate.session.streamType === "hls") {
        const playlistPath = `/api/fleet/telematics/video/proxy/${sessionId}/playlist.m3u8?token=${encodeURIComponent(presentedToken)}`;
        res.json({
          data: {
            playlistUrl: playlistPath,
            streamType: "hls",
            expiresAt: gate.session.streamProxyExpiresAt!.toISOString(),
            proxyMode: "phase2-stream",
          },
        });
        return;
      }
      // Non-HLS (RTSP, http-flv, webrtc): native players need the
      // underlying URL; the gate + audit are the protection layer.
      res.json({
        data: {
          streamUrl: gate.session.streamUrl,
          streamType: gate.session.streamType,
          expiresAt: gate.session.streamProxyExpiresAt!.toISOString(),
          proxyMode: "phase1-json",
        },
      });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics-video-proxy");
    }
  },
);

// ─── Phase 2: HLS playlist proxy ─────────────────────────────────────────
// Server-side fetches CMSV6's .m3u8, rewrites every segment URL to point
// back at this server, returns the rewritten playlist. The browser's
// HLS player sees ONLY our URLs; the CMSV6 URL never appears in the
// network tab, the page source, or any leak surface.
router.get(
  "/telematics/video/proxy/:id/playlist.m3u8",
  authorize({ feature: "fleet.telematics.video", action: "view" }),
  async (req, res) => {
    const sessionId = parseId(req.params.id);
    const presentedToken = String(req.query.token ?? "");
    const variantParam = req.query.variant ? String(req.query.variant) : null;
    const accessIp = req.ip ?? null;
    const userAgent = req.header("user-agent") ?? null;

    try {
      const scope = req.scope!;
      const gate = await gateVideoProxyRequest({
        sessionId,
        allowedCompanies: scope.allowedCompanies,
        userId: scope.userId,
        presentedToken,
        accessIp,
        userAgent,
      });
      if (!gate.ok) {
        res.status(gate.httpStatus).json(gate.body);
        return;
      }

      // Determine which playlist to fetch:
      //   • no variant param      → session's main playlist (master OR
      //                             single-variant — caller doesn't know)
      //   • variant=<encoded path> → variant playlist, resolved against
      //                              the master playlist URL with same-
      //                              origin + same-prefix enforcement
      const base = new URL(gate.session.streamUrl!);
      // The "allowed directory" for variant + segment lookups. URL
      // normalisation absorbs `..` segments so we can't catch traversal
      // with a string scan — instead we require the resolved path to
      // start with the playlist's parent directory. This still allows
      // legitimate sibling files (high.m3u8, audio/ar.m3u8) while
      // refusing `../../etc/passwd` which would normalise to `/etc/...`.
      const basePathDir = base.pathname.replace(/\/[^/]*$/, "/") || "/";
      let targetUrl: string;
      if (variantParam) {
        let resolved: URL;
        try {
          resolved = new URL(decodeURIComponent(variantParam), base);
        } catch {
          res.status(400).json({ error: "متغيّر playlist غير صالح" });
          return;
        }
        if (resolved.host !== base.host) {
          res.status(400).json({ error: "playlist خارج النطاق المسموح" });
          return;
        }
        if (!resolved.pathname.startsWith(basePathDir)) {
          res.status(400).json({ error: "playlist خارج المجلد المسموح" });
          return;
        }
        targetUrl = resolved.toString();
      } else {
        targetUrl = gate.session.streamUrl!;
      }

      await logVideoAccess(
        gate.session.companyId, sessionId, scope.userId, "granted",
        accessIp, userAgent, variantParam ? `playlist-variant:${variantParam}` : "playlist",
      );

      // Fetch the M3U8 server-side. AbortController so a stuck CMSV6
      // can't tie up an Express handler indefinitely.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      let upstream: Response;
      try {
        upstream = await fetch(targetUrl, {
          signal: controller.signal,
          headers: { accept: "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain" },
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!upstream.ok) {
        res.status(502).json({ error: `CMSV6 playlist fetch failed: HTTP ${upstream.status}` });
        return;
      }
      const body = await upstream.text();
      // Rewriter uses targetUrl as the base so variant playlists with
      // their own relative segment paths resolve correctly. The
      // rewriter handles master playlists (variant lines) and media
      // playlists (segment lines) in the same pass.
      const rewritten = rewriteHlsPlaylist(
        body,
        targetUrl,
        sessionId,
        presentedToken,
      );
      res.setHeader("content-type", "application/vnd.apple.mpegurl");
      // No-cache: live streams update; recorded streams shouldn't be
      // stored in shared caches because each token-bound URL is unique.
      res.setHeader("cache-control", "no-store, no-cache, must-revalidate, private");
      res.send(rewritten);
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics-video-playlist");
    }
  },
);

// ─── Phase 2: HLS segment proxy ──────────────────────────────────────────
// The rewritten playlist sends segment requests back here. We re-validate
// the token (segment requests are independent — the player can retry,
// seek, etc.) and stream the bytes from CMSV6 to the client without
// buffering the whole segment in memory.
//
// Same-origin guard: the resolved upstream URL must share host with the
// session's streamUrl. A hostile playlist that bypassed the rewriter
// (or a fabricated request) cannot make us proxy arbitrary URLs.
router.get(
  "/telematics/video/proxy/:id/segment/:filename",
  authorize({ feature: "fleet.telematics.video", action: "view" }),
  async (req, res) => {
    const sessionId = parseId(req.params.id);
    const presentedToken = String(req.query.token ?? "");
    const accessIp = req.ip ?? null;
    const userAgent = req.header("user-agent") ?? null;
    const filename = String(req.params.filename);

    try {
      const scope = req.scope!;
      const gate = await gateVideoProxyRequest({
        sessionId,
        allowedCompanies: scope.allowedCompanies,
        userId: scope.userId,
        presentedToken,
        accessIp,
        userAgent,
      });
      if (!gate.ok) {
        res.status(gate.httpStatus).json(gate.body);
        return;
      }
      // Resolve segment URL against the playlist URL, enforce same-origin
      // AND same-prefix (the playlist's parent directory). URL constructor
      // normalises `..` segments so a string scan won't catch traversal —
      // the basePathDir startsWith check does.
      const base = new URL(gate.session.streamUrl!);
      const basePathDir = base.pathname.replace(/\/[^/]*$/, "/") || "/";
      let target: URL;
      try {
        // filename was URL-encoded by the rewriter to preserve any
        // query string (signed CDN segments). Decode once.
        target = new URL(decodeURIComponent(filename), base);
      } catch {
        res.status(400).json({ error: "اسم المقطع غير صالح" });
        return;
      }
      if (target.host !== base.host) {
        res.status(400).json({ error: "المقطع خارج النطاق المسموح" });
        return;
      }
      if (!target.pathname.startsWith(basePathDir)) {
        res.status(400).json({ error: "المقطع خارج المجلد المسموح" });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      // Cancel the upstream fetch + reader when the client disconnects
      // mid-segment. Without this, an HLS player that stops the stream
      // (operator clicks "stop", browser navigates away, network drops)
      // would leave the upstream socket + ReadableStream lock in place
      // until they timed out — a per-segment file-descriptor leak under
      // live streaming. The handler removes the listener on normal
      // completion so we don't double-fire.
      const onClientClose = () => controller.abort();
      req.on("close", onClientClose);
      let upstream: Response;
      try {
        upstream = await fetch(target.toString(), { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!upstream.ok) {
        req.off("close", onClientClose);
        res.status(upstream.status === 404 ? 404 : 502).end();
        return;
      }
      // Pass through useful headers but never the upstream Set-Cookie or
      // any auth-bearing header.
      const ct = upstream.headers.get("content-type") ?? "video/mp2t";
      const cl = upstream.headers.get("content-length");
      res.setHeader("content-type", ct);
      if (cl) res.setHeader("content-length", cl);
      res.setHeader("cache-control", "no-store, no-cache, must-revalidate, private");

      // Cheap audit: count granted segments. Logging EVERY segment would
      // flood the table during a long live stream (1 segment/2-10s).
      // The playlist log + start-of-session log + end-of-session log are
      // enough for forensic reconstruction.
      const body = upstream.body;
      if (!body) {
        req.off("close", onClientClose);
        res.end();
        return;
      }
      // Stream the response. Web ReadableStream → Node Buffer chunks.
      const reader = body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) {
            // Backpressure: wait for the client to drain before pulling more.
            await new Promise<void>((resolve) => res.once("drain", () => resolve()));
          }
        }
        res.end();
      } catch (streamErr) {
        // AbortError (client disconnect) is expected; anything else is a
        // genuine upstream failure that we surface to the operator's
        // server logs. The response is already partially flushed so we
        // can only destroy it.
        if (!(streamErr instanceof Error) || streamErr.name !== "AbortError") {
          logger.warn({ err: streamErr, sessionId }, "video segment stream aborted");
        }
        try { reader.cancel().catch(() => undefined); } catch { /* noop */ }
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.destroy();
        }
      } finally {
        req.off("close", onClientClose);
      }
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics-video-segment");
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
           LEFT JOIN fleet_vehicles v ON v.id = s."vehicleId" AND v."companyId" = s."companyId" AND v."deletedAt" IS NULL
           LEFT JOIN fleet_telematics_devices d ON d.id = s."deviceId" AND d."companyId" = s."companyId" AND d."deletedAt" IS NULL
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
      const { limit, offset } = parsePagination(req);
      const rows = await rawQuery(
        `SELECT * FROM fleet_device_sync_logs
          WHERE "companyId" = ANY($1::int[])
          ORDER BY "startedAt" DESC
          LIMIT $2 OFFSET $3`,
        [scope.allowedCompanies, limit, offset],
      );
      res.json({
        data: rows,
        meta: { limit, offset, hasMore: rows.length === limit },
      });
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
      res.json({
        data: filtered,
        meta: {
          // Surfaces whether multi-replica Redis pub/sub coordination is
          // currently up — so an operator looking at "why are all
          // replicas still hammering CMSV6?" can see immediately whether
          // they're seeing per-replica state or coordinated state.
          coordination: {
            enabled: isCoordinationHealthy(),
            mode: isCoordinationHealthy() ? "redis-pubsub" : "per-replica",
          },
        },
      });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// AI Media Evidence search — operator-facing forensic archive.
//
// Media rows accumulate from two paths:
//   • Auto-attached at alert persist time (image / video URLs that
//     CMSV6 ships in the alarm payload). One row per URL.
//   • Future: manual operator uploads via a "request evidence" workflow.
//
// This endpoint surfaces the archive with the filters operators
// actually need: date range, vehicle, mediaType (image / video / audio),
// and AI alert category. The query joins the alert row so the operator
// can see WHY the evidence was captured without a second round-trip.
//
// Pagination: offset+limit via `parsePagination`. Cursor-based
// (uploadedAt DESC, id DESC) would scale better, but for the Pilot's
// row counts offset is enough and matches the rest of the system.
// Default limit 100, max 500, max offset 100_000.
// ─────────────────────────────────────────────────────────────────────────
router.get(
  "/telematics/media-evidence",
  authorize({ feature: "fleet.telematics.ai_alerts", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { limit, offset } = parsePagination(req);
      const from = req.query.from ? String(req.query.from) : null;
      const to = req.query.to ? String(req.query.to) : null;
      const vehicleId = req.query.vehicleId ? Number(req.query.vehicleId) : null;
      const mediaType = req.query.mediaType ? String(req.query.mediaType) : null;
      const category = req.query.category ? String(req.query.category) : null;

      const conditions: string[] = [`m."companyId" = ANY($1::int[])`];
      const params: unknown[] = [scope.allowedCompanies];
      let paramIdx = 2;
      if (from) {
        conditions.push(`m."uploadedAt" >= $${paramIdx++}`);
        params.push(from);
      }
      if (to) {
        conditions.push(`m."uploadedAt" <= $${paramIdx++}`);
        params.push(to);
      }
      if (vehicleId !== null && Number.isFinite(vehicleId)) {
        conditions.push(`m."vehicleId" = $${paramIdx++}`);
        params.push(vehicleId);
      }
      if (mediaType && ["image", "video", "audio"].includes(mediaType)) {
        conditions.push(`m."mediaType" = $${paramIdx++}`);
        params.push(mediaType);
      }
      if (category && ["adas", "dms", "bsd", "safety", "other"].includes(category)) {
        conditions.push(`a.category = $${paramIdx++}`);
        params.push(category);
      }

      const rows = await rawQuery(
        `SELECT m.id, m."mediaType", m."mediaUrl", m."thumbnailUrl",
                m."durationSec", m."sizeBytes", m."occurredAt", m."uploadedAt",
                m."uploadedBy", m."channelNo",
                m."alertId", m."vehicleId", m."deviceId",
                a.category AS "alertCategory",
                a."alertType",
                a.severity AS "alertSeverity",
                v."plateNumber" AS "vehiclePlate",
                d."deviceLabel"
           FROM fleet_media_evidence m
           LEFT JOIN fleet_ai_alerts a ON a.id = m."alertId" AND a."companyId" = m."companyId"
           LEFT JOIN fleet_vehicles v ON v.id = m."vehicleId" AND v."companyId" = m."companyId" AND v."deletedAt" IS NULL
           LEFT JOIN fleet_telematics_devices d ON d.id = m."deviceId" AND d."companyId" = m."companyId" AND d."deletedAt" IS NULL
          WHERE ${conditions.join(" AND ")}
          ORDER BY m."uploadedAt" DESC, m.id DESC
          LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, limit, offset],
      );
      res.json({
        data: rows,
        meta: { limit, offset, hasMore: rows.length === limit },
      });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// Single-row detail — used by the modal/drawer on the evidence search
// page so the operator can see the raw payload + the originating
// session if any.
router.get(
  "/telematics/media-evidence/:id",
  authorize({ feature: "fleet.telematics.ai_alerts", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const [row] = await rawQuery(
        `SELECT m.*, a.category AS "alertCategory", a."alertType",
                a.severity AS "alertSeverity", a.confidence AS "alertConfidence",
                a."occurredAt" AS "alertOccurredAt",
                v."plateNumber" AS "vehiclePlate",
                d."deviceLabel"
           FROM fleet_media_evidence m
           LEFT JOIN fleet_ai_alerts a ON a.id = m."alertId" AND a."companyId" = m."companyId"
           LEFT JOIN fleet_vehicles v ON v.id = m."vehicleId" AND v."companyId" = m."companyId" AND v."deletedAt" IS NULL
           LEFT JOIN fleet_telematics_devices d ON d.id = m."deviceId" AND d."companyId" = m."companyId" AND d."deletedAt" IS NULL
          WHERE m.id = $1 AND m."companyId" = ANY($2::int[])`,
        [id, scope.allowedCompanies],
      );
      if (!row) throw new NotFoundError("الدليل غير موجود");
      res.json({ data: row });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Media evidence byte proxy — closes the URL-exposure gap left by the
// evidence archive (bf60d73). Without this, the evidence search page
// renders `<img src={r.mediaUrl}>` which fetches directly from the
// CMSV6 host — the URL leaks into browser network tab, history, and
// any DOM-inspection vector. The proxy streams bytes through the
// server so the only URL the browser ever sees is our own.
//
// Same RBAC gate as the list endpoint (`fleet.telematics.ai_alerts:view`)
// plus per-tenant scope. Defence-in-depth SSRF guard: any media URL
// pointing at an IP-literal in private space is rejected before fetch
// (operator-controlled config means a hostile mediaUrl would have had
// to come from a CMSV6 compromise; still worth refusing). DNS resolution
// is intentionally skipped — the per-image fetch cost would be
// prohibitive under live operator browsing.
// ─────────────────────────────────────────────────────────────────────────
function isPrivateIpLiteral(host: string): boolean {
  if (host === "localhost" || host === "::1" || host === "0.0.0.0") return true;
  const parts = host.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n) && n >= 0 && n < 256)) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 127 || parts[0] === 0) return true;
  }
  // IPv6 private/link-local prefixes.
  if (/^\[?(fc|fd|fe8|fe9|fea|feb)/i.test(host)) return true;
  return false;
}

function defaultMediaContentType(mediaType: string): string {
  if (mediaType === "video") return "video/mp4";
  if (mediaType === "audio") return "audio/mpeg";
  return "image/jpeg";
}

router.get(
  "/telematics/media-evidence/:id/blob",
  authorize({ feature: "fleet.telematics.ai_alerts", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const [row] = await rawQuery<{
        id: number;
        companyId: number;
        mediaUrl: string;
        mediaType: string;
      }>(
        `SELECT id, "companyId", "mediaUrl", "mediaType"
           FROM fleet_media_evidence
          WHERE id = $1 AND "companyId" = ANY($2::int[])`,
        [id, scope.allowedCompanies],
      );
      if (!row) throw new NotFoundError("الدليل غير موجود");

      let upstream: URL;
      try {
        upstream = new URL(row.mediaUrl);
      } catch {
        res.status(400).json({ error: "عنوان الدليل غير صالح" });
        return;
      }
      if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
        res.status(400).json({ error: "بروتوكول غير مدعوم" });
        return;
      }
      if (isPrivateIpLiteral(upstream.hostname)) {
        res.status(400).json({ error: "العنوان يشير إلى شبكة خاصة" });
        return;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const onClientClose = () => controller.abort();
      req.on("close", onClientClose);
      let upresp: Response;
      try {
        upresp = await fetch(row.mediaUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      if (!upresp.ok) {
        req.off("close", onClientClose);
        res.status(upresp.status === 404 ? 404 : 502).end();
        return;
      }

      const ct = upresp.headers.get("content-type") ?? defaultMediaContentType(row.mediaType);
      const cl = upresp.headers.get("content-length");
      res.setHeader("content-type", ct);
      if (cl) res.setHeader("content-length", cl);
      // Private cache — per-user RBAC means this response is not shareable.
      res.setHeader("cache-control", "private, max-age=300");
      res.setHeader("x-content-type-options", "nosniff");

      const body = upresp.body;
      if (!body) {
        req.off("close", onClientClose);
        res.end();
        return;
      }
      const reader = body.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!res.write(Buffer.from(value))) {
            await new Promise<void>((resolve) => res.once("drain", () => resolve()));
          }
        }
        res.end();
      } catch (streamErr) {
        if (!(streamErr instanceof Error) || streamErr.name !== "AbortError") {
          logger.warn({ err: streamErr, evidenceId: id }, "media blob stream aborted");
        }
        try { reader.cancel().catch(() => undefined); } catch { /* noop */ }
        if (!res.headersSent) {
          res.status(502).end();
        } else {
          res.destroy();
        }
      } finally {
        req.off("close", onClientClose);
      }
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────
// Driver Safety Scorecard — operator-facing accountability surface.
//
// Aggregates fleet_ai_alerts grouped by driver to produce a "safety
// score" (100 minus a weighted sum of severity-weighted alert counts).
// The driverId is populated by persistAlert via a fleet_trips lookup at
// alert time — so this surface only includes alerts that landed during
// an in-progress trip.
//
// Severity weights (decreasing safety):
//   • info     → 0   (no penalty — informational only)
//   • low      → 1
//   • medium   → 3
//   • high     → 7
//   • critical → 15
//
// Score formula: max(0, 100 - SUM(severityWeight * alertCount))
//
// Three endpoints:
//   • Per-driver scorecard with full breakdown by category + severity
//   • Per-driver alert history (last 50 in the window)
//   • Fleet-wide leaderboard ranked by score ascending (worst first)
// ─────────────────────────────────────────────────────────────────────────

const SEVERITY_WEIGHT_SQL = `
  CASE severity
    WHEN 'info' THEN 0
    WHEN 'low' THEN 1
    WHEN 'medium' THEN 3
    WHEN 'high' THEN 7
    WHEN 'critical' THEN 15
    ELSE 0
  END
`;

function scorecardWindow(req: { query: Record<string, unknown> }): { from: string; to: string } {
  // Default to the trailing 30 days when the operator doesn't specify.
  // Limit looking back to 365 days regardless of `from` so a runaway
  // query doesn't scan an unbounded slice.
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
  const earliest = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
  let from = req.query.from ? new Date(String(req.query.from)) : defaultFrom;
  if (Number.isNaN(from.getTime()) || from < earliest) from = earliest;
  let to = req.query.to ? new Date(String(req.query.to)) : now;
  if (Number.isNaN(to.getTime()) || to > now) to = now;
  if (to < from) to = new Date(from.getTime() + 24 * 3600 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

router.get(
  "/telematics/drivers/scorecard-leaderboard",
  authorize({ feature: "fleet.telematics.ai_alerts", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { from, to } = scorecardWindow(req);
      const { limit, offset } = parsePagination(req);

      const rows = await rawQuery(
        `SELECT d.id AS "driverId",
                d.name AS "driverName",
                d."licenseNumber",
                COUNT(a.id)::int AS "totalAlerts",
                SUM(${SEVERITY_WEIGHT_SQL})::int AS "rawPenalty",
                GREATEST(0, 100 - SUM(${SEVERITY_WEIGHT_SQL}))::int AS "safetyScore",
                COUNT(*) FILTER (WHERE category = 'adas')::int AS "adasCount",
                COUNT(*) FILTER (WHERE category = 'dms')::int  AS "dmsCount",
                COUNT(*) FILTER (WHERE category = 'bsd')::int  AS "bsdCount",
                COUNT(*) FILTER (WHERE severity IN ('high','critical'))::int AS "severeCount",
                MAX(a."occurredAt") AS "lastAlertAt"
           FROM fleet_drivers d
           LEFT JOIN fleet_ai_alerts a
             ON a."driverId" = d.id
             AND a."companyId" = ANY($1::int[])
             AND a."occurredAt" >= $2
             AND a."occurredAt" <= $3
          WHERE d."companyId" = ANY($1::int[])
          GROUP BY d.id, d.name, d."licenseNumber"
          ORDER BY "safetyScore" ASC, "totalAlerts" DESC
          LIMIT $4 OFFSET $5`,
        [scope.allowedCompanies, from, to, limit, offset],
      );

      res.json({
        data: rows,
        meta: {
          window: { from, to },
          weights: { info: 0, low: 1, medium: 3, high: 7, critical: 15 },
          maxScore: 100,
          limit, offset, hasMore: rows.length === limit,
        },
      });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);

router.get(
  "/telematics/drivers/:driverId/scorecard",
  authorize({ feature: "fleet.telematics.ai_alerts", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const driverId = parseId(req.params.driverId);
      const { from, to } = scorecardWindow(req);

      // Confirm the driver belongs to a company the caller can see —
      // this is the only place we hand back driver-level breakdowns.
      const [driver] = await rawQuery<{ id: number; name: string; licenseNumber: string | null }>(
        `SELECT id, name, "licenseNumber" FROM fleet_drivers
          WHERE id = $1 AND "companyId" = ANY($2::int[])`,
        [driverId, scope.allowedCompanies],
      );
      if (!driver) throw new NotFoundError("السائق غير موجود");

      const [aggregate] = await rawQuery<{
        totalAlerts: number;
        rawPenalty: number;
        safetyScore: number;
        adasCount: number;
        dmsCount: number;
        bsdCount: number;
        infoCount: number;
        lowCount: number;
        mediumCount: number;
        highCount: number;
        criticalCount: number;
      }>(
        `SELECT
            COUNT(*)::int AS "totalAlerts",
            COALESCE(SUM(${SEVERITY_WEIGHT_SQL}),0)::int AS "rawPenalty",
            GREATEST(0, 100 - COALESCE(SUM(${SEVERITY_WEIGHT_SQL}),0))::int AS "safetyScore",
            COUNT(*) FILTER (WHERE category = 'adas')::int AS "adasCount",
            COUNT(*) FILTER (WHERE category = 'dms')::int  AS "dmsCount",
            COUNT(*) FILTER (WHERE category = 'bsd')::int  AS "bsdCount",
            COUNT(*) FILTER (WHERE severity = 'info')::int     AS "infoCount",
            COUNT(*) FILTER (WHERE severity = 'low')::int      AS "lowCount",
            COUNT(*) FILTER (WHERE severity = 'medium')::int   AS "mediumCount",
            COUNT(*) FILTER (WHERE severity = 'high')::int     AS "highCount",
            COUNT(*) FILTER (WHERE severity = 'critical')::int AS "criticalCount"
           FROM fleet_ai_alerts
          WHERE "driverId" = $1
            AND "companyId" = ANY($2::int[])
            AND "occurredAt" >= $3
            AND "occurredAt" <= $4`,
        [driverId, scope.allowedCompanies, from, to],
      );

      // Top alert types so the operator sees the dominant failure modes.
      const topTypes = await rawQuery(
        `SELECT "alertType", category, COUNT(*)::int AS count
           FROM fleet_ai_alerts
          WHERE "driverId" = $1
            AND "companyId" = ANY($2::int[])
            AND "occurredAt" >= $3
            AND "occurredAt" <= $4
          GROUP BY "alertType", category
          ORDER BY count DESC
          LIMIT 10`,
        [driverId, scope.allowedCompanies, from, to],
      );

      // Recent alerts (50 max) for the timeline view.
      const recent = await rawQuery(
        `SELECT a.id, a.category, a."alertType", a.severity, a.confidence,
                a."occurredAt", a.status,
                v."plateNumber" AS "vehiclePlate"
           FROM fleet_ai_alerts a
           LEFT JOIN fleet_vehicles v ON v.id = a."vehicleId" AND v."companyId" = a."companyId" AND v."deletedAt" IS NULL
          WHERE a."driverId" = $1
            AND a."companyId" = ANY($2::int[])
            AND a."occurredAt" >= $3
            AND a."occurredAt" <= $4
          ORDER BY a."occurredAt" DESC
          LIMIT 50`,
        [driverId, scope.allowedCompanies, from, to],
      );

      res.json({
        data: {
          driver,
          window: { from, to },
          aggregate: aggregate ?? {
            totalAlerts: 0, rawPenalty: 0, safetyScore: 100,
            adasCount: 0, dmsCount: 0, bsdCount: 0,
            infoCount: 0, lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0,
          },
          topAlertTypes: topTypes,
          recent,
        },
        meta: {
          weights: { info: 0, low: 1, medium: 3, high: 7, critical: 15 },
          maxScore: 100,
        },
      });
    } catch (e) {
      handleRouteError(e, res, "fleet-telematics");
    }
  },
);
// Idempotency lives in the DB unique indexes; ON CONFLICT DO NOTHING is
// the right level of strictness here.
// ─────────────────────────────────────────────────────────────────────────
/**
 * Per-device throttle for `fleet.telematics.position.updated`. Persistence
 * still happens on every GPS point (the live map needs that) but emitting
 * an event for every point would saturate the bus at any non-trivial
 * fleet size — at 100 vehicles × every-30s that's 288k events/day, each
 * one fanning out to every listener registered on the bus. Throttle to
 * 1 event/device/minute so the bus stays useful and the throttle scales
 * linearly with vehicle count (each device gets its own slot).
 *
 * In-memory map is fine: missing a throttle window across a process
 * restart just means one extra event — same effect as if the next
 * point landed in a new window.
 */
const POSITION_EVENT_THROTTLE_MS = 60_000;
// Cap the map's growth so a long-running process with churning device
// ids (e.g. operator unlinks + relinks many devices over weeks) doesn't
// accumulate dead entries forever. 10_000 covers the entire fleet
// capacity many times over; eviction prunes entries older than ~10×
// the throttle window since they're irrelevant for the throttle
// decision anyway. JS's Map preserves insertion order so deleting the
// oldest entries is O(eviction count).
const LAST_POSITION_EVENT_MAX_ENTRIES = 10_000;
const lastPositionEventAt = new Map<number, number>();

function trimLastPositionEventAt(): void {
  if (lastPositionEventAt.size <= LAST_POSITION_EVENT_MAX_ENTRIES) return;
  const cutoff = Date.now() - 10 * POSITION_EVENT_THROTTLE_MS;
  for (const [deviceId, at] of lastPositionEventAt) {
    if (at < cutoff) lastPositionEventAt.delete(deviceId);
    if (lastPositionEventAt.size <= LAST_POSITION_EVENT_MAX_ENTRIES) break;
  }
  // If cutoff-based eviction didn't get us under the cap (everything
  // is fresh), fall back to deleting the oldest by insertion order
  // until we are.
  if (lastPositionEventAt.size > LAST_POSITION_EVENT_MAX_ENTRIES) {
    const toEvict = lastPositionEventAt.size - LAST_POSITION_EVENT_MAX_ENTRIES;
    let n = 0;
    for (const k of lastPositionEventAt.keys()) {
      lastPositionEventAt.delete(k);
      if (++n >= toEvict) break;
    }
  }
}

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
  // Touch the device's last-known timestamps. Split into two updates
  // so we can detect the offline→online transition atomically (the
  // first UPDATE only fires when status was actually `offline`, so its
  // affectedRows reliably tells us "this position just brought the
  // device back online"). Without the split, the back-online edge is
  // invisible to the eventCatalog `fleet.telematics.device.online`
  // consumer (heartbeat fires the offline edge, but nothing fires the
  // online edge — leaving the dashboards stuck on red).
  const flip = await rawExecute(
    `UPDATE fleet_telematics_devices
        SET status = 'online'
      WHERE id = $1 AND status = 'offline'`,
    [device.id],
  );
  await rawExecute(
    `UPDATE fleet_telematics_devices
        SET "lastPositionAt" = $1, "lastOnlineAt" = NOW()
      WHERE id = $2`,
    [p.occurredAt, device.id],
  );
  if ((flip.affectedRows ?? 0) > 0) {
    void emitEvent({
      companyId,
      branchId: branchId ?? undefined,
      userId: null,
      action: "fleet.telematics.device.online",
      entity: "fleet_telematics_devices",
      entityId: device.id,
      details: `جهاز #${device.id} عاد للاتصال`,
      after: { deviceId: device.id, vehicleId: device.vehicleId, lastSeenAt: p.occurredAt.toISOString() },
    });
  }
  if (affectedRows > 0) {
    const now = Date.now();
    const last = lastPositionEventAt.get(device.id) ?? 0;
    if (now - last >= POSITION_EVENT_THROTTLE_MS) {
      lastPositionEventAt.set(device.id, now);
      trimLastPositionEventAt();
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
  // Driver derivation: look up the active fleet_trips row at the alert's
  // occurredAt for this vehicle. Without this, every AI alert was being
  // recorded with driverId=NULL — the scorecard endpoints can't attribute
  // events to drivers, and the discipline workflow has no hook. The
  // lookup is best-effort: trips outside `in_progress` or missing rows
  // leave driverId NULL exactly like before, which the scorecard query
  // already tolerates.
  let derivedDriverId: number | null = null;
  if (device.vehicleId) {
    try {
      const [trip] = await rawQuery<{ driverId: number | null }>(
        `SELECT "driverId" FROM fleet_trips
          WHERE "companyId" = $1
            AND "vehicleId" = $2
            AND status = 'in_progress'
            AND "startTime" <= $3
          ORDER BY "startTime" DESC
          LIMIT 1`,
        [companyId, device.vehicleId, a.occurredAt],
      );
      derivedDriverId = trip?.driverId ?? null;
    } catch (err) {
      logger.warn({ err, deviceId: device.id }, "driver derivation lookup failed");
    }
  }

  const { affectedRows, insertId } = await rawExecute(
    `INSERT INTO fleet_ai_alerts
       ("companyId","branchId","deviceId","vehicleId","driverId",category,"alertType",
        "alertCode",severity,confidence,"occurredAt",lat,lng,speed,
        "imageUrl","videoUrl","externalAlertId","rawPayload","normalizedPayload")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT ("deviceId","externalAlertId") DO NOTHING
     RETURNING id`,
    [
      companyId,
      branchId,
      device.id,
      device.vehicleId,
      derivedDriverId,
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
 * these, every fuel/weight reading would emit an event regardless of
 * fleet size — most listeners only care about meaningful deltas (a
 * top-up, a load drop, a dump truck unloading). Numbers are tunable but
 * conservative enough to surface real operational events while
 * suppressing sensor noise. Thresholds are per-device-per-type so they
 * scale to any vehicle count without re-tuning.
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
