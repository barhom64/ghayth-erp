// `./generated/api` exports the Zod *schemas* as values (e.g. `LoginBody`
// is a `zod.object({...})`), while `./generated/types` exports TypeScript
// interfaces under the same names. Re-exporting both with `export *` makes
// every shared name ambiguous (TS2308) because the same identifier would
// then live in both the value and type namespaces from two different
// modules. The schemas are the primary surface of this package, so we
// re-export them here; consumers that need the raw TS interfaces can
// import them directly from `@workspace/api-zod/src/generated/types`.
export * from "./generated/api";

// FIN-SUB-05 (#2101) — the single canonical source for the finance direction
// maps shared by the api-server (enforcement) and the ghayth-erp form UX.
// Previously hand-duplicated on both sides (D-02/D-07); now both import here.
export {
  ACCOUNT_TYPE_LABELS,
  VOUCHER_COUNTER_ACCOUNT_TYPES,
} from "./financeDirectionMaps";
export type { AccountTypeKey } from "./financeDirectionMaps";
