// M10 — Real Wialon adapter.
//
// Closes M10 from CRITICAL_DEFECTS_REPORT.md (Wialon side). Implements
// the CMSV6Adapter interface against the Wialon Hosting HTTP API at
//   https://sdk.wialon.com/wiki/en/sidebar/remoteapi/apiref/start
//
// Auth flow:
//   POST {host}/wialon/ajax.html?svc=token/login&params={"token":"..."}
//   → returns eid (session id). Each subsequent call posts svc/params/sid.
//
// The adapter conforms to the same CMSV6Adapter interface used elsewhere
// so the route layer, cron poller, and tests don't need to special-case
// Wialon. "cmsv6DeviceNo" maps to the Wialon unit's IMEI / unique id.

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

export interface WialonConfig extends CMSV6Config {
  /** API token issued in Wialon UI → settings → API tokens. */
  token?: string;
  /** Hosting domain, falls back to baseUrl. */
  host?: string;
}

interface WialonSession { eid: string; expiresAt: number }

interface WialonUnit {
  id: number;
  nm: string;
  uid: string;
  pos?: { x: number; y: number; t: number; s: number; c?: number; sc?: number };
  prms?: Record<string, { v: unknown }>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

class WialonAdapter implements CMSV6Adapter {
  readonly provider = "wialon" as const;
  private session: WialonSession | null = null;
  private readonly endpoint: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly unitCache = new Map<string, number>();

