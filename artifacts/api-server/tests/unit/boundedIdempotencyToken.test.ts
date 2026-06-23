import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { boundedIdempotencyToken } from "../../src/lib/requestIdempotency.js";

/**
 * Regression for the Codex P2: a valid Idempotency-Key can be up to 128 chars,
 * and the token is concatenated into the stored retry-tuple `sourceKey`
 * (intercompany VARCHAR(160); vendor_advances / vendor_credit_memos
 * VARCHAR(128)). A long key overflowed the column → Postgres value-too-long →
 * the whole post failed with a 500. boundedIdempotencyToken hashes long tokens
 * to a fixed 64-hex digest so every accepted key fits.
 */
describe("boundedIdempotencyToken — keeps token-based sourceKeys within their VARCHAR columns", () => {
  it("passes short tokens (UUIDs, normal keys ≤ 64) through unchanged", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000"; // 36 chars
    expect(boundedIdempotencyToken(uuid)).toBe(uuid);
    const k64 = "a".repeat(64);
    expect(boundedIdempotencyToken(k64)).toBe(k64);
  });

  it("hashes tokens longer than 64 to a fixed 64-hex digest, deterministically", () => {
    const long = "k".repeat(128);
    const out = boundedIdempotencyToken(long);
    expect(out).toHaveLength(64);
    expect(out).toMatch(/^[0-9a-f]{64}$/);
    // deterministic — a retry with the SAME key collides on the SAME sourceKey
    expect(boundedIdempotencyToken(long)).toBe(out);
    expect(out).toBe(createHash("sha256").update(long).digest("hex"));
  });

  it("maps distinct long tokens to distinct bounded values (dedup stays unique)", () => {
    expect(boundedIdempotencyToken("x".repeat(100))).not.toBe(
      boundedIdempotencyToken("y".repeat(100)),
    );
  });

  it("a max-length (128) key keeps intercompany sourceKey ≤ 160 and vendor-AP ≤ 128", () => {
    const t = boundedIdempotencyToken("Z".repeat(128));
    // finance:intercompany:<companyId>:<toCompanyId>:<txDate>:<amount>:<token>
    const ic = `finance:intercompany:999999:888888:2026-06-23T00:00:00.000Z:12345678901234.50:${t}`;
    expect(ic.length).toBeLessThanOrEqual(160);
    // finance:vendor_credit:<supplierId>:<memoDate>:<token>  (VARCHAR 128)
    const vc = `finance:vendor_credit:999999:2026-06-23:${t}`;
    expect(vc.length).toBeLessThanOrEqual(128);
    // finance:vendor_advance:<supplierId>:<recvDate>:<token>  (VARCHAR 128)
    const va = `finance:vendor_advance:999999:2026-06-23:${t}`;
    expect(va.length).toBeLessThanOrEqual(128);
  });
});
