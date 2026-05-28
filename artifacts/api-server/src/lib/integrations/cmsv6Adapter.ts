/**
 * CMSV6 Adapter — issue #1354
 * ─────────────────────────────────────────────────────────────────────────
 * Service-Provider adapter for Eastyle AI MDVR / CMSV6 telematics. Ghayth
 * stays the Leader Path: every decision, report and audit row lives in
 * Ghayth's own schema; CMSV6 is a remote source we poll (and optionally
 * receive webhooks from). The adapter MUST stay strictly read/normalise
 * only — it never writes to Fleet decisional tables itself, it returns
 * normalised rows that the Fleet routes persist via withTransaction.
 *
 * Why this seam exists:
 *   1. Vendor surface is hostile (no OpenAPI, XML+JSON mixed payloads,
 *      session cookie that expires every 30min). Isolating it here means
 *      a future swap to Wialon / Teltonika is a new adapter file + a row
 *      in fleet_telematics_integrations, not a Fleet route rewrite.
 *   2. Tests can fake the adapter via the factory below without spinning
 *      up a fake CMSV6 server.
 *   3. SSRF + private-IP guards live in ONE place. Operators set the
 *      baseUrl through /admin/vendor-settings; if they point it at the
 *      EC2 metadata service every request must fail.
 *
 * What this file is NOT:
 *   • A queue / scheduler — cronScheduler drives polling cadence.
 *   • A persistence layer — routes call adapter methods then insert the
 *     normalised rows under their own transaction.
 *   • A live-video transcoder — CMSV6 hands us a HLS / RTSP URL and we
 *     hand it to the browser. Trans-coding stays on the MDVR + CMSV6.
 */

import dns from "node:dns/promises";
import { logger } from "../logger.js";

/** Vendor protocol identifier — keep in sync with the migration CHECK. */
export type TelematicsProvider = "cmsv6" | "wialon" | "teltonika" | "manual";

export interface CMSV6Config {
  /** Base URL of the CMSV6 platform, e.g. https://gps.eastyle.com */
  baseUrl: string;
  /** Operator-supplied account name (CMSV6 user account). */
  account: string;
  /** Operator-supplied password — stored encrypted in vendor_secrets. */
  password: string;
  /** Optional API key when the platform is configured for token-auth. */
  apiKey?: string;
  /** Session TTL hint, used by the cache. CMSV6 defaults to ~30min. */
  sessionTtlSec?: number;
  /** Override request timeout in ms; defaults to 15s. */
  timeoutMs?: number;
}

/** Normalised position row — ready to persist into fleet_device_positions. */
export interface NormalizedPosition {
  cmsv6DeviceNo: string;
  occurredAt: Date;
  lat: number;
  lng: number;
  speed?: number;
  direction?: number;
  altitude?: number;
  accuracy?: number;
  ignitionOn?: boolean;
  satelliteCount?: number;
  rawPayload: unknown;
}

/** Normalised device event row — fleet_device_events. */
export interface NormalizedEvent {
  cmsv6DeviceNo: string;
  externalEventId?: string;
  eventType: string;
  eventCode?: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  occurredAt: Date;
  lat?: number;
  lng?: number;
  speed?: number;
  message?: string;
  rawPayload: unknown;
  normalizedPayload?: unknown;
}

/** Normalised AI alert row — fleet_ai_alerts. */
export interface NormalizedAlert {
  cmsv6DeviceNo: string;
  externalAlertId?: string;
  category: "adas" | "dms" | "bsd" | "safety" | "other";
  alertType: string;
  alertCode?: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence?: number;
  occurredAt: Date;
  lat?: number;
  lng?: number;
  speed?: number;
  imageUrl?: string;
  videoUrl?: string;
  rawPayload: unknown;
  normalizedPayload?: unknown;
}

