/**
 * useIdempotencyKey — hook tests. Batch 15 of the FE behavioral-coverage
 * effort (ghayth-review documented gap).
 *
 * Mints a UUIDv4 once on mount and hands it back — unchanged — across every
 * re-render, so an accidental retry (double-click, network blip) on an
 * idempotency-guarded financial endpoint (invoice payment, payroll run/approve,
 * credit/debit memo, customer advance, bad-debt post, umrah penalty waive)
 * replays the SAME key instead of creating a duplicate record. After a
 * successful submit the caller calls reset() to mint a fresh key so the next
 * action is a genuinely new request.
 *
 * The contract under test is exactly that stability + reset behaviour — the
 * security-relevant part. If the key were regenerated on every render the
 * double-submit guard would silently break, so these tests pin it. The key's
 * shape is asserted to be a valid v4 (works whether crypto.randomUUID or the
 * Math.random fallback produced it). Test-only — zero production code.
 */
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIdempotencyKey, IDEMPOTENCY_HEADER } from "./idempotency";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("useIdempotencyKey", () => {
  it("exposes the canonical header name", () => {
    expect(IDEMPOTENCY_HEADER).toBe("Idempotency-Key");
  });

  it("mints a valid UUIDv4 and carries it in the headers", () => {
    const { result } = renderHook(() => useIdempotencyKey());
    expect(result.current.key).toMatch(UUID_V4);
    expect(result.current.headers).toEqual({ [IDEMPOTENCY_HEADER]: result.current.key });
  });

  it("keeps the SAME key across re-renders (retry / double-click protection)", () => {
    const { result, rerender } = renderHook(() => useIdempotencyKey());
    const first = result.current.key;
    rerender();
    rerender();
    expect(result.current.key).toBe(first);
    expect(result.current.headers[IDEMPOTENCY_HEADER]).toBe(first);
  });

  it("reset() mints a fresh, different key (for the next submit)", () => {
    const { result } = renderHook(() => useIdempotencyKey());
    const before = result.current.key;
    act(() => result.current.reset());
    const after = result.current.key;
    expect(after).not.toBe(before);
    expect(after).toMatch(UUID_V4);
    expect(result.current.headers[IDEMPOTENCY_HEADER]).toBe(after); // headers track the new key
  });

  it("gives independent keys to independent hook instances", () => {
    const a = renderHook(() => useIdempotencyKey());
    const b = renderHook(() => useIdempotencyKey());
    expect(a.result.current.key).not.toBe(b.result.current.key);
  });
});
