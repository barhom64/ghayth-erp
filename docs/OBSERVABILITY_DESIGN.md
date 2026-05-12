# Observability — design

> **Companion**: [`docs/MONITORING.md`](MONITORING.md) covers *what to watch on a running install* — endpoints to poll, alert thresholds, dashboard layout. This file covers *how the system is instrumented* — the vendor-neutral facade, what gets captured, and how to swap in a real backend.

## 1) Principle: vendor-neutral facade

The audit flagged "no central error tracking (Sentry)" as a top-15 risk. Rather than commit to a specific vendor at audit time, all error / message capture goes through a single facade module:

- **Frontend**: [`artifacts/ghayth-erp/src/lib/observability.ts`](../artifacts/ghayth-erp/src/lib/observability.ts) — already in place.
- **Backend**: [`artifacts/api-server/src/lib/logger.ts`](../artifacts/api-server/src/lib/logger.ts) — pino-based structured logger; will gain a sibling `observability.ts` facade in the next sprint.

The rest of the codebase **never** imports a vendor SDK directly. The day ops picks Sentry / Datadog / Honeycomb / Rollbar, the change is to the two facade files only.

## 2) Required capabilities

Anything below must work on day 1 with `console.*` and still work on day 2 against a real backend:

| Capability | Frontend API | Backend equivalent | Why |
| --- | --- | --- | --- |
| Capture exceptions | `captureException(err, ctx)` | `logger.error({ err, ...ctx }, msg)` | Crash investigation |
| Capture messages | `captureMessage(msg, level, ctx)` | `logger.[level]({ ...ctx }, msg)` | Non-exception signals (slow API, integration timeout) |
| User context | `setObsUser({ id, role, companyId })` | request-scoped `logger.child({ user })` | Per-user filtering in the backend |
| Tags (low-cardinality) | `setObsTag(key, value)` | request-scoped child logger | Feature flag, A/B variant, build version |
| Breadcrumbs | (future) | log lines themselves | Reconstruct what happened before a crash |
| Performance traces | (future) | (future) | Slow-page identification |

## 3) `EventReporter` — proposed vendor-neutral interface (next sprint)

Same shape on both sides; one implementation per side delegates to the underlying SDK.

```ts
// shared / per-side
export interface EventReporter {
  /** Stable id, e.g. `"sentry"`, `"datadog"`, `"console"`. */
  readonly id: string;

  /** Initialise once at app boot. No-op when called twice. */
  init(config: ObsConfig): Promise<void>;

  /** Capture an exception with context. */
  captureException(err: unknown, ctx?: ObsContext): void;

  /** Capture a structured non-exception message. */
  captureMessage(message: string, level: ObsLevel, ctx?: ObsContext): void;

  /** Set the current user (call on login; pass `null` on logout). */
  setUser(user: ObsUser | null): void;

  /** Set a low-cardinality tag attached to subsequent captures. */
  setTag(key: string, value: string | undefined): void;

  /** Clear all tags (test isolation). */
  clearTags(): void;

  /** Flush any in-memory queue. Call before app shutdown. */
  flush(timeoutMs: number): Promise<void>;
}
```

The existing frontend `lib/observability.ts` already exports `captureException` / `captureMessage` / `setObsUser` / `setObsTag` / `clearObsTags` with these exact shapes — the function names are deliberately a subset of Sentry's API so the swap is mechanical.

## 4) Registry — config-driven backend selection

```ts
// lib/observability/registry.ts (proposed)
const REPORTERS: Record<string, () => EventReporter> = {
  "console":  () => new ConsoleReporter(),
  "sentry":   () => new SentryReporter(),       // lazy: dynamic import
  "datadog":  () => new DatadogReporter(),      // lazy: dynamic import
  "noop":     () => new NoopReporter(),         // tests
};

export function getReporter(): EventReporter {
  const id = process.env.OBS_REPORTER ?? "console";
  return REPORTERS[id]?.() ?? new ConsoleReporter();
}
```

**Lazy import** is critical for two reasons:
1. The default install doesn't bundle vendor SDKs into every deployment.
2. The decision is config-driven, not compile-time-driven — same artifact ships everywhere.

## 5) What gets captured automatically

| Event | Source | When |
| --- | --- | --- |
| Unhandled exceptions | global `window.onerror` / Node `process.on("uncaughtException")` | Crash |
| Unhandled promise rejections | global `unhandledrejection` handler | Async crash |
| HTTP 5xx from the API | `apiClient.ts` response interceptor | Server returned 500/502/503 |
| HTTP timeout | `apiClient.ts` | Request exceeded the configured timeout |
| RBAC denial | `lib/rbac/authorize.ts` (already logs; future: forward) | Authorization failure |
| Slow API call | `apiClient.ts` (p95 > target) | Performance regression |
| Feature flag flip | `lib/flags.ts` (future) | Behaviour change observable in metrics |

