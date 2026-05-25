# Performance benchmarks

Pure-function microbenchmarks for the hottest CPU paths in the API.
Run them locally to validate a refactor hasn't regressed the per-request
budget. They are **not** part of the regular test suite (`pnpm test`)
and are not wired into CI.

## Run

```bash
# From artifacts/api-server
pnpm bench

# Filter to one file
pnpm bench tests/benchmarks/scopedQuery.bench.ts

# Filter by describe/bench name
pnpm bench -t "buildScopedWhere"
```

Output is `hz` (ops/sec, higher is better), mean/median (ns, lower is better),
and `rme%` (relative margin of error — keep below ~3% for stable numbers).

## What's covered

| File                      | Hot path                                                                  |
| ------------------------- | ------------------------------------------------------------------------- |
| `scopedQuery.bench.ts`    | `buildScopedWhere` — multi-tenant predicate builder, every list endpoint  |
| `auditDiff.bench.ts`      | `computeDiff` — runs on every mutation that writes `audit_log`            |
| `algorithms.bench.ts`     | Haversine, moving avg, critical path, resource picker                     |
| `fx.bench.ts`             | `convertWithRate`, `computeRealizedFx`, `computeRevaluationLines`         |
| `businessHelpers.bench.ts`| Riyadh-aware `currentDateInTz`, `combineDateAndShiftTime`, VAT, rounding  |

Only **pure** functions belong here. DB-driven paths are measured by the
integration suite + production tracing — microbenching them produces
noise dominated by Postgres round-trip variance.

## Adding a new benchmark

1. Put the file under `tests/benchmarks/` with a `.bench.ts` suffix.
2. Use `describe` to group related cases and `bench(name, fn)` per case.
3. Build any large fixtures **outside** the `bench` callback so the
   measurement isolates the function under test.
4. Cover the realistic input shape, not the synthetic best case — the
   point is to catch regressions on the path the API actually walks.
