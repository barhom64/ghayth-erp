/**
 * Smoke tests for the CMSV6 adapter normalisation logic. Issue #1354.
 *
 * The HTTP / session machinery is exercised only via the public Adapter
 * surface (using __setCmsv6AdapterFactory to swap in a fake). The normalisers
 * are pure functions and get direct unit tests because they are the part most
 * likely to break when the vendor changes a field name.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeRawPosition,
  normalizeRawEvent,
  normalizeRawAlert,
  normalizeRawSensor,
  normalizeRemoteDevice,
  normalizeWebhookEnvelope,
  mapCmsv6Category,
  mapCmsv6Severity,
  validateCmsv6BaseUrl,
} from "../../src/lib/integrations/cmsv6Adapter.js";

describe("CMSV6 — normaliseRawPosition", () => {
  it("returns null when lat/lng missing", () => {
    expect(normalizeRawPosition("DEV1", {})).toBeNull();
  });

  it("reads jingdu/weidu fallbacks", () => {
    const p = normalizeRawPosition("DEV1", { jingdu: "46.6753", weidu: "24.7136", speed: 42 });
    expect(p?.lat).toBeCloseTo(24.7136, 4);
    expect(p?.lng).toBeCloseTo(46.6753, 4);
    expect(p?.speed).toBe(42);
  });

  it("parses gpstime correctly", () => {
    const p = normalizeRawPosition("DEV1", {
      lat: 24,
      lng: 46,
      gpstime: "2026-05-28T10:00:00Z",
    });
    expect(p?.occurredAt.toISOString()).toBe("2026-05-28T10:00:00.000Z");
  });

  it("falls back to current time when gpstime is missing", () => {
    const p = normalizeRawPosition("DEV1", { lat: 24, lng: 46 });
    expect(p?.occurredAt).toBeInstanceOf(Date);
  });

  it("interprets ignition flag", () => {
    expect(normalizeRawPosition("DEV1", { lat: 24, lng: 46, ignition: 1 })?.ignitionOn).toBe(true);
    expect(normalizeRawPosition("DEV1", { lat: 24, lng: 46, ignition: 0 })?.ignitionOn).toBe(false);
    expect(normalizeRawPosition("DEV1", { lat: 24, lng: 46 })?.ignitionOn).toBeUndefined();
  });
});

describe("CMSV6 — normaliseRawEvent", () => {
  it("preserves externalEventId for idempotency", () => {
    const e = normalizeRawEvent("DEV1", {
      alarmId: "alarm-42",
      type: "harsh_braking",
      severity: "high",
      time: "2026-05-28T10:00:00Z",
    });
    expect(e.externalEventId).toBe("alarm-42");
    expect(e.eventType).toBe("harsh_braking");
    expect(e.severity).toBe("high");
  });

  it("defaults severity to medium when missing", () => {
    const e = normalizeRawEvent("DEV1", { type: "online", time: "2026-05-28T10:00:00Z" });
    expect(e.severity).toBe("medium");
  });
});

describe("CMSV6 — normaliseRawAlert", () => {
  it("maps ADAS alarm to adas category", () => {
    const a = normalizeRawAlert("DEV1", {
      alarmId: "ai-1",
      alarmType: "fcw",
      severity: "high",
      time: "2026-05-28T10:00:00Z",
      imageUrl: "https://cdn/example.jpg",
    });
    expect(a.category).toBe("adas");
    expect(a.severity).toBe("high");
    expect(a.imageUrl).toBe("https://cdn/example.jpg");
  });

  it("maps DMS alarms to dms category", () => {
    expect(normalizeRawAlert("DEV1", { alarmType: "fatigue", time: "2026-05-28T10:00:00Z" }).category).toBe("dms");
    expect(normalizeRawAlert("DEV1", { alarmType: "phone_call", time: "2026-05-28T10:00:00Z" }).category).toBe("dms");
  });

  it("falls back to 'other' for unknown alarm types", () => {
    const a = normalizeRawAlert("DEV1", { alarmType: "mystery_alarm_2099", time: "2026-05-28T10:00:00Z" });
    expect(a.category).toBe("other");
    expect(a.alertType).toBe("mystery_alarm_2099");
  });
});

describe("CMSV6 — normaliseRawSensor", () => {
  it("accepts known sensor types", () => {
    expect(normalizeRawSensor("DEV1", { sensorType: "fuel_level", value: 80, unit: "L", time: "2026-05-28T10:00:00Z" }).sensorType)
      .toBe("fuel_level");
    expect(normalizeRawSensor("DEV1", { sensorType: "dump_piston", state: "up", time: "2026-05-28T10:00:00Z" }).readingState)
      .toBe("up");
  });

  it("normalises unknown sensor types to 'custom'", () => {
    const s = normalizeRawSensor("DEV1", { sensorType: "left_blinker", time: "2026-05-28T10:00:00Z" });
    expect(s.sensorType).toBe("custom");
  });
});

describe("CMSV6 — normaliseRemoteDevice", () => {
  it("extracts the canonical device fields", () => {
    const d = normalizeRemoteDevice({
      devIdno: "DEV-001",
      plate: "1234ABC",
      vehiName: "Truck-01",
      channelCount: 8,
      online: 1,
    });
    expect(d.cmsv6DeviceNo).toBe("DEV-001");
    expect(d.plateNumber).toBe("1234ABC");
    expect(d.deviceLabel).toBe("Truck-01");
    expect(d.channelCount).toBe(8);
    expect(d.online).toBe(true);
  });
});

describe("CMSV6 — webhook envelope", () => {
  it("routes a mixed payload into the right buckets", () => {
    const out = normalizeWebhookEnvelope({
      devIdno: "DEV-A",
      positions: { lat: 24.7, lng: 46.6, gpstime: "2026-05-28T10:00:00Z" },
      alarms: [{ alarmType: "fcw", time: "2026-05-28T10:00:00Z" }],
      events: [{ type: "offline", time: "2026-05-28T10:00:00Z" }],
      sensors: [{ sensorType: "fuel_level", value: 50, time: "2026-05-28T10:00:00Z" }],
    });
    expect(out.positions).toHaveLength(1);
    expect(out.alerts).toHaveLength(1);
    expect(out.events).toHaveLength(1);
    expect(out.sensors).toHaveLength(1);
    expect(out.alerts[0].category).toBe("adas");
  });

  it("returns empty buckets for a non-object payload", () => {
    expect(normalizeWebhookEnvelope(null).events).toHaveLength(0);
    expect(normalizeWebhookEnvelope("garbage").alerts).toHaveLength(0);
  });
});

describe("CMSV6 — severity / category maps", () => {
  it("maps numeric severity strings", () => {
    expect(mapCmsv6Severity("4")).toBe("critical");
    expect(mapCmsv6Severity("2")).toBe("medium");
    expect(mapCmsv6Severity(undefined)).toBe("medium");
  });

  it("maps known category aliases", () => {
    expect(mapCmsv6Category("LANE_DEPARTURE")).toBe("adas");
    expect(mapCmsv6Category("smoking")).toBe("dms");
    expect(mapCmsv6Category("BSD")).toBe("bsd");
    expect(mapCmsv6Category("")).toBe("other");
  });
});

describe("CMSV6 — validateCmsv6BaseUrl", () => {
  it("rejects malformed URLs", async () => {
    expect(await validateCmsv6BaseUrl("not-a-url")).toMatch(/غير صالح/);
  });

  it("rejects loopback hosts", async () => {
    expect(await validateCmsv6BaseUrl("http://127.0.0.1/cmsv6")).toMatch(/شبكة خاصة|loopback/);
    expect(await validateCmsv6BaseUrl("http://10.0.0.1/cmsv6")).toMatch(/شبكة خاصة|loopback/);
    expect(await validateCmsv6BaseUrl("http://169.254.169.254/latest")).toMatch(/شبكة خاصة|loopback/);
  });

  it("rejects unsupported schemes", async () => {
    expect(await validateCmsv6BaseUrl("ftp://example.com")).toMatch(/http\(s\)/);
  });
});
