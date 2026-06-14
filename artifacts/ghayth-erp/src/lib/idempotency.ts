import { useCallback, useState } from "react";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";

function uuidv4(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

/**
 * useIdempotencyKey — generates a UUIDv4 on mount and returns the same key
 * across re-renders + accidental retries (double-clicks, network blips).
 *
 * Wire `headers` into a request that hits one of the idempotency-guarded
 * financial endpoints (invoice payment, credit/debit memo, customer advance
 * create/apply, bad-debt post, umrah penalty waive + bulk waive,
 * agent-invoice record-payment, payroll run, payroll approve, monthly
 * accruals). After a SUCCESSFUL submit, call `reset()` so the next user
 * action mints a fresh key and creates a NEW record instead of replaying
 * the cached response.
 *
 * The server (`idempotencyMiddleware`) hashes the body together with the
 * key — a retry with a different body returns 422, so the key only
 * "protects" the exact submit we sent.
 */
export function useIdempotencyKey(): {
  key: string;
  headers: Record<string, string>;
  reset: () => void;
} {
  const [key, setKey] = useState<string>(() => uuidv4());
  const reset = useCallback(() => setKey(uuidv4()), []);
  return { key, headers: { [IDEMPOTENCY_HEADER]: key }, reset };
}
