#!/usr/bin/env node
//
// scripts/src/lint-patterns.test.mjs — self-test for the kit-adoption
// ratchet + hardened rules in lint-patterns.mjs ("guard the guard").
//
// The lint script is the load-bearing piece holding the UI-kit migration
// in place: once a rule's countBaseline is removed, any future legacy
// import must fire the rule. If a regex regresses (too narrow ⇒ silent
// false-negative, too broad ⇒ noisy false-positive) we lose the entire
// invariant without anyone noticing.
//
// This test runs the in-memory matcher against synthetic source strings
// — no filesystem, no DB — so it works inside scripts/guard.sh exactly
// like check-migration-policy.test.mjs.
//
// Exits 0 when every fixture passes, 1 otherwise.

import { matchSourceAgainstRule, RULES } from "./lint-patterns.mjs";

let failed = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name}`);
    failed++;
  }
}

function ruleById(id) {
  const rule = RULES.find((r) => r.id === id);
  if (!rule) throw new Error(`unknown rule id in test: ${id}`);
  return rule;
}

const hits = (id, source) => matchSourceAgainstRule(ruleById(id), source);
const fires = (id, source) => hits(id, source).length > 0;

// ─── UI kit hardened rules ──────────────────────────────────────────────
//
// Every one of the 15 kit-adoption rules was hardened from a counted
// ratchet into a hard rule once its live count reached zero. The test
// asserts the regex still fires on the legacy `@/components/...` import
// path and still passes when the same component is imported from the
// canonical `@workspace/...` package.

console.log("UI kit rules — legacy `@/components/...` path IS flagged");

check(
  "page-shell-from-legacy-path",
  fires("page-shell-from-legacy-path", `import { PageShell } from "@/components/page-shell";`),
);
check(
  "form-shell-from-legacy-path",
  fires("form-shell-from-legacy-path", `import { FormShell } from "@/components/form-shell";`),
);
check(
  "data-table-from-legacy-path",
  fires("data-table-from-legacy-path", `import { DataTable } from "@/components/ui/data-table";`),
);
check(
  "page-status-badge-from-legacy-path",
  fires("page-status-badge-from-legacy-path", `import { PageStatusBadge } from "@/components/page-status-badge";`),
);
check(
  "create-page-layout-from-legacy-path",
  fires("create-page-layout-from-legacy-path", `import { CreatePageLayout } from "@/components/create-page-layout";`),
);
check(
  "detail-page-layout-from-legacy-path",
  fires("detail-page-layout-from-legacy-path", `import { DetailPageLayout } from "@/components/shared/detail-page-layout";`),
);
check(
  "advanced-filters-from-legacy-path",
  fires("advanced-filters-from-legacy-path", `import { AdvancedFilters } from "@/components/shared/advanced-filters";`),
);
check(
  "data-table-presets-from-legacy-path",
  fires("data-table-presets-from-legacy-path", `import { presets } from "@/components/data-table-presets";`),
);
check(
  "data-table-wrapper-from-legacy-path",
  fires("data-table-wrapper-from-legacy-path", `import { DataTableWrapper } from "@/components/data-table-wrapper";`),
);
check(
  "page-header-from-legacy-path",
  fires("page-header-from-legacy-path", `import { PageHeader } from "@/components/page-header";`),
);
check(
  "entity-timeline-from-legacy-path",
  fires("entity-timeline-from-legacy-path", `import { EntityTimeline } from "@/components/shared/entity-timeline";`),
);
check(
  "entity-comments-from-legacy-path",
  fires("entity-comments-from-legacy-path", `import { EntityComments } from "@/components/shared/entity-comments";`),
);
check(
  "entity-documents-from-legacy-path",
  fires("entity-documents-from-legacy-path", `import { EntityDocuments } from "@/components/shared/entity-documents";`),
);
check(
  "approval-actions-from-legacy-path",
  fires("approval-actions-from-legacy-path", `import { ApprovalActions } from "@/components/approval-actions";`),
);
check(
  "print-layout-from-legacy-path",
  fires("print-layout-from-legacy-path", `import { PrintDocument } from "@/components/print-layout";`),
);

console.log("UI kit rules — canonical `@workspace/...` path is NOT flagged");

check(
  "page-shell from ui-core",
  !fires("page-shell-from-legacy-path", `import { PageShell } from "@workspace/ui-core";`),
);
check(
  "form-shell from ui-core",
  !fires("form-shell-from-legacy-path", `import { FormShell } from "@workspace/ui-core";`),
);
check(
  "data-table from ui-core",
  !fires("data-table-from-legacy-path", `import { DataTable } from "@workspace/ui-core";`),
);
check(
  "detail-page-layout from entity-kit",
  !fires("detail-page-layout-from-legacy-path", `import { DetailPageLayout } from "@workspace/entity-kit";`),
);
check(
  "approval-actions from workflow-kit",
  !fires("approval-actions-from-legacy-path", `import { ApprovalActions } from "@workspace/workflow-kit";`),
);
check(
  "print-layout from report-kit",
  !fires("print-layout-from-legacy-path", `import { PrintDocument } from "@workspace/report-kit";`),
);

// ─── Skip-list correctness ──────────────────────────────────────────────
//
// Each kit rule exempts the file(s) where the primitive itself lives —
// otherwise the component definition file would trip its own rule. The
// skip predicate is evaluated against absolute paths in main(); here we
// feed it path strings ending the way the production walker would.

console.log("Skip-lists — kit definition files are exempt");

const exempt = (id, path) => {
  const rule = ruleById(id);
  return rule.skip ? rule.skip(path) === true : false;
};

check(
  "page-shell.tsx itself is exempt from page-shell rule",
  exempt("page-shell-from-legacy-path", "/repo/artifacts/ghayth-erp/src/components/page-shell.tsx"),
);
check(
  "list-page.tsx is exempt from page-shell rule (kit composite)",
  exempt("page-shell-from-legacy-path", "/repo/artifacts/ghayth-erp/src/components/list-page.tsx"),
);
check(
  "form-shell.tsx itself is exempt from form-shell rule",
  exempt("form-shell-from-legacy-path", "/repo/artifacts/ghayth-erp/src/components/form-shell.tsx"),
);
check(
  "data-table.tsx itself is exempt from data-table rule",
  exempt("data-table-from-legacy-path", "/repo/artifacts/ghayth-erp/src/components/ui/data-table.tsx"),
);
check(
  "detail-page-layout.tsx itself is exempt from detail-page-layout rule",
  exempt("detail-page-layout-from-legacy-path", "/repo/artifacts/ghayth-erp/src/components/shared/detail-page-layout.tsx"),
);
check(
  "entity-comments.tsx itself is exempt from entity-comments rule",
  exempt("entity-comments-from-legacy-path", "/repo/artifacts/ghayth-erp/src/components/shared/entity-comments.tsx"),
);
check(
  "approval-actions.tsx itself is exempt from approval-actions rule",
  exempt("approval-actions-from-legacy-path", "/repo/artifacts/ghayth-erp/src/components/approval-actions.tsx"),
);
check(
  "print-layout.tsx itself is exempt from print-layout rule",
  exempt("print-layout-from-legacy-path", "/repo/artifacts/ghayth-erp/src/components/print-layout.tsx"),
);

check(
  "an arbitrary page is NOT exempt from page-shell rule",
  !exempt("page-shell-from-legacy-path", "/repo/artifacts/ghayth-erp/src/pages/sales/invoices.tsx"),
);

// ─── Non-kit hard rules (the original Phase 5 patterns) ─────────────────

console.log("Original Phase 5 rules still fire");

check(
  "local requireRole helper IS flagged",
  fires("local-requireRole", `function requireRole(scope: Scope, allowedRoles: string[], res: Response) {`),
);
check(
  "calling validationError(res, ...) IS flagged",
  fires("legacy-validationError-call", `  return validationError(res, "field is required");`),
);
check(
  "direct GL import in non-finance route IS flagged",
  fires("direct-gl-import-in-domain-route", `import { createJournalEntry } from "../lib/journal";`),
);
check(
  "direct getAccountCodeFromMapping in non-finance route IS flagged",
  fires("direct-account-mapping-in-domain-route", `const code = getAccountCodeFromMapping("REVENUE");`),
);
check(
  ".toLocaleString() without args IS flagged",
  fires("unlocalized-toLocaleString", `const display = balance.toLocaleString();`),
);
check(
  ".toLocaleString('ar-SA') with locale is NOT flagged",
  !fires("unlocalized-toLocaleString", `const display = balance.toLocaleString('ar-SA');`),
);
check(
  "direct process.env access IS flagged",
  fires("direct-process-env-read", `const url = process.env.DATABASE_URL;`),
);

// ─── Save-button rate-limit rule (multiline) ────────────────────────────
//
// The hardest regex in the file: it must catch <Button type="submit"> or
// <Button onClick={handleSave}> without rateLimitAware, AND must accept
// the same button once the prop is present, AND must ignore read-only
// handlers like onClick={handleView}.

console.log("save-button-missing-rateLimitAware rule");

check(
  "submit button missing rateLimitAware IS flagged",
  fires(
    "save-button-missing-rateLimitAware",
    `<Button type="submit" disabled={isSubmitting}>حفظ</Button>`,
  ),
);
check(
  "handleSave button missing rateLimitAware IS flagged",
  fires(
    "save-button-missing-rateLimitAware",
    `<Button onClick={handleSave} variant="default">حفظ</Button>`,
  ),
);
check(
  "submit button WITH rateLimitAware is NOT flagged",
  !fires(
    "save-button-missing-rateLimitAware",
    `<Button type="submit" rateLimitAware disabled={isSubmitting}>حفظ</Button>`,
  ),
);
check(
  "read-only handleView button is NOT flagged",
  !fires(
    "save-button-missing-rateLimitAware",
    `<Button onClick={handleView}>عرض</Button>`,
  ),
);
check(
  "read-only handleEdit button is NOT flagged",
  !fires(
    "save-button-missing-rateLimitAware",
    `<Button onClick={handleEdit}>تعديل</Button>`,
  ),
);

// ─── Ratchet structural invariant ───────────────────────────────────────
//
// All 15 kit rules were intentionally hardened — none of them should
// still carry a countBaseline. If anyone re-introduces a baseline (which
// would silently allow up to N regressions back), this test catches it.

console.log("Ratchet structural invariant — no kit rule still carries countBaseline");

const kitRuleIds = [
  "page-shell-from-legacy-path",
  "form-shell-from-legacy-path",
  "data-table-from-legacy-path",
  "page-status-badge-from-legacy-path",
  "create-page-layout-from-legacy-path",
  "detail-page-layout-from-legacy-path",
  "advanced-filters-from-legacy-path",
  "data-table-presets-from-legacy-path",
  "data-table-wrapper-from-legacy-path",
  "page-header-from-legacy-path",
  "entity-timeline-from-legacy-path",
  "entity-comments-from-legacy-path",
  "entity-documents-from-legacy-path",
  "approval-actions-from-legacy-path",
  "print-layout-from-legacy-path",
];
for (const id of kitRuleIds) {
  const rule = ruleById(id);
  check(
    `${id} is a hard rule (no countBaseline)`,
    typeof rule.countBaseline !== "number",
  );
}

// Sanity check: every rule has the four required keys.
console.log("Rule shape invariant");
for (const rule of RULES) {
  check(
    `rule ${rule.id} has scan/regex/message`,
    Array.isArray(rule.scan) && rule.scan.length > 0 &&
      rule.regex instanceof RegExp &&
      typeof rule.message === "string" && rule.message.length > 0,
  );
}

if (failed > 0) {
  console.error(`\n[lint-patterns.test] FAIL — ${failed} fixture(s) failed.`);
  process.exit(1);
}
console.log(`\n[lint-patterns.test] PASS — all lint-pattern fixtures passed.`);
