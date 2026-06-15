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
    // ─── #1715 finance consolidation — guardrail #6 ──────────────────────
    // Every finance operation must be described by a FinanceOperationContext
    // and validated through `assertOperationValid(ctx)`. The posting policy
    // (`assertPaymentSourceAllowed`) is reached ONLY through that wrapper, so
    // the money-source ↔ payment-method check can never be bypassed or drift
    // per-route. The policy definition lives in lib/financePostingPolicy.ts
    // and the sanctioned wrapper in lib/financeOperationContext.ts — both in
    // lib/, outside this routes-only scan, so they are naturally exempt.
    // Hard rule (baseline 0): the expense + voucher create flows in
    // finance-journal.ts were migrated to the context in the wave-1 slice, so
    // no route calls the policy directly anymore.
    id: "direct-posting-policy-in-route",
    scan: [ROUTES_DIR],
    regex: /\bassertPaymentSourceAllowed\b/,
    message:
      "Direct `assertPaymentSourceAllowed(...)` inside a route is forbidden " +
      "(#1715 finance consolidation, guardrail #6). Build a " +
      "`FinanceOperationContext` with the matching adapter " +
      "(fromLegacyExpenseForm / fromLegacyVoucherForm / …) and validate via " +
      "`assertOperationValid(ctx)` from `lib/financeOperationContext.js`. The " +
      "posting policy must be reached only through that wrapper so the " +
      "money-source ↔ payment-method check stays unified and cannot be " +
      "bypassed by a route that forgets to call it.",
  },
  {
    // ─── #1715 guardrail #2 (frontend) — account-code prefix logic ────────
    // `code.startsWith("11"/"12"/"23"…)` as CORE account logic inside a
    // finance page/component is the scattered pattern #1715 PR-2 centralised
    // into `lib/finance-account-usage.ts` (accountUsage-driven). This ratchet
    // locks the current count so no NEW in-page prefix logic is added; each
    // migration of a page to finance-account-usage drops the baseline by the
    // same number. Started at 18; → 15 (expense + voucher money pickers) → 13
    // (salary-advances + custodies money pickers), all on `isMoneyAccount`.
    id: "account-code-startswith-in-finance-page",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR],
    extensions: [".tsx"],
    regex: /\bcode\??\)?\.startsWith\(\s*["'`][0-9]/,
    countBaseline: 13,
    message:
      "Account-code prefix logic (`code.startsWith(\"11\"/\"12\"/\"23\"…)`) " +
      "inside a finance page/component is forbidden as CORE logic (#1715 " +
      "guardrail #2). Use the centralised helpers in " +
      "`@/lib/finance-account-usage` (accountUsage-driven) so cash / bank / " +
      "receivable / payable classification has ONE source of truth instead of " +
      "a code-prefix guess duplicated per page. Ratchet: the baseline never " +
      "goes up — when you migrate a page off prefix logic, drop the " +
      "countBaseline in scripts/src/lint-patterns.mjs by the same number.",
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
    id: "direct-pdf-generation",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR, ERP_HOOKS_DIR, ERP_LIB_DIR],
    extensions: [".tsx", ".ts"],
    // The legitimate entry point — print-button.tsx opens window.open() +
    // document.write() to drop a server-rendered HTML doc into a popup
    // for the browser print dialog. That's the architecturally allowed
    // use of window.print(); it does NOT generate the document, the
    // Print Engine v2 does. All other pages must call apiFetch("/print/render").
    skip: (file) =>
      file.endsWith("/components/shared/print-button.tsx")
      || file.endsWith("/components/shared/entity-print.tsx")
      || file.includes("/components/print-layout") // legacy, type-only export
      || file.endsWith("/components/page-shell.tsx") // imports types from print-layout
      || file.endsWith("/lib/branch-utils.ts")
      // GAP_MATRIX P0 — BI analytics dashboards (recharts) cannot use /print/render
      // because content is client-rendered. These pages call logClientPrint() BEFORE
      // window.print() to record the audit event in print_jobs, satisfying the audit
      // requirement while keeping the visual dashboard intact.
      || file.endsWith("/pages/bi-admin-reports.tsx")
      || file.endsWith("/pages/bi-operations.tsx"),
    // Match direct PDF/print generation calls that should go through
    // the Print Engine instead. The Print Platform decision (Phase 0 of
    // docs/architecture/print-platform.md) requires that every PDF,
    // Excel, or printable HTML document be rendered server-side by
    // /api/print/render — the SPA must never generate documents itself.
    regex: /\bwindow\.print\(|\bjsPDF\b|\bhtml2pdf\b|\bhtml2canvas\b|\bpdfMake\b|\bpdfmake\b|\bnew\s+jsPDF|\bfrom\s+["']jspdf["']|\bfrom\s+["']html2pdf[^"']*["']|\bfrom\s+["']pdfmake[^"']*["']/,
    // Ratchet: 0 pre-existing violations after issue #1286 PR 1/4 (#1289)
    // migrated the last 7 pages to <PrintButton>. Locked at 0 so any
    // future regression — a new page calling window.print() or importing
    // jsPDF / html2pdf / pdfmake — fails CI immediately. To add a
    // legitimately allowed call site, add the file to the `skip` list
    // above with a comment explaining why it's the architecturally
    // sanctioned entry point.
    countBaseline: 0,
    message:
      "Direct PDF/print generation in the SPA is forbidden (Ghaith Print Platform, " +
      "Phase 0 architecture lock). Document generation must go through the server: " +
      "call `apiFetch(\"/print/render\", { method: \"POST\", body: ... })` (or use " +
      "<PrintButton entityType=\"...\" entityId={...} />) and let the Print Engine v2 " +
      "produce the bytes. Direct `window.print()` / `jsPDF` / `html2pdf` / `pdfmake` " +
      "calls bypass: audit logging (print_jobs), reprint detection, watermarks, " +
      "RBAC checks, branch letterhead, and ZATCA-compliant invoice rendering. " +
      "See docs/architecture/print-platform.md for the contract.",
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

  // ─── Unified numbering center (Issue #1141) ──────────────────────────
  // Every official document number (طلبات / عقود / مراسلات / فواتير /
  // سندات / قيود / مجموعات عمرة / …) MUST come from
  // `numberingService.issueNumber`. Direct `nextval(...)` calls on
  // ref/number/seq-style sequences inside route files (or the bare
  // `generateTimeRef` shortcut on official refs) bypass the audit log,
  // skip per-branch scoping, and let routes invent random fallbacks.
  // See artifacts/api-server/src/lib/numberingService.ts.
  //
  // Counter-style sequences (rate limit counters, internal tech refs)
  // are still allowed inside lib/. The rule only fires inside routes/.
  // Ratchets: the codebase still has a handful of pre-existing
  // sequence-direct + time-ref-as-number callsites in priority-2
  // routes (finance, properties, support, hr, warehouse). Each
  // rule's baseline matches the count at the time Issue #1141
  // landed. The lint *fails* when the count grows above the baseline
  // and silently accepts equal/lower counts — every migration of a
  // route to the numbering service should drop the baseline in the
  // same PR. When the count for a rule reaches 0, drop the
  // `countBaseline` to convert it to a hard rule.
  {
    id: "nextval-in-route",
    scan: [ROUTES_DIR],
    skip: (file) => file.endsWith("/routes/numbering.ts"),
    // Match `nextval('something_seq')` or any nextval call inside a
    // route file. The numbering authority owns all official sequences.
    // Hardened to a hard rule (baseline 0) — every route now routes
    // through `numberingService.issueNumber`.
    regex: /\bnextval\s*\(\s*['"`]?[a-zA-Z_]+_seq/,
    message:
      "Direct `nextval('…_seq')` calls inside route handlers are forbidden " +
      "(Issue #1141 — unified numbering center). Official document numbers " +
      "must be issued via `numberingService.issueNumber({ companyId, branchId, " +
      "moduleKey, entityKey, entityTable, actorId })` so the audit log, " +
      "per-branch scoping, and policy enforcement all apply. Add a row to " +
      "`numbering_schemes` for the (moduleKey, entityKey) you need, then call " +
      "issueNumber. If this really is an internal tech sequence (not an " +
      "official document number), move the call into a `lib/` helper.",
  },
  {
    id: "generateTimeRef-as-official-number",
    scan: [ROUTES_DIR],
    // Hardened to a hard rule (baseline 0). Every official document
    // number now routes through `numberingService.issueNumber`; the
    // few legitimate internal correlation refs (BATCH, BANK, SIG,
    // PAY-PORTAL) live in `lib/internalRef.ts` outside this scan path.
    regex: /\bgenerateTimeRef\s*\(/,
    message:
      "`generateTimeRef(...)` is a Date.now()-based tech ref, NOT a valid " +
      "official document number (Issue #1141). For executive document " +
      "numbers (طلبات / عقود / فواتير / سندات / …) call " +
      "`numberingService.issueNumber(...)` so the result lands in " +
      "`numbering_assignments` with a real per-branch counter. If you need " +
      "an internal correlation id (e.g. for an outbound webhook), move the " +
      "code into a lib/ helper outside routes/.",
  },
  {
    id: "inline-date-now-as-ref",
    scan: [ROUTES_DIR],
    // The 2026-05-27 coverage report exposed `ORD-${Date.now()}` in
    // store.ts:262 — same anti-pattern as generateTimeRef but written
    // inline so the previous rule didn't catch it. Catch any template
    // literal that splices Date.now() into a refish prefix string.
    // Shape: `XXX-${Date.now()}` or `XXX${Date.now()}` or with extra
    // segments. The `[A-Z]{2,}` requires a SHOUTY prefix so we don't
    // false-positive on date strings like `${Date.now()}.json`.
    //
    // Hard rule (baseline 0) — every inline-Date.now-as-ref offender
    // detected by the second-round audit has been closed:
    //   • routes/communications.ts  → internalTechRef("CALL") for the
    //     PBX correlation fallback (lib/internalRef — tech-only ref)
    //   • routes/finance-invoices.ts → issueNumber({ entityKey:
    //     "customer_advance" }) via migration 231
    //   • routes/finance-purchase.ts → issueNumber({ entityKey:
    //     "payment_run" }) via migration 227 (PR #1340)
    //   • routes/properties.ts → issueNumber({ entityKey: "case" })
    //     for the auto-created collection case
    //   • routes/store.ts → issueNumber({ entityKey: "store_order" })
    //     via migration 228 (PR #1345)
    // No baseline = any future inline-Date.now ref fails CI immediately.
    regex: /`[A-Z]{2,}[^`]*\$\{\s*Date\.now\s*\(\s*\)/,
    message:
      "Inline `${Date.now()}` inside a refish string is the same anti-pattern " +
      "as generateTimeRef(...) — it bypasses the numbering center (Issue " +
      "#1141). Call `numberingService.issueNumber(...)` instead. If this is " +
      "genuinely an internal tech correlation id (not a customer-visible " +
      "document number), move it to a lib/ helper (e.g. internalTechRef).",
  },
  {
    id: "random-as-ref-fallback",
    scan: [ROUTES_DIR],
    // Catch the specific anti-pattern called out in issue #1141: the
    // catch-block fallback that uses `Math.random()` to invent a "ref"
    // when sequence allocation fails. Such a fallback hides the real
    // problem and emits an audit-unfriendly random number.
    // The classic fallback shape from issue #1141:
    //   `.catch(... { seq: Math.floor(Math.random() * …) } …)` —
    // a `seq` / `ref` / `number` key followed by a Math.random expression
    // that synthesises a fake value. The regex looks BOTH directions: a
    // (seq|ref|number) key within ~180 chars before `Math.random()`, OR
    // the key appearing after the call.
    // Hardened to a hard rule (baseline 0) — every priority-1 + finance
    // route now issues numbers through `numberingService.issueNumber`,
    // so a Math.random fallback near a seq/ref/number is a regression.
    regex: /(?:\b(?:seq|ref|number)\b[^;]{0,180}Math\.random\s*\(|Math\.random\s*\(\s*\)[^;]{0,180}\b(?:seq|ref|number)\b)/,
    message:
      "`Math.random()` near a `ref` / `seq` / `number` value inside a route " +
      "is forbidden (Issue #1141). Random fallbacks hide the real failure " +
      "and produce numbers that no audit can trust. If the numbering call " +
      "fails, let the error bubble — the document must NOT be created " +
      "without a properly-issued number.",
  },
  {
    // Final guard for #1141 — the two legacy ref-builder helpers from
    // businessHelpers (generateRef / generateBranchRef) only assemble a
    // ref string from a sequence value the caller has already obtained.
    // They have NO audit, NO uniqueness check, and NO branch counter.
    // Every callsite that survived #1141 has been migrated to
    // numberingService; this rule prevents a regression in any route.
    id: "generateRef-or-generateBranchRef-in-route",
    scan: [ROUTES_DIR],
    regex: /\bgenerate(?:Branch)?Ref\s*\(/,
    message:
      "`generateRef(...)` / `generateBranchRef(...)` inside a route is " +
      "forbidden (Issue #1141). These helpers just format a string from " +
      "a seq the caller obtained — there is no audit, no counter, no " +
      "uniqueness check. Call `numberingService.issueNumber(...)` " +
      "instead so the resulting number lands in `numbering_assignments` " +
      "with full audit and per-scope uniqueness enforcement.",
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
  {
    id: "select-item-empty-value",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR],
    extensions: [".tsx"],
    // Radix's <Select.Item> CRASHES the entire page at render time when
    // value="" — the runtime throws the loud
    //   "A <Select.Item /> must have a value prop that is not an empty
    //    string. This is because the Select value can be set to an empty
    //    string to clear the selection and show the placeholder"
    // which leaks to operators as a fatal error overlay. Use a sentinel
    // like value="_none" and translate it back to "" on the parent's
    // onValueChange: `setX(v === "_none" ? "" : v)`. Reported by the
    // operator on the umrah import wizard — the wizard had 4 such
    // SelectItems and another lived on admin-communication-control.
    regex: /<SelectItem\s+value=""/,
    message:
      "`<SelectItem value=\"\">` crashes Radix Select on render. Use a " +
      "sentinel value like `\"_none\"` and translate back to \"\" in the " +
      "parent's onValueChange: " +
      "`<Select value={state || \"_none\"} onValueChange={(v) => setState(v === \"_none\" ? \"\" : v)}>` " +
      "with `<SelectItem value=\"_none\">— الكل —</SelectItem>`.",
  },
  // (No companion rule for unguarded `value={x.code}` in a .map.
  //  Pure regex can't distinguish API-data arrays from module-scope
  //  constants without a `skipMatch` hook the runner doesn't support.
  //  All known API-data callsites have been manually filtered:
  //    expenseAccounts → import-wizard.tsx
  //    bankAccOptions  → bank-reconciliation.tsx
  //    whtCategories   → vendors-create.tsx, vendors-edit.tsx
  //    taxCodes        → cost-splitter.tsx, invoices-create.tsx ×2
  //  Constants (COMMON_CURRENCIES, etc.) are compile-time safe.)
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
