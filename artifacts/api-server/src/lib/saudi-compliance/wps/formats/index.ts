/**
 * Adapter registry. The dispatcher in `wps/builder.ts` looks up the
 * right adapter by `WpsFormat` tag. Adding a new bank is one
 * import + one entry in this map.
 */
import type { BankAdapter } from "./types.js";
import { ncbAdapter } from "./ncb.js";
import { alrajhiAdapter } from "./alrajhi.js";
import { riyadAdapter } from "./riyad.js";
import { alinmaAdapter } from "./alinma.js";

export type { BankAdapter } from "./types.js";

export const ADAPTERS: Record<string, BankAdapter> = {
  ncb: ncbAdapter,
  alrajhi: alrajhiAdapter,
  riyad: riyadAdapter,
  alinma: alinmaAdapter,
};

export { ncbAdapter, alrajhiAdapter, riyadAdapter, alinmaAdapter };
