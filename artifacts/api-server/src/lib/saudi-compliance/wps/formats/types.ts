/**
 * Per-bank WPS file-format adapters.
 *
 * Each Saudi bank has variations on the SAMA-reference WPS layout
 * — different header fields, line ordering, separator, or extra
 * trailing checksum. The generic pipe-delimited builder in
 * `wps/builder.ts` covers the SAMA reference; the per-bank
 * adapters in this folder cover the published variants.
 *
 * **Important caveat**: these adapters reflect the publicly-
 * documented format at the time this module was written. Banks
 * occasionally tweak the layout (an extra trailer column,
 * uppercased identifiers, ECB vs SAMA timestamp shape). Operators
 * MUST validate the generated file against a sample from their
 * bank's WPS tech contact before going live, and should keep one
 * tracked test fixture per bank so format drift surfaces in CI.
 *
 * The shared types + the dispatcher live in `wps/builder.ts`; this
 * folder is just leaf builders behind a uniform `BankAdapter`
 * contract.
 */
import type { WpsBuildResult, WpsPayrollEntry, WpsRunSummary } from "../../types.js";

export interface BankAdapter {
  /** Stable name written into wps_runs.bankCode. */
  code: string;
  /** Human-readable name for the dashboard. */
  name: string;
  /** Build the file body from the validated entries. The shared
   *  builder runs all input validation BEFORE invoking this — the
   *  adapter just emits bytes. */
  build(input: { summary: WpsRunSummary; entries: WpsPayrollEntry[] }): WpsBuildResult;
}
