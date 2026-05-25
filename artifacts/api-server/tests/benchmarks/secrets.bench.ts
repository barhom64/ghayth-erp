// Benchmarks for `isEncrypted` — the prefix guard called on every
// settings-row read (SMS tokens, WhatsApp tokens, API keys). Pure
// string check; we bench it to catch any regression that adds
// regex/parse overhead to the hot path.
//
// `encryptSecret` / `decryptSecret` aren't benched here: they call
// `scryptSync` (deliberately slow KDF) and would dominate the
// numbers without telling us anything useful.
//
import { bench, describe } from "vitest";
import { isEncrypted } from "../../src/lib/secrets.js";

const ENCRYPTED = "enc:v1:abc123==:tag==:cipher==";
const PLAIN = "sk_live_1234567890abcdef";
const ALMOST = "encrypted:v1:something"; // looks similar but lacks the exact prefix

describe("isEncrypted", () => {
  bench("already-encrypted payload (prefix match)", () => {
    isEncrypted(ENCRYPTED);
  });

  bench("legacy plaintext (no prefix)", () => {
    isEncrypted(PLAIN);
  });

  bench("near-miss prefix (must NOT match)", () => {
    isEncrypted(ALMOST);
  });

  bench("null input", () => {
    isEncrypted(null);
  });

  bench("undefined input", () => {
    isEncrypted(undefined);
  });
});