/** Normalised sensor reading — fleet_sensor_readings. */
export interface NormalizedSensorReading {
  cmsv6DeviceNo: string;
  externalReadingId?: string;
  sensorType:
    | "fuel_level"
    | "weight"
    | "air_pressure"
    | "pto"
    | "dump_piston"
    | "door"
    | "temperature"
    | "engine_rpm"
    | "battery_voltage"
    | "odometer"
    | "custom";
  sensorChannel?: string;
  readingValue?: number;
  readingState?: string;
  unit?: string;
  occurredAt: Date;
  rawPayload: unknown;
}

/** Device record discovered on CMSV6. */
export interface RemoteDevice {
  cmsv6DeviceNo: string;
  plateNumber?: string;
  deviceLabel?: string;
  deviceModel?: string;
  firmwareVersion?: string;
  channelCount?: number;
  imei?: string;
  sim?: string;
  online?: boolean;
  capabilities?: Record<string, unknown>;
}

/** Live-stream session handle. */
export interface VideoSessionHandle {
  streamType: "rtsp" | "hls" | "http_flv" | "webrtc";
  streamUrl: string;
  expiresAt?: Date;
  externalSessionId?: string;
}

export interface VideoSessionRequest {
  cmsv6DeviceNo: string;
  channelNo: number;
  streamType?: "rtsp" | "hls" | "http_flv";
  durationSec?: number;
}

export interface RangeQuery {
  from?: Date;
  to?: Date;
  limit?: number;
}

/** Session token + the timestamp it must be considered fresh until. */
interface SessionCache {
  token: string;
  cookies?: string;
  expiresAt: number;
}

