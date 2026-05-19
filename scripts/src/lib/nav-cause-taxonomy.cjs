/**
 * Nav-cause taxonomy — Runtime Certification Harness v2, Phase 6.
 *
 * Single source of truth for the machine-readable codes the audit
 * harness assigns to every a4 (navigation) failure. Replaces the
 * regex-based `categorize()` in runtime-audit.cjs with a closed enum +
 * per-code metadata so:
 *
 *   1. Downstream tools (CI, Prometheus, Grafana, dashboards) can pivot
 *      on a stable code instead of brittle prefix matching.
 *   2. Adding a new cause requires a single edit to this file (the
 *      catalog is the contract).
 *   3. Operator UI can render `severity` / `retryable` / `description`
 *      without re-implementing the rules.
 *
 * Schema per entry:
 *   code        — canonical machine-readable identifier (e.g. "harness.timeout")
 *   category    — one of: harness | authz | auth | unknown
 *   severity    — info | warning | error  (operator-facing)
 *   retryable   — true iff the harness should retry the route
 *   relaunch    — true iff chromium should be relaunched before retry
 *   description — short human-readable explanation (en)
 *   match       — array of RegExp the legacy navCause string is tested against
 *
 * Dependency-free. Pure CJS so both runtime-audit.cjs and the orchestrator
 * (runtime-verify.cjs, Phase 7) can require it.
 */

"use strict";

const CATEGORIES = ["harness", "authz", "auth", "unknown"];
const SEVERITIES = ["info", "warning", "error"];

const TAXONOMY = [
  // ── harness category — audit infra noise, NOT runtime defects ──
  {
    code: "harness.timeout",
    category: "harness",
    severity: "warning",
    retryable: true,
    relaunch: false,
    description: "page.goto exceeded 25s — chromium/proxy starvation, not a route defect",
    match: [/^harness-timeout/],
  },
  {
    code: "harness.detached_frame",
    category: "harness",
    severity: "warning",
    retryable: true,
    relaunch: true,
    description: "chromium crashed mid-navigation (detached frame)",
    match: [/^harness-detached-frame/],
  },
  {
    code: "harness.session_closed",
    category: "harness",
    severity: "warning",
    retryable: true,
    relaunch: true,
    description: "browser or page died (Target/Session closed)",
    match: [/^harness-session-closed/],
  },
  {
    code: "harness.protocol_error",
    category: "harness",
    severity: "warning",
    retryable: true,
    relaunch: true,
    description: "puppeteer/CDP protocol error mid-probe",
    match: [/^harness-protocol-error/],
  },
  {
    code: "harness.throw",
    category: "harness",
    severity: "warning",
    retryable: true,
    relaunch: false,
    description: "uncategorized harness throw (probe loop caught)",
    match: [/^harness-throw/, /^harness-/],
  },

  // ── auth category — real session expiry / auth failure ──
  {
    code: "auth.api401_redirect",
    category: "auth",
    severity: "error",
    retryable: false,
    relaunch: false,
    description: "apiFetch saw 401 and pushed /login (real session expiry)",
    match: [/^api401/],
  },
  {
    code: "auth.session_lost_mid_nav",
    category: "auth",
    severity: "error",
    retryable: false,
    relaunch: false,
    description: "localStorage cleared mid-nav, no /login redirect captured",
    match: [/^session-lost-mid-nav/],
  },
  {
    code: "auth.login_bounce_no_401",
    category: "auth",
    severity: "error",
    retryable: false,
    relaunch: false,
    description: "bounced to /login, no 401 captured — refresh path swallowed something",
    match: [/^login-bounce-no-401/],
  },

  // ── authz category — SPA guard / RBAC defects (real, but lower urgency) ──
  {
    code: "authz.forbidden_bounce",
    category: "authz",
    severity: "error",
    retryable: false,
    relaunch: false,
    description: "SPA guard sent /login with valid session + no api4xx — should be /forbidden (#638/#669)",
    match: [/^forbidden-bounce/],
  },
  {
    code: "authz.access_denied",
    category: "authz",
    severity: "warning",
    retryable: false,
    relaunch: false,
    description: "URL did not change; SPA rendered AccessDenied banner",
    match: [/^AccessDenied/],
  },
  {
    code: "authz.api4xx_no_redirect",
    category: "authz",
    severity: "warning",
    retryable: false,
    relaunch: false,
    description: "some 4xx fired but URL never reached /login or expected path",
    match: [/^api4xx-no-redirect/],
  },

  // ── unknown — genuinely unclassified ──
  {
    code: "unknown.unclassified",
    category: "unknown",
    severity: "warning",
    retryable: false,
    relaunch: false,
    description: "navCause did not match any known pattern — needs trace inspection",
    match: [/^unclassified/, /^$/],
  },
];

const BY_CODE = Object.fromEntries(TAXONOMY.map((t) => [t.code, t]));
const UNKNOWN = BY_CODE["unknown.unclassified"];

/**
 * Resolve a legacy navCause string (e.g. "harness-timeout (page.goto…)")
 * into its canonical taxonomy entry. Returns the UNKNOWN entry if no
 * matcher fires.
 */
function classify(navCause) {
  const raw = String(navCause || "").replace(/^navCause=/, "").trim();
  if (!raw) return UNKNOWN;
  for (const entry of TAXONOMY) {
    for (const re of entry.match) {
      if (re.test(raw)) return entry;
    }
  }
  return UNKNOWN;
}

/**
 * Convenience: just the category bucket for a navCause (back-compat with
 * the regex-based categorize() in runtime-audit.cjs).
 */
function categoryOf(navCause) {
  return classify(navCause).category;
}

/**
 * Returns the full catalog as a plain JSON-serializable array — used by
 * the audit pack writer so consumers can `cat taxonomy.json` and see
 * every supported code without grepping source.
 */
function catalog() {
  return TAXONOMY.map(({ match, ...rest }) => ({
    ...rest,
    matchSources: match.map((re) => re.source),
  }));
}

module.exports = {
  classify,
  categoryOf,
  catalog,
  CATEGORIES,
  SEVERITIES,
  TAXONOMY,
};
