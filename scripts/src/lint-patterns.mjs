#!/usr/bin/env node
//
// scripts/src/lint-patterns.mjs — Phase 6 pattern guard.
//
// Lightweight regex-based linter that fails the build when any of the
// banned legacy patterns reappear in the API surface. Replaces a full
// ESLint setup which would require 30+ deps just to enforce 4 rules.
//
// Forbidden patterns (each row: { id, files, regex, message }):
//
//   1. local-requireRole
//      A locally-defined `function requireRole(scope, allowedRoles, res)`
//      helper that bypasses the typed-error pipeline. Use the shared
//      `assertRole` from `lib/roleGuards.js` instead — it throws
//      `ForbiddenError` so handleRouteError lights up `code: "FORBIDDEN"`.
//
//   2. legacy-validationError-call
//      A call to the deleted `validationError(res, ...)` helper. Throw
//      `new ValidationError(message, { field, fix })` instead so the
//      response goes through the TypedError pipeline.
//
//   3. legacy-validationError-import
//      A stale `validationError` named import from `lib/errorHandler.js`.
//      The export was removed in Phase 5c.
//
// Future rule (deferred until the codebase has been migrated):
//
//   4. raw-403-in-route — `res.status(403).json(...)` inside a route handler
//      bypasses the typed-error pipeline. There are ~90 legacy callsites
//      across hr.ts/admin.ts/auth.ts that still use this pattern. They will
//      be converted to `throw new ForbiddenError(...)` in a follow-up phase
//      and only then will this rule become enforceable. Adding it now would
//      flag pre-existing tech debt unrelated to Phase 5's cleanups.
//
// Usage:
//
//   node scripts/src/lint-patterns.mjs            # exit 0 if clean
//   pnpm lint:patterns                            # workspace alias
//
// Add new rules by appending to the RULES array. Rule IDs are stable
// so we can reference them in commit messages and incident reports.

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const API_SRC_DIR = join(REPO_ROOT, "artifacts/api-server/src");
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const LIB_DIR = join(REPO_ROOT, "artifacts/api-server/src/lib");
const MIDDLEWARES_DIR = join(REPO_ROOT, "artifacts/api-server/src/middlewares");
const ERP_PAGES_DIR = join(REPO_ROOT, "artifacts/ghayth-erp/src/pages");
const ERP_COMPONENTS_DIR = join(REPO_ROOT, "artifacts/ghayth-erp/src/components");
const ERP_HOOKS_DIR = join(REPO_ROOT, "artifacts/ghayth-erp/src/hooks");
// lib/ is included in the kit ratchet scan to close an evasion path:
// a re-export like `export { PageShell } from "@/components/page-shell"`
// living in artifacts/ghayth-erp/src/lib/some-shell.ts would otherwise
// satisfy the @/components import contract without tripping any of the
// kit-adoption rules below. Scanning lib/ ensures the rule sees those.
const ERP_LIB_DIR = join(REPO_ROOT, "artifacts/ghayth-erp/src/lib");

// Shared kit-adoption ratchet message — appended to every UI-kit
// counted rule below. Centralised so the wording stays consistent.
// Caller passes the @workspace/* target package, since the kit fans out
// across ui-core / entity-kit / workflow-kit / report-kit.
const kitRatchetHint = (pkg) =>
  `Migrate to \`import { ... } from "@workspace/${pkg}";\` (UNIFICATION_PLAN ` +
  "§P8). The baseline below is a ratchet — it never goes up. When you migrate " +
  "a page off the legacy path, drop the corresponding `countBaseline` in " +
  "scripts/src/lint-patterns.mjs by the same number; the rule then prevents " +
  "future regression to the new lower count.";

// Backwards-compat constant for the original six ui-core rules.
const KIT_RATCHET_HINT = kitRatchetHint("ui-core");

