import { describe, it, expect, vi } from "vitest";
import {
  requestIdempotencyToken,
  markIdempotencyReplay,
  idempotencyResponseMeta,
  isDryRun,
} from "../../src/lib/requestIdempotency.js";

// Pure-function helpers — exercised without spinning up Express. The Request
// and Response shapes only need the fields the helpers actually read/write,
// so we use minimal duck-typed mocks instead of pulling in supertest.

type AnyReq = Parameters<typeof requestIdempotencyToken>[0];
type AnyRes = Parameters<typeof markIdempotencyReplay>[1];

function mockReq(opts: { header?: string | string[]; query?: any; body?: any } = {}): AnyReq {
  return {
    headers: opts.header !== undefined ? { "idempotency-key": opts.header } : {},
    query: opts.query ?? {},
    body: opts.body ?? {},
  } as unknown as AnyReq;
}

function mockRes(): { res: AnyRes; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as AnyRes;
  return { res, headers };
}

describe("requestIdempotencyToken", () => {
  it("returns the header value when it matches the safe character set", () => {
    const req = mockReq({ header: "client-uuid-abc-123-xyz" });
    expect(requestIdempotencyToken(req)).toBe("client-uuid-abc-123-xyz");
  });

  it("accepts an array-form header (first value wins)", () => {
    const req = mockReq({ header: ["primary-token-7777", "ignored"] });
    expect(requestIdempotencyToken(req)).toBe("primary-token-7777");
  });

  it("falls back to a generated UUID when no header is present", () => {
    const req = mockReq({});
    const token = requestIdempotencyToken(req);
    // RFC 4122 v4 shape — engine guards reject 13-digit timestamps, UUIDs pass.
    expect(token).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("rejects too-short header values and falls back to UUID", () => {
    const req = mockReq({ header: "short" });
    const token = requestIdempotencyToken(req);
    expect(token).not.toBe("short");
    expect(token).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("rejects header values with disallowed characters and falls back to UUID", () => {
    const req = mockReq({ header: "has spaces and ;semicolons" });
    const token = requestIdempotencyToken(req);
    expect(token).not.toBe("has spaces and ;semicolons");
    expect(token).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("rejects an empty / whitespace header and falls back to UUID", () => {
    const req = mockReq({ header: "   " });
    const token = requestIdempotencyToken(req);
    expect(token).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("never returns a value that contains a 13-digit Date.now timestamp", () => {
    // The fallback is randomUUID(), so the engine's runtime guard
    // (rejects /1\d{12}/ inside a sourceKey) can never trip on the
    // fallback path. Sample enough UUIDs to make this stable.
    for (let i = 0; i < 200; i++) {
      const token = requestIdempotencyToken(mockReq({}));
      expect(token).not.toMatch(/1\d{12}/);
    }
  });
});

describe("markIdempotencyReplay", () => {
  it("sets X-Idempotent-Replay: true on replay", () => {
    const { res, headers } = mockRes();
    markIdempotencyReplay(mockReq({}), res, true);
    expect(headers["X-Idempotent-Replay"]).toBe("true");
  });

  it("sets X-Idempotent-Replay: false on a fresh post", () => {
    const { res, headers } = mockRes();
    markIdempotencyReplay(mockReq({}), res, false);
    expect(headers["X-Idempotent-Replay"]).toBe("false");
  });

  it("echoes a valid Idempotency-Key back to the caller", () => {
    const { res, headers } = mockRes();
    markIdempotencyReplay(mockReq({ header: "abc-token-1234" }), res, true);
    expect(headers["Idempotency-Key"]).toBe("abc-token-1234");
  });

  it("does not echo an empty / missing Idempotency-Key", () => {
    const { res, headers } = mockRes();
    markIdempotencyReplay(mockReq({}), res, false);
    expect(headers["Idempotency-Key"]).toBeUndefined();
  });
});

describe("idempotencyResponseMeta", () => {
  it("sets the response header AND returns the JSON-body meta object", () => {
    const { res, headers } = mockRes();
    const meta = idempotencyResponseMeta(mockReq({}), res, true);
    expect(meta).toEqual({ idempotentReplay: true });
    expect(headers["X-Idempotent-Replay"]).toBe("true");
  });
});

describe("isDryRun", () => {
  it("returns true for ?dryRun=true", () => {
    expect(isDryRun(mockReq({ query: { dryRun: "true" } }))).toBe(true);
  });

  it("returns true for ?dryRun=1", () => {
    expect(isDryRun(mockReq({ query: { dryRun: "1" } }))).toBe(true);
  });

  it("returns true for body.dryRun = true (boolean)", () => {
    expect(isDryRun(mockReq({ body: { dryRun: true } }))).toBe(true);
  });

  it("returns true for body.dryRun = 'true' (string)", () => {
    expect(isDryRun(mockReq({ body: { dryRun: "true" } }))).toBe(true);
  });

  it("returns false when dryRun is absent", () => {
    expect(isDryRun(mockReq({}))).toBe(false);
  });

  it("returns false for ?dryRun=false", () => {
    expect(isDryRun(mockReq({ query: { dryRun: "false" } }))).toBe(false);
  });

  it("returns false for garbage values", () => {
    expect(isDryRun(mockReq({ query: { dryRun: "maybe" } }))).toBe(false);
    expect(isDryRun(mockReq({ body: { dryRun: 0 } }))).toBe(false);
  });
});
