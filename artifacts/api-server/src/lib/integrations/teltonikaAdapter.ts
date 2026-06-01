// M10 — Teltonika adapter.
//
// Closes M10 from CRITICAL_DEFECTS_REPORT.md (Teltonika side). Operates
// against Teltonika FOTA Web / Mileage API documented at
//   https://docs.teltonika-gps.com/en/products/fota-web/api/
// and the FMS / Telematics Cloud REST API at
//   https://wiki.teltonika-gps.com/view/Telematics_Cloud
//
// Two transports are supported in this adapter:
//   1. Direct device codec — devices send AVL packets (Codec 8 / 8E)
//      via a TCP listener; this adapter does NOT process raw TCP.
//      Instead it consumes Teltonika's Codec8 messages from the
//      operator's hosted Telematics Cloud REST endpoint.
//   2. FOTA Web REST API — for device-management metadata.
//
// Auth: HTTP Bearer with operator-issued API token.
// Configuration: integrations.config = { token, host?, fotaToken? }.

import { logger } from "../logger.js";
import type {
  CMSV6Adapter,
  CMSV6Config,
  NormalizedPosition,
  NormalizedEvent,
  NormalizedAlert,
  NormalizedSensorReading,
  RemoteDevice,
  VideoSessionHandle,
  VideoSessionRequest,
  RangeQuery,
} from "./cmsv6Adapter.js";

export interface TeltonikaConfig extends CMSV6Config {
  token?: string;
  /** FOTA Web host, defaults to fm.teltonika.lt */
  host?: string;
  /** Optional FOTA Web token if different from the Telematics token. */
  fotaToken?: string;
}

const DEFAULT_HOST = "fm.teltonika.lt";
const DEFAULT_TIMEOUT_MS = 15_000;

class TeltonikaAdapter implements CMSV6Adapter {
  readonly provider = "teltonika" as const;
  private readonly token: string;
  private readonly host: string;
  private readonly timeoutMs: number;
  private readonly imeiToId = new Map<string, string>();