/** @type {Array<{ id: string, scan: string[], skip?: (file: string) => boolean, regex: RegExp, message: string }>} */
const RULES = [
  {
    id: "local-requireRole",
    scan: [ROUTES_DIR],
    regex: /^\s*function\s+requireRole\s*\(\s*scope\s*[:,]/m,
    message:
      "Local `function requireRole(scope, ...)` helper is forbidden. " +
      "Import `assertRole` from `../lib/roleGuards.js` and call " +
      "`assertRole(scope, [...allowedRoles])` so the failure flows " +
      "through `handleRouteError` as a typed `ForbiddenError`.",
  },
  {
    id: "legacy-validationError-call",
    scan: [ROUTES_DIR, LIB_DIR],
    skip: (file) => file.endsWith("/lib/errorHandler.ts"),
    regex: /\bvalidationError\s*\(\s*res\b/,
    message:
      "`validationError(res, ...)` was deleted in Phase 5c. Throw " +
      "`new ValidationError(message, { field, fix })` so the response " +
      "goes through the TypedError → handleRouteError pipeline.",
  },
  {
    id: "legacy-validationError-import",
    scan: [ROUTES_DIR, LIB_DIR],
    skip: (file) => file.endsWith("/lib/errorHandler.ts"),
    regex: /^\s*validationError\s*,?\s*$/m,
    message:
      "Stale `validationError` named import. The lowercase-v helper was " +
      "removed in Phase 5c — only the `ValidationError` class is exported now.",
  },
  {
    id: "direct-gl-import-in-domain-route",
    scan: [ROUTES_DIR],
    skip: (file) => {
      const base = file.split("/").pop();
      return base.startsWith("finance") || base === "index.ts";
    },
    regex: /\b(?:createJournalEntry|createGuardedJournalEntry)\b/,
    message:
      "Direct GL function import in non-finance route is forbidden. " +
      "Use the domain engine's GL method (e.g. hrEngine.postPayrollRunGL) " +
      "which routes through financialEngine.postJournalEntry() with " +
      "period checks, sourceKey idempotency, and budget validation.",
  },
  {
    id: "save-button-missing-rateLimitAware",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR],
    extensions: [".tsx"],
    skip: (file) => file.endsWith("/components/ui/button.tsx"),
    // Match `<Button ...>` whose attribute span (`...`) contains either
    // `type="submit"` or an `onClick={handleSomeWriteAction}` but does NOT
    // contain `rateLimitAware`. Action verbs are intentionally limited to
    // write/submit-style handlers; pure navigation handlers (handleEdit,
    // handleView, handleClose, handleCancel, etc.) are not flagged.
    // `[^>]` excludes `>` so the match stops at the closing bracket of the
    // opening tag; `s` flag lets `.` style classes span newlines, and
    // because `[^>]` already crosses newlines we naturally cover multiline
    // `<Button\n  prop={...}\n  onClick={handleSave}\n>` declarations
    // in a whole-file (not line-by-line) scan.
    regex: /<Button\b(?![^>]*\brateLimitAware\b)[^>]*\b(?:type="submit"|onClick=\{handle(?:Save|Submit|Create|Update|Add|Pay|Approve|Reject|Apply|Send|Post|Settle|Issue|Match|Search|Record|Confirm|Process|Generate|Allocate|Distribute|Refund|Verify|Activate|Deactivate|Renew|Extend|Terminate|Transfer|Assign|Reconcile|Upload|Import|Export|Schedule|Run|Bulk|Batch)[A-Za-z]*\})[^>]*>/g,
    multiline: true,
    message:
      "Save / submit / write-action <Button> is missing the `rateLimitAware` " +
      "prop. During a global 429 cooldown the button must disable itself and " +
      "show \"حاول بعد N ثانية…\". Add `rateLimitAware` to the button (Task #155 / #164). " +
      "If the handler is purely read-only (e.g. open a dialog, navigate, toggle UI), " +
      "rename it so it doesn't start with one of the write verbs the rule scans for.",
  },
  {
    id: "direct-account-mapping-in-domain-route",
    scan: [ROUTES_DIR],
    skip: (file) => {
      const base = file.split("/").pop();
      return base.startsWith("finance") || base === "index.ts";
    },
    regex: /\bgetAccountCodeFromMapping\b/,
    message:
      "Direct getAccountCodeFromMapping call in non-finance route is forbidden. " +
      "Account code resolution should happen inside the domain engine " +
      "(e.g. fleetEngine, propertiesEngine) via financialEngine.resolveAccountCode().",
  },
  {
    id: "unlocalized-toLocaleString",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR],
    extensions: [".tsx", ".ts"],
    // The shadcn chart wrapper uses toLocaleString() for tooltip values
    // and is upstream code; date-utils + formatters are the canonical
    // formatters and are allowed to call it directly with an explicit
    // locale (which the regex below already excludes).
    skip: (file) =>
      file.endsWith("/components/ui/chart.tsx")
      || file.endsWith("/lib/date-utils.ts")
      || file.endsWith("/lib/formatters.ts"),
    // Match `.toLocaleString(` followed immediately by `)` — i.e. no
    // arguments. Calls with a locale string (`toLocaleString("ar-SA")`)
    // and calls with a NumberFormat options object pass cleanly.
    regex: /\.toLocaleString\(\s*\)/,
    message:
      "`.toLocaleString()` without an explicit locale falls back to the " +
      "user's browser locale, producing inconsistent digit grouping and " +
      "numerals across users. Import `formatNumber` from `@/lib/formatters` " +
      "(returns Arabic-Indic digits with en-US grouping) or pass an " +
      "explicit locale string if you need a non-default behaviour.",
  },
  {
    id: "direct-process-env-read",
    scan: [API_SRC_DIR],
    // lib/config.ts is the ONE module allowed to touch process.env — it
    // parses and validates every variable into the typed `config` object.
    skip: (file) => file.endsWith("/lib/config.ts"),
    regex: /\bprocess\.env\b/,
    message:
      "Direct `process.env` access is forbidden outside lib/config.ts (FND-003). " +
      "Declare the variable in the lib/config.ts zod schema, expose it on the " +
      "`AppConfig` shape, and read it through the typed `config` object. This " +
      "keeps validation, defaults and the startup fail-fast gate in one place.",
  },

  // ─── UI-kit adoption ratchet (UNIFICATION_PLAN §P8) ──────────────────
  //
  // The six rules below count how many files still import a UI kit
  // primitive from its legacy `@/components/...` location instead of
  // `@workspace/ui-core`. Each carries a `countBaseline`: the runner
  // FAILS when the live count exceeds that number, but accepts equal
  // or lower counts silently. This is the ratchet — the legacy path
  // shrinks over time, never grows. Migrations of existing pages should
  // include a baseline drop in the same PR.
  //
  // When the count for any rule reaches zero, convert it to a plain
  // (uncounted) rule — every match becomes a hard failure.

  {
    id: "page-shell-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    // The component definition itself is exempt — that's where the
    // primitive lives. The @workspace/ui-core re-export shim also
    // points there until the Phase 3 physical move. The other two
    // composites (CreatePageLayout, ListPage) build on PageShell —
    // those internal imports are part of the kit's own plumbing.
    skip: (file) =>
      file.endsWith("/components/page-shell.tsx") ||
      file.endsWith("/components/create-page-layout.tsx") ||
      file.endsWith("/components/list-page.tsx"),
    regex: /from\s+["']@\/components\/page-shell["']/,
    // Hardened from ratchet → hard rule (baseline reached 0 in sweep 13).
    message: `PageShell imported from the legacy path. ${KIT_RATCHET_HINT}`,
  },
  {
    id: "form-shell-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) => file.endsWith("/components/form-shell.tsx"),
    regex: /from\s+["']@\/components\/form-shell["']/,
    // Hardened from ratchet → hard rule (baseline reached 0 in sweep 14).
    message: `FormShell imported from the legacy path. ${KIT_RATCHET_HINT}`,
  },
  {
    id: "data-table-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) =>
      file.endsWith("/components/ui/data-table.tsx") ||
      file.endsWith("/components/data-table-wrapper.tsx") ||
      file.endsWith("/components/data-table-presets.tsx") ||
      file.endsWith("/components/list-page.tsx"),
    regex: /from\s+["']@\/components\/ui\/data-table["']/,
    // Hardened from ratchet → hard rule (baseline reached 0 in sweep 13).
    message: `DataTable imported from the legacy path. ${KIT_RATCHET_HINT}`,
  },
  {
    id: "page-status-badge-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) =>
      file.endsWith("/components/page-status-badge.tsx") ||
      file.endsWith("/components/data-table-presets.tsx") ||
      file.endsWith("/components/shared/detail-page-layout.tsx") ||
      file.endsWith("/components/shared/entity-detail-page.tsx") ||
      file.endsWith("/components/shared/linked-tasks.tsx") ||
      file.endsWith("/components/shared/quick-preview-dialog.tsx") ||
      file.endsWith("/components/shared/employee-discipline-summary.tsx"),
    regex: /from\s+["']@\/components\/page-status-badge["']/,
    // Hardened from ratchet → hard rule.
    message: `PageStatusBadge imported from the legacy path. ${KIT_RATCHET_HINT}`,
  },
  {
    id: "create-page-layout-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) => file.endsWith("/components/create-page-layout.tsx"),
    regex: /from\s+["']@\/components\/create-page-layout["']/,
    // Hardened from ratchet → hard rule.
    message: `CreatePageLayout imported from the legacy path. ${KIT_RATCHET_HINT}`,
  },
  {
    id: "detail-page-layout-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) =>
      file.endsWith("/components/shared/detail-page-layout.tsx") ||
      file.endsWith("/components/shared/entity-detail-page.tsx") ||
      file.endsWith("/hooks/use-registry-tabs.tsx"),
    regex: /from\s+["']@\/components\/shared\/detail-page-layout["']/,
    // Hardened from ratchet → hard rule.
    message: `DetailPageLayout imported from the legacy path. ${kitRatchetHint("entity-kit")}`,
  },

  // ─── Wider ui-core surface (advanced-filters, presets, wrappers) ─────

  {
    id: "advanced-filters-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) =>
      file.endsWith("/components/shared/advanced-filters.tsx") ||
      file.endsWith("/components/shared/bulk-actions.tsx") ||
      file.endsWith("/components/list-page.tsx"),
    regex: /from\s+["']@\/components\/shared\/advanced-filters["']/,
    // Hardened from ratchet → hard rule.
    message: `AdvancedFilters / useFilters / applyFilters imported from the legacy path. ${kitRatchetHint("ui-core")}`,
  },
  {
    id: "data-table-presets-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) =>
      file.endsWith("/components/data-table-presets.tsx") ||
      file.endsWith("/components/list-page.tsx"),
    regex: /from\s+["']@\/components\/data-table-presets["']/,
    // Hardened from ratchet → hard rule.
    message: `DataTable column presets imported from the legacy path. ${kitRatchetHint("ui-core")}`,
  },
  {
    id: "data-table-wrapper-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) =>
      file.endsWith("/components/data-table-wrapper.tsx") ||
      file.endsWith("/components/ui/data-table.tsx"),
    regex: /from\s+["']@\/components\/data-table-wrapper["']/,
    // Hardened from ratchet → hard rule.
    message: `DataTableWrapper / PaginationBar imported from the legacy path. ${kitRatchetHint("ui-core")}`,
  },
  {
    id: "page-header-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) => file.endsWith("/components/page-header.tsx"),
    regex: /from\s+["']@\/components\/page-header["']/,
    // Hardened from ratchet → hard rule.
    message: `PageHeader imported from the legacy path. ${kitRatchetHint("ui-core")}`,
  },

  // ─── entity-kit surface ──────────────────────────────────────────────

  {
    id: "entity-timeline-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) => file.endsWith("/components/shared/entity-timeline.tsx"),
    regex: /from\s+["']@\/components\/shared\/entity-timeline["']/,
    // Hardened from ratchet → hard rule.
    message: `EntityTimeline / ProcessStages / WorkflowTimeline imported from the legacy path. ${kitRatchetHint("entity-kit")}`,
  },
  {
    id: "entity-comments-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) => file.endsWith("/components/shared/entity-comments.tsx"),
    regex: /from\s+["']@\/components\/shared\/entity-comments["']/,
    // Hardened from ratchet → hard rule (baseline reached 0 in sweep 10).
    // Any future legacy import fails immediately.
    message: `EntityComments imported from the legacy path. ${kitRatchetHint("entity-kit")}`,
  },
  {
    id: "entity-documents-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) => file.endsWith("/components/shared/entity-documents.tsx"),
    regex: /from\s+["']@\/components\/shared\/entity-documents["']/,
    // Hardened from ratchet → hard rule (baseline reached 0 in sweep 10).
    message: `EntityDocuments imported from the legacy path. ${kitRatchetHint("entity-kit")}`,
  },

  // ─── workflow-kit surface ────────────────────────────────────────────

  {
    id: "approval-actions-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) => file.endsWith("/components/approval-actions.tsx"),
    regex: /from\s+["']@\/components\/approval-actions["']/,
    // Hardened from ratchet → hard rule.
    message: `ApprovalActions / ActionHistory imported from the legacy path. ${kitRatchetHint("workflow-kit")}`,
  },

  // ─── report-kit surface ──────────────────────────────────────────────

  {
    id: "print-layout-from-legacy-path",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) =>
      file.endsWith("/components/print-layout.tsx") ||
      file.endsWith("/components/shared/entity-print.tsx") ||
      file.endsWith("/hooks/use-branch-letterhead.ts") ||
      file.endsWith("/lib/branch-utils.ts"),
    regex: /from\s+["']@\/components\/print-layout["']/,
    // Hardened from ratchet → hard rule.
    message: `PrintActions / PrintDocument / LetterheadHeader imported from the legacy path. ${kitRatchetHint("report-kit")}`,
  },

  // ─── Design-system tokens — Status badges with literal colors ────────
  //
  // Every status that the user reads ("معتمد", "مرفوض", "بانتظار", …)
  // must render through <PageStatusBadge status=... domain=...> so the
  // color + label come from the canonical STATUS_MAP. A raw <Badge> with
  // `bg-amber-100 text-amber-700` (or any other literal color class)
  // bypasses STATUS_MAP — the same status then renders different colors
  // on different pages.
  //
  // Two specific patterns are caught:
  //   <Badge className="bg-amber-100 text-amber-700 ...">معتمد</Badge>
  //   <Badge className={cn("text-xs", st.color)}> where st.color
  //   carries a literal `bg-amber-100`.
  //
  // Tokenised classes (`bg-status-success-surface`, `text-status-warning-foreground`)
  // are NOT caught — those are the design-system tokens this rule wants
  // pages to use (directly or via PageStatusBadge).
  //
  // countBaseline drops as offenders migrate to PageStatusBadge; rule
  // becomes a hard fail when it reaches 0.
  {
    id: "badge-with-literal-status-color",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR],
    extensions: [".tsx"],
    skip: (file) =>
      // Shadcn primitive — `<Badge>` is defined here, may use any color.
      file.endsWith("/components/ui/badge.tsx") ||
      // Data-table primitive — owns the count-badge that the table draws
      // around bulk-select chips; not a status badge surface.
      file.endsWith("/components/ui/data-table.tsx") ||
      // ApprovalActions (workflow-kit) renders explanatory chips for the
      // permission state, not the entity's lifecycle status.
      file.endsWith("/components/approval-actions.tsx") ||
      // PageStatusBadge itself shadows the rule (it composes <Badge>
      // internally — caught by the rule but exempt by definition).
      file.endsWith("/components/page-status-badge.tsx"),
    // `[^>]` excludes `>` so the match stops at the closing bracket of
    // the opening Badge tag; this catches multi-line attributes too.
    regex: /<Badge\b[^>]*\bbg-(?:amber|green|red|blue|orange|purple|yellow|pink|cyan|teal|emerald|rose|indigo)-(?:50|100|200|300|600|700|800)\b/,
    multiline: true,
    // Hardened from ratchet → hard rule (baseline reached 0 after the
    // first design-unification sprint migrated 45 violations across
    // HR/Finance/Properties/CRM). Any new offender now fails CI.
    message:
      "Raw <Badge> with literal color classes (bg-amber-100 / bg-green-700 / …) " +
      "is forbidden for status surfaces. Use <PageStatusBadge status={...} " +
      "domain={...}> from @workspace/ui-core so the color + Arabic label come " +
      "from STATUS_MAP and stay consistent across the system. For non-status " +
      "decorative chips, use a design-token surface (`bg-status-success-surface " +
      "text-status-success-foreground`, etc.) instead of literal colors.",
  },

  // ─── Design-system tokens — Pixel-literal text sizes ─────────────────
  //
  // `text-[10px]`, `text-[9px]` etc. embed pixel-literal sizes that
  // bypass the typography knob (html { font-size: 18px }). When the
  // knob scales everything else +12%, text-[10px] stays exactly 10px
  // — disproportionately small next to scaled body text.
  //
  // Two replacements depending on the call site:
  //   • text-[10px] → text-2xs   (rem-based 0.625rem, defined in
  //                               index.css @theme — scales with knob)
  //   • text-[8px]  → text-3xs   (rem-based 0.5rem)
  //   • text-[Nrem] or text-xs/sm/etc — already rem-based, NOT caught
  //
  // countBaseline drops as offenders migrate; rule becomes hard fail at 0.
  {
    id: "text-px-literal",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    // No skip-list: the rule wants 0 occurrences everywhere. Charts /
    // icons / illustrations that legitimately need pixel literals use
    // `style={{ fontSize: "Npx" }}` (inline style, different surface,
    // not caught by this rule).
    regex: /text-\[\d+px\]/,
    // Hardened from ratchet → hard rule (baseline reached 0 in one
    // sweep: 481 literals across 60+ files migrated to text-2xs /
    // text-3xs in a single sed pass once the rem-based tokens were
    // defined in index.css @theme).
    message:
      "`text-[Npx]` with a pixel literal bypasses the typography knob " +
      "(html { font-size: 18px } in index.css) so the text does not " +
      "scale with the +12% global up-size. Use the rem-based design " +
      "tokens defined in index.css @theme: `text-2xs` (0.625rem ≈ 11px " +
      "at the current scale) for chip/caption sizes, `text-3xs` " +
      "(0.5rem) for the very dense table-cell labels, or the built-in " +
      "Tailwind `text-xs`/`text-sm` for body-adjacent text.",
  },

  // ── Form patterns — Manual draft+errors instead of FormShell ────────
  //
  // FormShell (lib/ui-core, exported via @workspace/ui-core) wraps
  // react-hook-form + zod + a unified submit/error/loading UI. Before
  // it existed, pages rolled their own form state with two custom
  // hooks: useAutoDraft (drafts → localStorage) and useFieldErrors
  // (server VALIDATION_ERROR → per-field). Pages that import either
  // hook are by-definition NOT using FormShell — they reinvent the
  // submit-button position, the "saving…" state, the toast strategy
  // and the field-error display.
  //
  // The rule counts every `useAutoDraft` import as a proxy for "this
  // page is on the manual form pattern". Drop the baseline by the
  // same number when you migrate a page off useAutoDraft onto
  // FormShell + zod schema.
  //
  // When the count reaches 0, harden the rule and delete the two
  // hooks from the codebase — they'll have no remaining importers.
  {
    id: "manual-form-instead-of-formshell",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) =>
      // The hook definition files themselves are exempt — they're
      // where the pattern lives. Once the rule reaches 0 these can
      // be deleted entirely.
      file.endsWith("/hooks/use-auto-draft.ts") ||
      file.endsWith("/hooks/use-auto-draft.tsx") ||
      file.endsWith("/hooks/use-field-errors.ts") ||
      file.endsWith("/hooks/use-field-errors.tsx"),
    regex: /\buseAutoDraft\b/,
    countBaseline: 54,
    message:
      "`useAutoDraft` (and its sibling `useFieldErrors`) is the manual " +
      "form pattern that predates FormShell. Pages on the manual " +
      "pattern carry their own submit-button position, error toast " +
      "strategy, field-error display and \"saving…\" state — none of " +
      "which line up across pages. Migrate to `<FormShell schema={...} " +
      "defaultValues={...} onSubmit={...}>` from @workspace/ui-core; " +
      "see pages/create/warehouse/categories-create.tsx or " +
      "pages/create/hr/contracts-edit.tsx for the canonical shape. " +
      "The countBaseline is a ratchet — drop it by the same number " +
      "every time you migrate a page off useAutoDraft.",
  },

  // ─── Design-system tokens — Inline hex colors ───────────────────────
  //
  // `style={{ color: "#16a34a" }}` and friends bypass the design-system
  // color tokens (`text-status-success-foreground`, etc). Two real
  // problems:
  //
  //   1. Dark-mode breakage. When the theme flips to dark, the literal
  //      hex stays the same — usually unreadable. The token system has
  //      separate values for light/dark.
  //   2. Brand drift. Two pages render "positive number" green with
  //      #16a34a and #059669 — close but not the same. The system
  //      ends up with 4-6 shades of green nobody can keep aligned.
  //
  // Skip-list: print/letterhead pages legitimately use fixed hex —
  // they render on paper, no dark mode, fixed brand identity. Those
  // four files account for 75 of the 115 historical hex codes.
  //
  // countBaseline drops as offenders migrate; rule becomes hard at 0.
  {
    id: "inline-hex-color",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    skip: (file) =>
      // Print-template pages — fixed hex for paper output is correct.
      // Removing this exemption would force fragile token-to-hex
      // resolution at print time.
      file.endsWith("/pages/finance/invoice-detail.tsx") ||
      file.endsWith("/pages/finance/purchase-order-detail.tsx") ||
      file.endsWith("/pages/details/opportunity-detail.tsx") ||
      file.endsWith("/pages/store/order-detail.tsx") ||
      file.endsWith("/pages/hr/official-letters.tsx") ||
      // Login page: pre-auth screen, no dark-mode concern, fixed brand
      // gradient identity (#1565c0 → #0d47a1 primary, #d97706 → #b45309
      // forgot-password). Adding these to @theme would create a single-
      // consumer token; the gradients are intentionally one-off here.
      file.endsWith("/pages/login.tsx") ||
      // Data-driven category-color surfaces. Folder.color and Role.color
      // are runtime DB fields, not theme tokens; the `|| "#fallback"`
      // pattern is the right way to handle "no color configured yet".
      file.endsWith("/pages/documents-page.tsx") ||
      file.endsWith("/pages/admin/rbac-v2-tab.tsx"),
    // Match `style={{ ... #abc ... }}` where any hex literal (3/6/8
    // digits) appears inside an inline style object. The leading
    // `style=\{\{` anchors it to the JSX inline-style attribute.
    regex: /style=\{\{[^}]*#[0-9a-fA-F]{3,8}\b/,
    multiline: true,
    // Hardened from ratchet → hard rule (baseline 41 → 0 after the
    // design-unification sprint: 41 status hex codes migrated to
    // text-status-{success,error,warning}-foreground tokens via a
    // Python global rewrite; 11 roleKeyColors fallbacks centralised
    // into a `getRoleColor()` helper in app-context; 1 inverse-color
    // tax-system literal lifted into a cn() conditional).
    message:
      "Inline hex color in a JSX `style={{ color: \"#...\" }}` attribute " +
      "is forbidden outside print/letterhead pages. Use the design-system " +
      "tokens (`text-status-success-foreground` / `bg-status-warning-surface` " +
      "/ etc.) on a `className` instead — they have separate light/dark " +
      "values and stay consistent across the system. For a conditional " +
      "color, lift the className into a `cn(...)` expression on a single " +
      "element. For data-driven colors (a `row.color` field), centralise " +
      "the fallback in a helper (see `getRoleColor()` in app-context).",
  },
];

// ─── Pure matchers (exported for self-tests) ─────────────────────────────
//
// `matchSourceAgainstRule(rule, source)` returns the list of hits a single
// rule produces against a single in-memory source string. No filesystem,
// no scan list, no `skip()` evaluation — the caller has already decided
// the file qualifies. Mirrors the matching logic used inside main(), so a
// test fixing the matcher fixes both runtime and test surface.
//
/** @returns {Array<{ line: number, snippet: string }>} */
export function matchSourceAgainstRule(rule, source) {
  const hits = [];
  if (rule.multiline) {
    const re = rule.regex.global
      ? rule.regex
      : new RegExp(rule.regex.source, rule.regex.flags + "g");
    let m;
    while ((m = re.exec(source)) !== null) {
      const lineNumber = source.slice(0, m.index).split("\n").length;
      const snippet = m[0].split("\n")[0].trim();
      hits.push({
        line: lineNumber,
        snippet:
          snippet.length > 200 ? snippet.slice(0, 200) + "…" : snippet,
      });
      if (re.lastIndex === m.index) re.lastIndex++;
    }
  } else {
    source.split("\n").forEach((line, index) => {
      if (rule.regex.test(line)) {
        hits.push({ line: index + 1, snippet: line.trim() });
      }
    });
  }
  return hits;
}

export { RULES };

/** Recursively yield every file under a directory matching the given extensions. */
async function* walk(dir, extensions = [".ts"]) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full, extensions);
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      yield full;
    }
  }
}

async function main() {
  const failures = [];
  const countedRuleHits = new Map(); // rule.id → [{file, line, snippet}]
  const ratchetWarnings = []; // baseline-can-be-lowered hints

  for (const rule of RULES) {
    for (const root of rule.scan) {
      for await (const file of walk(root, rule.extensions ?? [".ts"])) {
        if (rule.skip && rule.skip(file)) continue;
        const source = await readFile(file, "utf8");
        const isCounted = typeof rule.countBaseline === "number";
        for (const raw of matchSourceAgainstRule(rule, source)) {
          const hit = {
            rule: rule.id,
            file: relative(REPO_ROOT, file),
            line: raw.line,
            snippet: raw.snippet,
            message: rule.message,
          };
          if (isCounted) {
            if (!countedRuleHits.has(rule.id)) countedRuleHits.set(rule.id, []);
            countedRuleHits.get(rule.id).push(hit);
          } else {
            failures.push(hit);
          }
        }
      }
    }

    // Apply ratchet check after each counted rule's full sweep.
    if (typeof rule.countBaseline === "number") {
      const hits = countedRuleHits.get(rule.id) ?? [];
      const baseline = rule.countBaseline;
      if (hits.length > baseline) {
        // Regression: new violations beyond the baseline. Convert all hits
        // to hard failures so the diff is visible.
        const overage = hits.length - baseline;
        for (const h of hits) {
          failures.push({
            ...h,
            message:
              `Ratchet exceeded: count is ${hits.length}, baseline is ${baseline} ` +
              `(+${overage} new violation${overage === 1 ? "" : "s"}). ${rule.message}`,
          });
        }
      } else if (hits.length < baseline) {
        // Progress: baseline can be lowered. Emit a non-blocking warning.
        ratchetWarnings.push({
          rule: rule.id,
          liveCount: hits.length,
          baseline,
        });
      }
    }
  }

  // Emit ratchet progress hints before any failures so contributors see
  // them on green runs too.
  if (ratchetWarnings.length > 0) {
    console.log("");
    console.log("ℹ ratchet progress — baselines can be lowered:");
    for (const w of ratchetWarnings) {
      console.log(
        `   • ${w.rule}: live count ${w.liveCount} < baseline ${w.baseline} ` +
        `(drop countBaseline to ${w.liveCount} in scripts/src/lint-patterns.mjs)`,
      );
    }
    console.log("");
  }

  if (failures.length === 0) {
    console.log("✓ lint-patterns: clean — no forbidden legacy patterns found.");
    process.exit(0);
  }

  console.error(
    `✗ lint-patterns: ${failures.length} violation(s) of forbidden patterns:\n`,
  );
  const grouped = new Map();
  for (const f of failures) {
    if (!grouped.has(f.rule)) grouped.set(f.rule, []);
    grouped.get(f.rule).push(f);
  }
  for (const [rule, hits] of grouped) {
    const head = hits[0];
    console.error(`── ${rule} (${hits.length}) ──`);
    console.error(`   ${head.message}`);
    for (const h of hits) {
      console.error(`   • ${h.file}:${h.line}  ${h.snippet}`);
    }
    console.error("");
  }
  process.exit(1);
}

// Run only when executed directly — importing this module from
// lint-patterns.test.mjs must not trigger the full scan.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("[lint-patterns] crashed:", err);
    process.exit(1);
  });
}
