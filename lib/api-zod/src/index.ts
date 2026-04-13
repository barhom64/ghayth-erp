// `./generated/api` exports the Zod *schemas* as values (e.g. `LoginBody`
// is a `zod.object({...})`), while `./generated/types` exports TypeScript
// interfaces under the same names. Re-exporting both with `export *` makes
// every shared name ambiguous (TS2308) because the same identifier would
// then live in both the value and type namespaces from two different
// modules. The schemas are the primary surface of this package, so we
// re-export them here; consumers that need the raw TS interfaces can
// import them directly from `@workspace/api-zod/src/generated/types`.
export * from "./generated/api";