  constructor(cfg: TeltonikaConfig) {
    this.token = cfg.token || cfg.apiKey || cfg.password;
    this.host = cfg.host || (() => {
      try { return new URL(cfg.baseUrl).host; } catch { return DEFAULT_HOST; }
    })();
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async get(path: string, query: Record<string, string | number> = {}): Promise<unknown> {
    const url = new URL(`https://${this.host}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
        },
        signal: ctl.signal,
      });
      if (!resp.ok) throw new Error(`teltonika HTTP ${resp.status} for ${path}`);
      return resp.json();
    } finally {
      clearTimeout(t);
    }
  }

  async login(): Promise<{ token: string; expiresAt: Date }> {
    // Teltonika tokens don't expire on a fixed schedule — they're
    // operator-revocable. Treat as "valid for 1h" so the cache layer
    // doesn't thrash; the next 401 forces a re-issue.
    if (!this.token) throw new Error("teltonika adapter missing token");
    return { token: this.token, expiresAt: new Date(Date.now() + 3600_000) };
  }

  async logout(): Promise<void> {
    // No session to drop — token is operator-managed.
  }

  async listDevices(): Promise<RemoteDevice[]> {
    const result = await this.get("/api/devices", { per_page: 500 });
    const items = (result as { data?: Array<Record<string, unknown>> }).data ?? [];
    return items.map(d => {
      const imei = String(d.imei ?? d.identifier ?? "");
      if (imei) this.imeiToId.set(imei, String(d.id ?? imei));
      return {
        cmsv6DeviceNo: imei,
        deviceLabel: String(d.name ?? d.label ?? imei),
        deviceModel: String(d.model ?? ""),
        imei,
        online: Boolean(d.online ?? d.is_online),
        firmwareVersion: String(d.firmware ?? d.fw_version ?? ""),
      };
    });
  }

  async getLastPosition(cmsv6DeviceNo: string): Promise<NormalizedPosition | null> {
    try {
      const result = await this.get(`/api/devices/${encodeURIComponent(cmsv6DeviceNo)}/last-position`);
      const p = result as { latitude?: number; longitude?: number; timestamp?: string; speed?: number; angle?: number; satellites?: number; ignition?: boolean };
      if (typeof p.latitude !== "number" || typeof p.longitude !== "number") return null;
      return {
        cmsv6DeviceNo,
        occurredAt: p.timestamp ? new Date(p.timestamp) : new Date(),
        lat: p.latitude,
        lng: p.longitude,
        speed: p.speed,
        direction: p.angle,
        satelliteCount: p.satellites,
        ignitionOn: p.ignition,
        rawPayload: p,
      };
    } catch (err) {
      logger.warn({ err, deviceUid: cmsv6DeviceNo }, "[teltonika] last-position failed");
      return null;
    }
  }

  async getLatestPositions(cmsv6DeviceNos: string[]): Promise<NormalizedPosition[]> {
    const out: NormalizedPosition[] = [];
    for (const uid of cmsv6DeviceNos) {
      const p = await this.getLastPosition(uid);
      if (p) out.push(p);
    }
    return out;
  }

  async getHistory(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedPosition[]> {
    const result = await this.get(`/api/devices/${encodeURIComponent(cmsv6DeviceNo)}/positions`, {
      from: (range.from ?? new Date(Date.now() - 24 * 3600_000)).toISOString(),
      to: (range.to ?? new Date()).toISOString(),
      per_page: range.limit ?? 1000,
    });
    const items = (result as { data?: Array<Record<string, unknown>> }).data ?? [];
    return items.map(p => ({
      cmsv6DeviceNo,
      occurredAt: new Date(String(p.timestamp ?? p.event_time ?? "")),
      lat: Number(p.latitude ?? 0),
      lng: Number(p.longitude ?? 0),
      speed: typeof p.speed === "number" ? p.speed : undefined,
      direction: typeof p.angle === "number" ? p.angle : undefined,
      satelliteCount: typeof p.satellites === "number" ? p.satellites : undefined,
      ignitionOn: typeof p.ignition === "boolean" ? p.ignition : undefined,
      rawPayload: p,
    }));
  }

  async getEvents(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedEvent[]> {
    const result = await this.get(`/api/devices/${encodeURIComponent(cmsv6DeviceNo)}/events`, {
      from: (range.from ?? new Date(Date.now() - 7 * 24 * 3600_000)).toISOString(),
      to: (range.to ?? new Date()).toISOString(),
      per_page: range.limit ?? 500,
    });
    const items = (result as { data?: Array<Record<string, unknown>> }).data ?? [];
    return items.map(e => ({
      cmsv6DeviceNo,
      externalEventId: String(e.id ?? ""),
      eventType: String(e.type ?? e.code ?? "event"),
      eventCode: e.code ? String(e.code) : undefined,
      severity: this.mapSeverity(e.severity),
      occurredAt: new Date(String(e.timestamp ?? e.event_time ?? "")),
      lat: typeof e.latitude === "number" ? e.latitude : undefined,
      lng: typeof e.longitude === "number" ? e.longitude : undefined,
      speed: typeof e.speed === "number" ? e.speed : undefined,
      message: typeof e.description === "string" ? e.description : undefined,
      rawPayload: e,
    }));
  }

  async getAIAlerts(_cmsv6DeviceNo: string, _range: RangeQuery): Promise<NormalizedAlert[]> {
    // Teltonika's AI camera line (FMC003 / FMC230 with ADAS) emits
    // these via Codec8 events, exposed through getEvents above as
    // event_type=adas_*. Routing them into AI alerts is the caller's
    // job — this method exists for the CMSV6 vendor only.
    return [];
  }

  async getSensorReadings(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedSensorReading[]> {
    const result = await this.get(`/api/devices/${encodeURIComponent(cmsv6DeviceNo)}/io`, {
      from: (range.from ?? new Date(Date.now() - 24 * 3600_000)).toISOString(),
      to: (range.to ?? new Date()).toISOString(),
      per_page: range.limit ?? 500,
    });
    const items = (result as { data?: Array<{ timestamp: string; io: Record<string, number> }> }).data ?? [];
    const out: NormalizedSensorReading[] = [];
    for (const row of items) {
      const ts = new Date(row.timestamp);
      // Teltonika I/O 66 = battery voltage, 68 = digital input 1
      // (ignition), 84 = fuel level on AVL ID list.
      if (typeof row.io?.["84"] === "number") {
        out.push({ cmsv6DeviceNo, sensorType: "fuel_level", readingValue: row.io["84"], unit: "L", occurredAt: ts, rawPayload: row });
      }
      if (typeof row.io?.["66"] === "number") {
        out.push({ cmsv6DeviceNo, sensorType: "battery_voltage", readingValue: row.io["66"] / 1000, unit: "V", occurredAt: ts, rawPayload: row });
      }
    }
    return out;
  }

  async openVideoSession(_req: VideoSessionRequest): Promise<VideoSessionHandle> {
    throw new Error("teltonika adapter: live video not supported");
  }

  async closeVideoSession(_externalSessionId: string): Promise<void> {
    // No-op — openVideoSession throws.
  }

  normalizeWebhookPayload(raw: unknown): {
    events: NormalizedEvent[];
    alerts: NormalizedAlert[];
    sensors: NormalizedSensorReading[];
    positions: NormalizedPosition[];
  } {
    // Teltonika webhooks deliver Codec8 frames. The Telematics Cloud
    // normalises them server-side and pushes a JSON payload of shape:
    //   { device_imei, type, data }
    const payload = raw as { device_imei?: string; type?: string; data?: unknown };
    if (!payload?.device_imei) return { events: [], alerts: [], sensors: [], positions: [] };
    if (payload.type === "position") {
      const p = payload.data as { lat: number; lng: number; timestamp: string; speed?: number; angle?: number };
      return {
        events: [], alerts: [], sensors: [],
        positions: [{
          cmsv6DeviceNo: payload.device_imei,
          occurredAt: new Date(p.timestamp),
          lat: p.lat, lng: p.lng,
          speed: p.speed, direction: p.angle,
          rawPayload: payload,
        }],
      };
    }
    if (payload.type === "event") {
      const e = payload.data as { code: string; timestamp: string; severity?: string };
      return {
        events: [{
          cmsv6DeviceNo: payload.device_imei,
          eventType: e.code,
          severity: this.mapSeverity(e.severity),
          occurredAt: new Date(e.timestamp),
          rawPayload: payload,
        }],
        alerts: [], sensors: [], positions: [],
      };
    }
    return { events: [], alerts: [], sensors: [], positions: [] };
  }

  private mapSeverity(s: unknown): "info" | "low" | "medium" | "high" | "critical" {
    const str = String(s ?? "").toLowerCase();
    if (str === "critical" || str === "high" || str === "medium" || str === "low" || str === "info") return str;
    return "info";
  }
}

export function createTeltonikaAdapter(cfg: TeltonikaConfig): CMSV6Adapter {
  const tok = cfg.token || cfg.apiKey || cfg.password;
  if (!tok) {
    throw new Error("teltonika adapter requires a token in integrations.config (token/apiKey/password)");
  }
  return new TeltonikaAdapter(cfg);
}
