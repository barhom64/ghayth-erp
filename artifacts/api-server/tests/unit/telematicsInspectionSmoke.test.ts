/**
 * Inspection follow-up smoke tests — media blob proxy + pagination
 * helper + position-event throttle Map cap (#1354).
 */
import { describe, it, expect } from "vitest";

// ─── parsePagination helper (mirror of the route impl) ─────────────────
function parsePagination(req: { query: Record<string, unknown> }): { limit: number; offset: number } {
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

describe("parsePagination", () => {
  it("defaults limit=100, offset=0", () => {
    expect(parsePagination({ query: {} })).toEqual({ limit: 100, offset: 0 });
  });
  it("clamps limit to [1, 500]", () => {
    expect(parsePagination({ query: { limit: "0" } }).limit).toBe(1);
    expect(parsePagination({ query: { limit: "-50" } }).limit).toBe(1);
    expect(parsePagination({ query: { limit: "10000" } }).limit).toBe(500);
    expect(parsePagination({ query: { limit: "300" } }).limit).toBe(300);
  });
  it("clamps offset to [0, 100_000]", () => {
    expect(parsePagination({ query: { offset: "-1" } }).offset).toBe(0);
    expect(parsePagination({ query: { offset: "1000000" } }).offset).toBe(100_000);
    expect(parsePagination({ query: { offset: "250" } }).offset).toBe(250);
  });
  it("floors fractional values", () => {
    const r = parsePagination({ query: { limit: "50.7", offset: "10.9" } });
    expect(r.limit).toBe(50);
    expect(r.offset).toBe(10);
  });
  it("falls back to defaults on garbage input", () => {
    const r = parsePagination({ query: { limit: "abc", offset: "xyz" } });
    expect(r).toEqual({ limit: 100, offset: 0 });
  });
});

// ─── isPrivateIpLiteral helper (mirror of the route impl) ──────────────
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
  if (/^\[?(fc|fd|fe8|fe9|fea|feb)/i.test(host)) return true;
  return false;
}

describe("media blob SSRF — isPrivateIpLiteral", () => {
  it("rejects loopback", () => {
    expect(isPrivateIpLiteral("127.0.0.1")).toBe(true);
    expect(isPrivateIpLiteral("localhost")).toBe(true);
    expect(isPrivateIpLiteral("::1")).toBe(true);
  });
  it("rejects RFC1918", () => {
    expect(isPrivateIpLiteral("10.0.0.1")).toBe(true);
    expect(isPrivateIpLiteral("10.255.255.255")).toBe(true);
    expect(isPrivateIpLiteral("172.16.0.1")).toBe(true);
    expect(isPrivateIpLiteral("172.31.255.255")).toBe(true);
    expect(isPrivateIpLiteral("192.168.1.1")).toBe(true);
  });
  it("rejects link-local", () => {
    expect(isPrivateIpLiteral("169.254.169.254")).toBe(true);
  });
  it("rejects 0.0.0.0 / 0.x", () => {
    expect(isPrivateIpLiteral("0.0.0.0")).toBe(true);
    expect(isPrivateIpLiteral("0.1.2.3")).toBe(true);
  });
  it("rejects IPv6 ULA + link-local prefixes", () => {
    expect(isPrivateIpLiteral("fc00::1")).toBe(true);
    expect(isPrivateIpLiteral("fd00::abcd")).toBe(true);
    expect(isPrivateIpLiteral("fe80::1")).toBe(true);
  });
  it("allows public IPs", () => {
    expect(isPrivateIpLiteral("8.8.8.8")).toBe(false);
    expect(isPrivateIpLiteral("1.1.1.1")).toBe(false);
    expect(isPrivateIpLiteral("172.32.0.1")).toBe(false); // outside RFC1918
    expect(isPrivateIpLiteral("172.15.0.1")).toBe(false);
  });
  it("allows public hostnames (not IP literals)", () => {
    expect(isPrivateIpLiteral("gps.example.com")).toBe(false);
    expect(isPrivateIpLiteral("media.cmsv6.com")).toBe(false);
    expect(isPrivateIpLiteral("cdn.cloudfront.net")).toBe(false);
  });
});

// ─── Position event throttle Map cap ────────────────────────────────────
const POSITION_EVENT_THROTTLE_MS = 60_000;
const LAST_POSITION_EVENT_MAX_ENTRIES = 10_000;

function makeTrim(map: Map<number, number>) {
  return function trim(): void {
    if (map.size <= LAST_POSITION_EVENT_MAX_ENTRIES) return;
    const cutoff = Date.now() - 10 * POSITION_EVENT_THROTTLE_MS;
    for (const [k, v] of map) {
      if (v < cutoff) map.delete(k);
      if (map.size <= LAST_POSITION_EVENT_MAX_ENTRIES) break;
    }
    if (map.size > LAST_POSITION_EVENT_MAX_ENTRIES) {
      const toEvict = map.size - LAST_POSITION_EVENT_MAX_ENTRIES;
      let n = 0;
      for (const k of map.keys()) {
        map.delete(k);
        if (++n >= toEvict) break;
      }
    }
  };
}

describe("position event throttle Map cap", () => {
  it("does not prune when under the cap", () => {
    const m = new Map<number, number>();
    for (let i = 0; i < 50; i++) m.set(i, Date.now());
    makeTrim(m)();
    expect(m.size).toBe(50);
  });

  it("removes stale entries first when over the cap", () => {
    const m = new Map<number, number>();
    const stale = Date.now() - 20 * POSITION_EVENT_THROTTLE_MS;
    // 10_001 entries — 1 stale, rest fresh
    m.set(0, stale);
    for (let i = 1; i <= LAST_POSITION_EVENT_MAX_ENTRIES; i++) {
      m.set(i, Date.now());
    }
    expect(m.size).toBeGreaterThan(LAST_POSITION_EVENT_MAX_ENTRIES);
    makeTrim(m)();
    expect(m.size).toBeLessThanOrEqual(LAST_POSITION_EVENT_MAX_ENTRIES);
    expect(m.has(0)).toBe(false);
  });

  it("falls back to oldest-insertion eviction when all entries are fresh", () => {
    const m = new Map<number, number>();
    const now = Date.now();
    // 10_010 entries all fresh — cutoff-based won't drop any
    for (let i = 0; i < LAST_POSITION_EVENT_MAX_ENTRIES + 10; i++) {
      m.set(i, now);
    }
    makeTrim(m)();
    expect(m.size).toBe(LAST_POSITION_EVENT_MAX_ENTRIES);
    // The OLDEST insertion-order entries (lowest IDs) must have been dropped.
    expect(m.has(0)).toBe(false);
    expect(m.has(9)).toBe(false);
    expect(m.has(10)).toBe(true);
    expect(m.has(LAST_POSITION_EVENT_MAX_ENTRIES + 9)).toBe(true);
  });

  it("idempotent: calling trim twice in a row is a no-op the second time", () => {
    const m = new Map<number, number>();
    for (let i = 0; i < LAST_POSITION_EVENT_MAX_ENTRIES + 5; i++) m.set(i, Date.now());
    const trim = makeTrim(m);
    trim();
    const sizeAfterFirst = m.size;
    trim();
    expect(m.size).toBe(sizeAfterFirst);
  });
});