/** Public contract — routes + cron scheduler depend on THIS, not the impl. */
export interface CMSV6Adapter {
  readonly provider: TelematicsProvider;
  /** Mint a session token; cached until `expiresAt`. */
  login(): Promise<{ token: string; expiresAt: Date }>;
  /** Discard cached session — used by integration "test" button. */
  logout(): Promise<void>;
  /** List all devices visible to the configured CMSV6 account. */
  listDevices(): Promise<RemoteDevice[]>;
  /** Most recent position for a single device. */
  getLastPosition(cmsv6DeviceNo: string): Promise<NormalizedPosition | null>;
  /** Batch position poll across many devices — used by the cron poller. */
  getLatestPositions(cmsv6DeviceNos: string[]): Promise<NormalizedPosition[]>;
  /** Historical track. */
  getHistory(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedPosition[]>;
  /** Device events (offline / harsh / SD card / …). */
  getEvents(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedEvent[]>;
  /** AI safety alarms (ADAS / DMS / BSD). */
  getAIAlerts(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedAlert[]>;
  /** Sensor readings — fuel, weight, PTO, etc. */
  getSensorReadings(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedSensorReading[]>;
  /** Open a live-stream URL for a camera channel. */
  openVideoSession(req: VideoSessionRequest): Promise<VideoSessionHandle>;
  /** Best-effort stop of a stream; safe to retry. */
  closeVideoSession(externalSessionId: string): Promise<void>;
  /**
   * Translate raw vendor payloads (e.g. from a webhook) into normalised
   * Ghayth rows. Pure function — no network. Lets the webhook route stay
   * thin and the adapter remain the single source of normalisation rules.
   */
  normalizeWebhookPayload(raw: unknown): {
    events: NormalizedEvent[];
    alerts: NormalizedAlert[];
    sensors: NormalizedSensorReading[];
    positions: NormalizedPosition[];
  };
}

// ─────────────────────────────────────────────────────────────────────────
// SSRF / private-IP guard — same shape as gov-integrations.ts.
// CMSV6 baseUrl is operator-controlled (settings UI) and would otherwise
// be a free-form egress vector.
// ─────────────────────────────────────────────────────────────────────────
function isPrivateIP(ip: string): boolean {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0" || ip === "::") return true;
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0 || parts[0] === 127) return true;
  }
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
  return false;
}

export async function validateCmsv6BaseUrl(rawUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "عنوان CMSV6 غير صالح";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "عنوان CMSV6 يجب أن يستخدم http(s)";
  }
  const host = parsed.hostname;
  if (
    /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.|169\.254\.)/.test(host) ||
    host === "::1" ||
    host.startsWith("[")
  ) {
    return "عنوان CMSV6 يشير إلى شبكة خاصة أو loopback";
  }
  try {
    const [v4, v6] = await Promise.all([
      dns.resolve4(host).catch(() => []),
      dns.resolve6(host).catch(() => []),
    ]);
    const all = [...v4, ...v6];
    if (all.length === 0) return "تعذّر استرداد عنوان CMSV6 من DNS";
    if (all.some(isPrivateIP)) return "عنوان CMSV6 يحلّ إلى شبكة خاصة";
  } catch {
    return "تعذّر استرداد عنوان CMSV6 من DNS";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Severity mapping — CMSV6 numeric alarm codes → Ghayth severity buckets.
// Documented mapping so a future code review can spot drift.
// ─────────────────────────────────────────────────────────────────────────
const CMSV6_ALARM_CATEGORY: Record<string, NormalizedAlert["category"]> = {
  // ADAS — forward collision, lane departure, headway, pedestrian
  fcw: "adas",
  ldw: "adas",
  hmw: "adas",
  pcw: "adas",
  forward_collision: "adas",
  lane_departure: "adas",
  // DMS — distracted / drowsy / phone / smoking
  fatigue: "dms",
  distracted: "dms",
  phone_call: "dms",
  smoking: "dms",
  yawn: "dms",
  no_driver: "dms",
  // BSD — blind spot
  bsd: "bsd",
  blind_spot: "bsd",
};

const CMSV6_SEVERITY_MAP: Record<string, NormalizedAlert["severity"]> = {
  "0": "info",
  "1": "low",
  "2": "medium",
  "3": "high",
  "4": "critical",
  low: "low",
  medium: "medium",
  high: "high",
  critical: "critical",
};

export function mapCmsv6Severity(raw: unknown): NormalizedAlert["severity"] {
  if (raw === undefined || raw === null) return "medium";
  const key = String(raw).toLowerCase();
  return CMSV6_SEVERITY_MAP[key] ?? "medium";
}

export function mapCmsv6Category(raw: unknown): NormalizedAlert["category"] {
  if (!raw) return "other";
  const key = String(raw).toLowerCase();
  return CMSV6_ALARM_CATEGORY[key] ?? "other";
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP client — uses global fetch (Node 22+). Times out via AbortController
// because CMSV6 occasionally hangs forever on a half-open TCP connection.
// ─────────────────────────────────────────────────────────────────────────
class HttpCMSV6Adapter implements CMSV6Adapter {
  readonly provider: TelematicsProvider = "cmsv6";
  private session: SessionCache | null = null;
  private readonly cfg: Required<Pick<CMSV6Config, "baseUrl" | "account" | "password">> &
    Partial<CMSV6Config>;

  constructor(cfg: CMSV6Config) {
    if (!cfg.baseUrl) throw new Error("CMSV6: baseUrl is required");
    if (!cfg.account) throw new Error("CMSV6: account is required");
    if (!cfg.password) throw new Error("CMSV6: password is required");
    this.cfg = { ...cfg, baseUrl: cfg.baseUrl.replace(/\/+$/, "") };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.cfg.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.cfg.timeoutMs ?? 15_000,
    );
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(this.session?.token ? { "x-session-id": this.session.token } : {}),
          ...(init.headers ?? {}),
        },
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`CMSV6 ${path} → HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      const text = await res.text();
      if (!text) return {} as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        // Some CMSV6 endpoints return XML; the route layer is expected to
        // call adapter methods that know which to use. If we ever land
        // here, raise — never silently swallow.
        throw new Error(`CMSV6 ${path} returned non-JSON body`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async ensureSession(): Promise<SessionCache> {
    const now = Date.now();
    if (this.session && this.session.expiresAt > now + 5_000) return this.session;
    return await this.refreshSession();
  }

  private async refreshSession(): Promise<SessionCache> {
    const body = {
      account: this.cfg.account,
      password: this.cfg.password,
      ...(this.cfg.apiKey ? { apiKey: this.cfg.apiKey } : {}),
    };
    const resp = await this.request<{ jsession?: string; token?: string; result?: number }>(
      "/StandardApiAction_login.action",
      { method: "POST", body: JSON.stringify(body) },
    );
    const token = resp.jsession ?? resp.token;
    if (!token) {
      throw new Error("CMSV6 login: vendor response missing session token");
    }
    const ttl = (this.cfg.sessionTtlSec ?? 1800) * 1000;
    this.session = { token, expiresAt: Date.now() + ttl };
    return this.session;
  }

  async login() {
    const s = await this.refreshSession();
    return { token: s.token, expiresAt: new Date(s.expiresAt) };
  }

  async logout() {
    if (!this.session) return;
    try {
      await this.request("/StandardApiAction_logout.action", { method: "POST" });
    } catch (err) {
      logger.warn({ err }, "CMSV6 logout failed (ignoring)");
    } finally {
      this.session = null;
    }
  }

  async listDevices(): Promise<RemoteDevice[]> {
    await this.ensureSession();
    const resp = await this.request<{ vehicles?: RawDevice[]; data?: RawDevice[] }>(
      "/StandardApiAction_queryUserVehicle.action",
    );
    const raws = resp.vehicles ?? resp.data ?? [];
    return raws.map(normalizeRemoteDevice);
  }

  async getLastPosition(cmsv6DeviceNo: string): Promise<NormalizedPosition | null> {
    await this.ensureSession();
    const resp = await this.request<{ data?: RawPosition; positions?: RawPosition[] }>(
      `/StandardApiAction_getDeviceStatus.action?devIdno=${encodeURIComponent(cmsv6DeviceNo)}`,
    );
    const raw = resp.data ?? resp.positions?.[0];
    return raw ? normalizeRawPosition(cmsv6DeviceNo, raw) : null;
  }

  async getLatestPositions(cmsv6DeviceNos: string[]): Promise<NormalizedPosition[]> {
    if (cmsv6DeviceNos.length === 0) return [];
    await this.ensureSession();
    const resp = await this.request<{ status?: RawPosition[] }>(
      `/StandardApiAction_getDeviceStatus.action?devIdno=${encodeURIComponent(
        cmsv6DeviceNos.join(","),
      )}`,
    );
    const raws = resp.status ?? [];
    return raws
      .map((r) => normalizeRawPosition(r.devIdno ?? "", r))
      .filter((p): p is NormalizedPosition => Boolean(p && p.cmsv6DeviceNo));
  }

  async getHistory(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedPosition[]> {
    await this.ensureSession();
    const q = new URLSearchParams({
      devIdno: cmsv6DeviceNo,
      ...(range.from ? { begintime: fmtCmsTime(range.from) } : {}),
      ...(range.to ? { endtime: fmtCmsTime(range.to) } : {}),
      ...(range.limit ? { pageRecords: String(range.limit) } : {}),
    });
    const resp = await this.request<{ tracks?: RawPosition[] }>(
      `/StandardApiAction_queryTrackDetail.action?${q.toString()}`,
    );
    return (resp.tracks ?? [])
      .map((r) => normalizeRawPosition(cmsv6DeviceNo, r))
      .filter((p): p is NormalizedPosition => Boolean(p));
  }

  async getEvents(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedEvent[]> {
    await this.ensureSession();
    const q = new URLSearchParams({
      devIdno: cmsv6DeviceNo,
      ...(range.from ? { begintime: fmtCmsTime(range.from) } : {}),
      ...(range.to ? { endtime: fmtCmsTime(range.to) } : {}),
    });
    const resp = await this.request<{ events?: RawEvent[] }>(
      `/StandardApiAction_queryAlarmDetail.action?${q.toString()}`,
    );
    return (resp.events ?? []).map((r) => normalizeRawEvent(cmsv6DeviceNo, r));
  }

  async getAIAlerts(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedAlert[]> {
    await this.ensureSession();
    const q = new URLSearchParams({
      devIdno: cmsv6DeviceNo,
      ...(range.from ? { begintime: fmtCmsTime(range.from) } : {}),
      ...(range.to ? { endtime: fmtCmsTime(range.to) } : {}),
    });
    const resp = await this.request<{ alarms?: RawAlert[] }>(
      `/StandardApiAction_queryAdasAlarm.action?${q.toString()}`,
    );
    return (resp.alarms ?? []).map((r) => normalizeRawAlert(cmsv6DeviceNo, r));
  }

  async getSensorReadings(
    cmsv6DeviceNo: string,
    range: RangeQuery,
  ): Promise<NormalizedSensorReading[]> {
    await this.ensureSession();
    const q = new URLSearchParams({
      devIdno: cmsv6DeviceNo,
      ...(range.from ? { begintime: fmtCmsTime(range.from) } : {}),
      ...(range.to ? { endtime: fmtCmsTime(range.to) } : {}),
    });
    const resp = await this.request<{ sensors?: RawSensor[] }>(
      `/StandardApiAction_querySensorDetail.action?${q.toString()}`,
    );
    return (resp.sensors ?? []).map((r) => normalizeRawSensor(cmsv6DeviceNo, r));
  }

  async openVideoSession(req: VideoSessionRequest): Promise<VideoSessionHandle> {
    await this.ensureSession();
    const streamType = req.streamType ?? "hls";
    const q = new URLSearchParams({
      devIdno: req.cmsv6DeviceNo,
      channel: String(req.channelNo),
      stream: streamType,
    });
    const resp = await this.request<{
      url?: string;
      session?: string;
      expireAt?: string;
    }>(`/StandardApiAction_getVideoUrl.action?${q.toString()}`);
    if (!resp.url) {
      throw new Error(`CMSV6 video session: vendor returned no URL`);
    }
    return {
      streamType,
      streamUrl: resp.url,
      expiresAt: resp.expireAt ? new Date(resp.expireAt) : undefined,
      externalSessionId: resp.session,
    };
  }

  async closeVideoSession(externalSessionId: string): Promise<void> {
    await this.ensureSession();
    try {
      await this.request(
        `/StandardApiAction_stopVideo.action?session=${encodeURIComponent(externalSessionId)}`,
        { method: "POST" },
      );
    } catch (err) {
      logger.warn({ err, externalSessionId }, "CMSV6 stopVideo failed (best-effort)");
    }
  }

  normalizeWebhookPayload(raw: unknown) {
    return normalizeWebhookEnvelope(raw);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Raw vendor shapes — captured here so the rest of the codebase never
// sees a CMSV6 field name. Anything we don't recognise stays in
// rawPayload, never silently dropped.
// ─────────────────────────────────────────────────────────────────────────
interface RawDevice {
  devIdno?: string;
  deviceId?: string;
  plate?: string;
  plateNo?: string;
  carlicense?: string;
  vehiName?: string;
  model?: string;
  fwVersion?: string;
  channel?: number;
  channelCount?: number;
  imei?: string;
  sim?: string;
  online?: number;
  capabilities?: Record<string, unknown>;
}

interface RawPosition {
  devIdno?: string;
  jingdu?: string | number;
  weidu?: string | number;
  lng?: number;
  lat?: number;
  speed?: number;
  direction?: number;
  altitude?: number;
  accuracy?: number;
  fix?: number;
  ignition?: number;
  satellite?: number;
  gpstime?: string;
  time?: string;
}

interface RawEvent {
  alarmId?: string;
  eventId?: string;
  type?: string;
  code?: string;
  severity?: string;
  level?: number;
  time?: string;
  gpstime?: string;
  lng?: number;
  lat?: number;
  jingdu?: string | number;
  weidu?: string | number;
  speed?: number;
  message?: string;
}

interface RawAlert {
  alarmId?: string;
  alertId?: string;
  alarmType?: string;
  type?: string;
  code?: string;
  severity?: string;
  level?: number;
  confidence?: number;
  time?: string;
  gpstime?: string;
  lng?: number;
  lat?: number;
  jingdu?: string | number;
  weidu?: string | number;
  speed?: number;
  imageUrl?: string;
  picUrl?: string;
  videoUrl?: string;
}

interface RawSensor {
  readingId?: string;
  sensorType?: string;
  type?: string;
  channel?: string;
  value?: number;
  state?: string;
  unit?: string;
  time?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Normalisers — pure functions. Exported so a webhook route and unit
// tests can use them without an HTTP client.
// ─────────────────────────────────────────────────────────────────────────
function pickNum(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const n = typeof c === "number" ? c : Number(c);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function pickStr(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (c === undefined || c === null) continue;
    const s = String(c).trim();
    if (s.length > 0) return s;
  }
  return undefined;
}

function parseTime(...candidates: unknown[]): Date {
  for (const c of candidates) {
    if (!c) continue;
    const d = new Date(String(c));
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function fmtCmsTime(d: Date): string {
  // CMSV6 expects 'YYYY-MM-DD HH:MM:SS' in the platform's tz; pass UTC ISO
  // and let the vendor convert — most deployments accept this.
  return d.toISOString().replace("T", " ").slice(0, 19);
}

export function normalizeRemoteDevice(raw: RawDevice): RemoteDevice {
  return {
    cmsv6DeviceNo: pickStr(raw.devIdno, raw.deviceId) ?? "",
    plateNumber: pickStr(raw.plate, raw.plateNo, raw.carlicense, raw.vehiName),
    deviceLabel: pickStr(raw.vehiName, raw.plate),
    deviceModel: pickStr(raw.model),
    firmwareVersion: pickStr(raw.fwVersion),
    channelCount: pickNum(raw.channelCount, raw.channel),
    imei: pickStr(raw.imei),
    sim: pickStr(raw.sim),
    online: raw.online === 1,
    capabilities: raw.capabilities,
  };
}

export function normalizeRawPosition(
  deviceNo: string,
  raw: RawPosition,
): NormalizedPosition | null {
  const lat = pickNum(raw.lat, raw.weidu);
  const lng = pickNum(raw.lng, raw.jingdu);
  if (lat === undefined || lng === undefined) return null;
  return {
    cmsv6DeviceNo: deviceNo,
    occurredAt: parseTime(raw.gpstime, raw.time),
    lat,
    lng,
    speed: pickNum(raw.speed),
    direction: pickNum(raw.direction),
    altitude: pickNum(raw.altitude),
    accuracy: pickNum(raw.accuracy),
    ignitionOn: raw.ignition === undefined ? undefined : raw.ignition === 1,
    satelliteCount: pickNum(raw.satellite),
    rawPayload: raw,
  };
}

export function normalizeRawEvent(deviceNo: string, raw: RawEvent): NormalizedEvent {
  return {
    cmsv6DeviceNo: deviceNo,
    externalEventId: pickStr(raw.alarmId, raw.eventId),
    eventType: pickStr(raw.type, raw.code) ?? "unknown",
    eventCode: pickStr(raw.code),
    severity: mapCmsv6Severity(raw.severity ?? raw.level),
    occurredAt: parseTime(raw.gpstime, raw.time),
    lat: pickNum(raw.lat, raw.weidu),
    lng: pickNum(raw.lng, raw.jingdu),
    speed: pickNum(raw.speed),
    message: pickStr(raw.message),
    rawPayload: raw,
  };
}

export function normalizeRawAlert(deviceNo: string, raw: RawAlert): NormalizedAlert {
  const typeStr = pickStr(raw.alarmType, raw.type) ?? "unknown";
  return {
    cmsv6DeviceNo: deviceNo,
    externalAlertId: pickStr(raw.alarmId, raw.alertId),
    category: mapCmsv6Category(typeStr),
    alertType: typeStr,
    alertCode: pickStr(raw.code),
    severity: mapCmsv6Severity(raw.severity ?? raw.level),
    confidence: pickNum(raw.confidence),
    occurredAt: parseTime(raw.gpstime, raw.time),
    lat: pickNum(raw.lat, raw.weidu),
    lng: pickNum(raw.lng, raw.jingdu),
    speed: pickNum(raw.speed),
    imageUrl: pickStr(raw.imageUrl, raw.picUrl),
    videoUrl: pickStr(raw.videoUrl),
    rawPayload: raw,
  };
}

export function normalizeRawSensor(deviceNo: string, raw: RawSensor): NormalizedSensorReading {
  const t = (pickStr(raw.sensorType, raw.type) ?? "custom").toLowerCase();
  const allowed: NormalizedSensorReading["sensorType"][] = [
    "fuel_level",
    "weight",
    "air_pressure",
    "pto",
    "dump_piston",
    "door",
    "temperature",
    "engine_rpm",
    "battery_voltage",
    "odometer",
    "custom",
  ];
  const sensorType = (allowed as string[]).includes(t)
    ? (t as NormalizedSensorReading["sensorType"])
    : "custom";
  return {
    cmsv6DeviceNo: deviceNo,
    externalReadingId: pickStr(raw.readingId),
    sensorType,
    sensorChannel: pickStr(raw.channel),
    readingValue: pickNum(raw.value),
    readingState: pickStr(raw.state),
    unit: pickStr(raw.unit),
    occurredAt: parseTime(raw.time),
    rawPayload: raw,
  };
}

/**
 * Webhook envelope from CMSV6 ranges from "tightly wrapped JSON" to
 * "list of mixed payloads". Be permissive — drop nothing, route by shape.
 */
export function normalizeWebhookEnvelope(raw: unknown): {
  events: NormalizedEvent[];
  alerts: NormalizedAlert[];
  sensors: NormalizedSensorReading[];
  positions: NormalizedPosition[];
} {
  const out = {
    events: [] as NormalizedEvent[],
    alerts: [] as NormalizedAlert[],
    sensors: [] as NormalizedSensorReading[],
    positions: [] as NormalizedPosition[],
  };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  const devNo = pickStr((obj as RawDevice).devIdno) ?? "";
  const list = (key: string): unknown[] => {
    const v = obj[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") return [v];
    return [];
  };
  for (const item of list("positions")) {
    const p = normalizeRawPosition(devNo, item as RawPosition);
    if (p) out.positions.push(p);
  }
  for (const item of list("events")) out.events.push(normalizeRawEvent(devNo, item as RawEvent));
  for (const item of list("alarms")) out.alerts.push(normalizeRawAlert(devNo, item as RawAlert));
  for (const item of list("sensors")) out.sensors.push(normalizeRawSensor(devNo, item as RawSensor));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// Factory + DI seam — routes call createCmsv6Adapter(cfg) so tests can
// swap in a fake by setting __setCmsv6AdapterFactory(fake). Default
// returns the HTTP implementation above.
// ─────────────────────────────────────────────────────────────────────────
type Factory = (cfg: CMSV6Config) => CMSV6Adapter;

let _factory: Factory = (cfg) => new HttpCMSV6Adapter(cfg);

export function createCmsv6Adapter(cfg: CMSV6Config): CMSV6Adapter {
  return _factory(cfg);
}

/** Test hook — DO NOT call from production code. */
export function __setCmsv6AdapterFactory(f: Factory | null): void {
  _factory = f ?? ((cfg) => new HttpCMSV6Adapter(cfg));
}
