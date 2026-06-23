import { z } from "zod";

/**
 * Safe boolean coercion for request inputs.
 *
 * `z.coerce.boolean()` is a footgun: it is `Boolean(value)`, so the STRING
 * "false" (and "0", "no", …) coerces to `true`. A client that sends a boolean
 * as a string therefore gets the OPPOSITE of what it asked for.
 *
 * `zCoerceBoolean()` handles the common string/number forms correctly:
 *   "true" | "1" | "yes" | "on" | true | non-zero number  → true
 *   "false" | "0" | "no" | "off" | "" | false | 0          → false
 * Anything else passes through to `z.boolean()`, which rejects it.
 * Mirrors the existing `raw === "true" || raw === "1"` convention already used
 * in lib/config.ts, lib/accountingAllocation.ts, and lib/cronScheduler.ts.
 */
export const zCoerceBoolean = () =>
  z.preprocess((v) => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.trim().toLowerCase();
      if (s === "true" || s === "1" || s === "yes" || s === "on") return true;
      if (s === "false" || s === "0" || s === "no" || s === "off" || s === "") return false;
    }
    return v;
  }, z.boolean());