  constructor(cfg: WialonConfig) {
    const host = cfg.host || (() => {
      try { return new URL(cfg.baseUrl).host; } catch { return "hst-api.wialon.com"; }
    })();
    this.endpoint = `https://${host}/wialon/ajax.html`;
    // Operator can pass the token via the `apiKey` field or directly
    // via cfg.token — both supported.
    this.token = cfg.token || cfg.apiKey || cfg.password;
    this.timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async ajax(svc: string, params: Record<string, unknown>, retry = true): Promise<unknown> {
    const sid = await this.getSessionId();
    const body = new URLSearchParams({ svc, params: JSON.stringify(params), sid });
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const resp = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body, signal: ctl.signal,
      });
      if (!resp.ok) throw new Error(`wialon HTTP ${resp.status}`);
      const json = (await resp.json()) as { error?: number; reason?: string };
      if (typeof json.error === "number" && json.error !== 0) {
        if (json.error === 1 && retry) {
          // Session invalid — drop and retry once.
          this.session = null;
          return this.ajax(svc, params, false);
        }
        throw new Error(`wialon error ${json.error}: ${json.reason ?? "(no reason)"}`);
      }
      return json;
    } finally {
      clearTimeout(t);
    }
  }

  private async getSessionId(): Promise<string> {
    if (this.session && this.session.expiresAt > Date.now() + 5_000) return this.session.eid;
    if (!this.token) throw new Error("wialon adapter missing token");
    const body = new URLSearchParams({
      svc: "token/login",
      params: JSON.stringify({ token: this.token }),
    });
    const resp = await fetch(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!resp.ok) throw new Error(`wialon login HTTP ${resp.status}`);
    const json = (await resp.json()) as { eid?: string; reason?: string };
    if (!json.eid) throw new Error(`wialon login failed: ${json.reason ?? "no eid"}`);
    this.session = { eid: json.eid, expiresAt: Date.now() + 4 * 60 * 1000 };
    return json.eid;
  }

  async login(): Promise<{ token: string; expiresAt: Date }> {
    const eid = await this.getSessionId();
    return { token: eid, expiresAt: new Date(this.session!.expiresAt) };
  }

  async logout(): Promise<void> {
    if (!this.session) return;
    try { await this.ajax("core/logout", {}, false); } catch { /* ignore */ }
    this.session = null;
  }

  async listDevices(): Promise<RemoteDevice[]> {
    const result = await this.ajax("core/search_items", {
      spec: {
        itemsType: "avl_unit",
        propName: "sys_name",
        propValueMask: "*",
        sortType: "sys_name",
      },
      force: 1,
      flags: 0x00000001 | 0x00000100, // base + last_message
      from: 0, to: 0,
    });
    const items = (result as { items?: WialonUnit[] }).items ?? [];
    return items.map(u => ({
      cmsv6DeviceNo: u.uid,
      deviceLabel: u.nm,
      imei: u.uid,
      online: u.pos ? (Date.now() - u.pos.t * 1000 < 10 * 60 * 1000) : false,
    }));
  }

  private async resolveUnitId(deviceUid: string): Promise<number | null> {
    const cached = this.unitCache.get(deviceUid);
    if (cached) return cached;
    const result = await this.ajax("core/search_items", {
      spec: {
        itemsType: "avl_unit",
        propName: "sys_unique_id",
        propValueMask: deviceUid,
        sortType: "sys_unique_id",
      },
      force: 1, flags: 0x00000001 | 0x00000400,
      from: 0, to: 0,
    });
    const items = (result as { items?: WialonUnit[] }).items ?? [];
    if (!items.length) return null;
    this.unitCache.set(deviceUid, items[0].id);
    return items[0].id;
  }

  async getLastPosition(cmsv6DeviceNo: string): Promise<NormalizedPosition | null> {
    const id = await this.resolveUnitId(cmsv6DeviceNo);
    if (!id) return null;
    const result = await this.ajax("core/search_item", {
      id, flags: 0x00000001 | 0x00000400,
    }) as { item?: WialonUnit };
    const u = result.item;
    if (!u?.pos) return null;
    return this.normalizePosition(cmsv6DeviceNo, u.pos, u.prms);
  }

  async getLatestPositions(cmsv6DeviceNos: string[]): Promise<NormalizedPosition[]> {
    const out: NormalizedPosition[] = [];
    for (const uid of cmsv6DeviceNos) {
      try {
        const pos = await this.getLastPosition(uid);
        if (pos) out.push(pos);
      } catch (err) {
        logger.warn({ err, deviceUid: uid }, "[wialon] last-position fetch failed");
      }
    }
    return out;
  }

  async getHistory(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedPosition[]> {
    const id = await this.resolveUnitId(cmsv6DeviceNo);
    if (!id) return [];
    const result = await this.ajax("messages/load_interval", {
      itemId: id,
      timeFrom: Math.floor((range.from?.getTime() ?? Date.now() - 24 * 3600 * 1000) / 1000),
      timeTo: Math.floor((range.to?.getTime() ?? Date.now()) / 1000),
      flags: 1, flagsMask: 0xFF,
      loadCount: range.limit ?? 1000,
    }) as { messages?: Array<{ pos?: { x: number; y: number; s: number; c?: number; sc?: number }; t: number }> };
    const messages = result.messages ?? [];
    try { await this.ajax("messages/unload", {}, false); } catch { /* ignore */ }
    return messages
      .filter(m => m.pos)
      .map(m => this.normalizePosition(cmsv6DeviceNo, { ...m.pos!, t: m.t }, undefined));
  }

  async getEvents(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedEvent[]> {
    const id = await this.resolveUnitId(cmsv6DeviceNo);
    if (!id) return [];
    const result = await this.ajax("messages/load_interval", {
      itemId: id,
      timeFrom: Math.floor((range.from?.getTime() ?? Date.now() - 7 * 24 * 3600 * 1000) / 1000),
      timeTo: Math.floor((range.to?.getTime() ?? Date.now()) / 1000),
      flags: 0x2000, flagsMask: 0xFF00,
      loadCount: range.limit ?? 500,
    }) as { messages?: Array<{ t: number; et?: string; tt?: string; pos?: { x: number; y: number; s: number } }> };
    try { await this.ajax("messages/unload", {}, false); } catch { /* ignore */ }
    return (result.messages ?? []).map(m => ({
      cmsv6DeviceNo,
      eventType: m.et || m.tt || "event",
      severity: "info" as const,
      occurredAt: new Date(m.t * 1000),
      lat: m.pos?.y,
      lng: m.pos?.x,
      speed: m.pos?.s,
      rawPayload: m,
    }));
  }

  async getAIAlerts(cmsv6DeviceNo: string, _range: RangeQuery): Promise<NormalizedAlert[]> {
    // Wialon's base Hosting API doesn't expose AI alerts in a standard
    // way — those live in Wialon Video / NimBus. Return empty so the
    // poller doesn't crash, real implementation lands when the operator
    // adopts Wialon Video.
    void cmsv6DeviceNo;
    return [];
  }

  async getSensorReadings(cmsv6DeviceNo: string, range: RangeQuery): Promise<NormalizedSensorReading[]> {
    const id = await this.resolveUnitId(cmsv6DeviceNo);
    if (!id) return [];
    // Wialon stores sensor calibration on the unit; load_interval flag
    // 4 returns "param" messages which carry raw IO values. Most
    // operators want fuel + odometer here.
    const result = await this.ajax("messages/load_interval", {
      itemId: id,
      timeFrom: Math.floor((range.from?.getTime() ?? Date.now() - 24 * 3600 * 1000) / 1000),
      timeTo: Math.floor((range.to?.getTime() ?? Date.now()) / 1000),
      flags: 4, flagsMask: 0xFF,
      loadCount: range.limit ?? 1000,
    }) as { messages?: Array<{ t: number; p?: Record<string, unknown> }> };
    try { await this.ajax("messages/unload", {}, false); } catch { /* ignore */ }
    const out: NormalizedSensorReading[] = [];
    for (const m of result.messages ?? []) {
      const p = m.p ?? {};
      // Wialon fuel: param name typically 'fls' or 'fuel'.
      const fuel = (p.fls ?? p.fuel) as number | undefined;
      if (typeof fuel === "number") {
        out.push({
          cmsv6DeviceNo,
          sensorType: "fuel_level",
          readingValue: fuel,
          unit: "L",
          occurredAt: new Date(m.t * 1000),
          rawPayload: p,
        });
      }
      const odo = (p.odometer ?? p.mileage) as number | undefined;
      if (typeof odo === "number") {
        out.push({
          cmsv6DeviceNo,
          sensorType: "odometer",
          readingValue: odo,
          unit: "km",
          occurredAt: new Date(m.t * 1000),
          rawPayload: p,
        });
      }
    }
    return out;
  }

  async openVideoSession(_req: VideoSessionRequest): Promise<VideoSessionHandle> {
    throw new Error("wialon adapter: video streams require Wialon Video module (not yet wired)");
  }

  async closeVideoSession(_externalSessionId: string): Promise<void> {
    // No-op — openVideoSession throws, so this is unreachable. Kept
    // to satisfy the interface contract.
  }

  normalizeWebhookPayload(_raw: unknown): {
    events: NormalizedEvent[];
    alerts: NormalizedAlert[];
    sensors: NormalizedSensorReading[];
    positions: NormalizedPosition[];
  } {
    // Wialon doesn't push webhooks in the base Hosting plan — operators
    // poll. The CMSV6Adapter contract requires this method but it's
    // unused for Wialon today.
    return { events: [], alerts: [], sensors: [], positions: [] };
  }

  private normalizePosition(
    cmsv6DeviceNo: string,
    pos: { x: number; y: number; t: number; s: number; c?: number; sc?: number },
    prms: Record<string, { v: unknown }> | undefined,
  ): NormalizedPosition {
    const ignParam = prms?.["ignition"] ?? prms?.["io_239"];
    return {
      cmsv6DeviceNo,
      occurredAt: new Date(pos.t * 1000),
      lat: pos.y,
      lng: pos.x,
      speed: pos.s,
      direction: pos.c,
      satelliteCount: pos.sc,
      ignitionOn: ignParam !== undefined ? Boolean(Number(ignParam.v)) : undefined,
      rawPayload: { pos, prms },
    };
  }
}

export function createWialonAdapter(cfg: WialonConfig): CMSV6Adapter {
  const tokenOrPass = cfg.token || cfg.apiKey || cfg.password;
  if (!tokenOrPass) {
    throw new Error("wialon adapter requires a token (set in integrations.config.token, apiKey, or password)");
  }
  return new WialonAdapter(cfg);
}