## 6) What is **not** captured

Captured signals should be actionable. The following are explicit non-goals to keep the signal/noise ratio high:

- **Validation errors** (4xx). These are user input; they're logged at `info`, not error.
- **404 on detail pages**. Could be a stale link, doesn't need to wake anyone up.
- **Network-offline cases**. The retry layer handles them; reporting every one is noise.
- **Successful operations**. Logging is for observability, not auditing — see `audit_logs` for the audit trail.

## 7) Data we don't send to a vendor

Whichever backend ops picks, certain fields **must** be scrubbed before they leave the process:

- `passwordHash`, `password`, `oldPassword`, `newPassword`
- `apiKey`, `secret`, `token`, `accessToken`, `refreshToken`, `clientSecret`
- `nationalId`, `iqamaNumber`, `passportNumber` — encrypted at rest, but the cleartext lives in memory after decryption; scrub before sending
- `bankAccount`, `iban`
- Any field whose Zod schema marks it `pii: true` (future schema annotation)

Implementation: a `scrubSensitive(payload)` helper applied in the facade's `captureException` / `captureMessage` before delegating to the backend. **Backend SDK calls never see raw values for these keys.**

## 8) Env variables

```bash
OBS_REPORTER=console           # console | sentry | datadog | noop
OBS_DSN=                       # backend-specific connection string
OBS_ENVIRONMENT=production     # tag attached to every event
OBS_RELEASE=                   # commit SHA; correlate with deploys
OBS_SAMPLE_RATE=1.0            # 0..1; cost knob for high-volume installs
OBS_FLUSH_TIMEOUT_MS=2000      # before-shutdown flush deadline
```

These belong in [`docs/DEPLOYMENT.md`](DEPLOYMENT.md) §3 "Optional integrations" once the registry lands.

## 9) Phasing

**Phase A (today)**: facade in place, console-only. Production already has structured logs via pino + the frontend facade is logging-only. **This phase is complete.**

**Phase B (1 sprint)**: pick a vendor, wire it behind the facade.
- Add the SDK to the workspace catalog at the correct version.
- Implement `SentryReporter` (or chosen vendor) as a lazy module.
- Add the registry + `OBS_REPORTER=sentry` to the deployed envs.
- Document DSN provisioning in `DEPLOYMENT.md`.
- No code outside `lib/observability/` changes.

**Phase C (1 sprint, optional)**: performance traces.
- Wrap `apiClient` request lifecycle in `startTransaction` / `finish`.
- Wrap each page's route component in `startTransaction`.
- Enable performance sampling at 10% (cost knob).

**Phase D (future)**: feature-flag-aware A/B reporting, custom funnels, alerting rules — vendor-specific work, not codebase work.

## 10) Why not just use the vendor SDK directly

We considered importing Sentry's React SDK inline everywhere. Three problems:

1. **Lock-in**. Every page now references `@sentry/react`. Migrating costs every page.
2. **Bundle bloat for dev**. Even with tree-shaking, the SDK adds ~30 KB minified. A no-op facade adds ~1 KB.
3. **Test brittleness**. Unit tests for a page that imports `@sentry/react` need to mock it everywhere; tests that import the facade work against a `NoopReporter` set in test setup.

The facade is one extra file. The lock-in cost is unbounded.

## 11) Definition of Done — Phase B

- [ ] `lib/observability/` directory exists on both frontend and backend with the interface, registry, console + noop implementations, and one real implementation (chosen vendor).
- [ ] Existing `captureException` / `captureMessage` call sites unchanged (they hit the registry under the hood).
- [ ] `OBS_REPORTER=sentry` + `OBS_DSN=…` in a staging env produces events in the vendor dashboard.
- [ ] Sensitive-field scrubber unit-tested with the 12+ secret-shaped keys above.
- [ ] CI workflow sets `OBS_REPORTER=noop` so test runs don't ship events anywhere.
- [ ] Source-map upload step added to the deploy workflow (for stack-trace symbolication).
- [ ] `docs/DEPLOYMENT.md` and `docs/MONITORING.md` cross-link to this design.

## 12) References

- [`docs/MONITORING.md`](MONITORING.md) — operational complement.
- [`artifacts/ghayth-erp/src/lib/observability.ts`](../artifacts/ghayth-erp/src/lib/observability.ts) — current frontend facade.
- [`artifacts/api-server/src/lib/logger.ts`](../artifacts/api-server/src/lib/logger.ts) — pino logger that the backend facade will wrap.
