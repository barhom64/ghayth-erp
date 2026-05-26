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

// ─── manual-form-instead-of-formshell (post-migration hard rule) ───────────
//
// The legacy useAutoDraft + useFieldErrors create-page pattern was fully
// migrated to FormShell + zod. The two helper hooks were deleted. Any
// reintroduction of either symbol under src/{pages,components,hooks,lib}
// fails the build.

console.log("manual-form-instead-of-formshell rule");

check(
  "importing useAutoDraft IS flagged",
  fires(
    "manual-form-instead-of-formshell",
    `import { useAutoDraft } from "@/hooks/use-auto-draft";`,
  ),
);
check(
  "importing useFieldErrors IS flagged",
  fires(
    "manual-form-instead-of-formshell",
    `import { useFieldErrors } from "@/hooks/use-field-errors";`,
  ),
);
check(
  "calling useAutoDraft IS flagged",
  fires(
    "manual-form-instead-of-formshell",
    `const { form, setForm } = useAutoDraft("k", { name: "" });`,
  ),
);
check(
  "FormShell + zodResolver usage is NOT flagged",
  !fires(
    "manual-form-instead-of-formshell",
    `import { FormShell } from "@workspace/ui-core";\nconst createMut = useApiMutation("/x", "POST");`,
  ),
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

// ─── native-confirm-or-prompt (post-migration hard rule) ───────────────────
//
// The codebase used to scatter window.confirm() / window.prompt() across
// list pages for "are you sure?" flows. They've all been replaced with
// ConfirmDeleteDialog / PromptDialog / inline AlertDialogs so RTL + dark
// mode + the rate-limit banner stay coherent. Any reintroduction of the
// native bridges fails the build.

console.log("native-confirm-or-prompt rule");

check(
  "window.confirm IS flagged",
  fires(
    "native-confirm-or-prompt",
    `if (!window.confirm("حذف؟")) return;`,
  ),
);
check(
  "window.prompt IS flagged",
  fires(
    "native-confirm-or-prompt",
    `const reason = window.prompt("السبب");`,
  ),
);
check(
  "bare confirm(\"...\") IS flagged",
  fires(
    "native-confirm-or-prompt",
    `if (!confirm("هل أنت متأكد؟")) return;`,
  ),
);
check(
  "ConfirmDeleteDialog import is NOT flagged",
  !fires(
    "native-confirm-or-prompt",
    `import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";`,
  ),
);
check(
  "onConfirm prop is NOT flagged",
  !fires(
    "native-confirm-or-prompt",
    `<Dialog onConfirm={handleConfirm}>Are you sure?</Dialog>`,
  ),
);

// ─── raw-table-in-page (ratchet) ───────────────────────────────────────────
//
// 30 raw <table>/<thead>/<tbody> occurrences across 17 pages — mostly
// invoice/voucher print views and umrah wizard summary blocks. The
// ratchet baseline prevents net-new raw tables; once a file is migrated
// off raw <table>, the baseline drops by that file's table count.

console.log("raw-table-in-page rule");

check(
  "bare <table> IS flagged",
  fires(
    "raw-table-in-page",
    `<table><thead><tr><th>الاسم</th></tr></thead></table>`,
  ),
);
check(
  "<table className=\"…\"> IS flagged",
  fires(
    "raw-table-in-page",
    `<table className="w-full text-sm"><tbody><tr><td>x</td></tr></tbody></table>`,
  ),
);
check(
  "<DataTable> import is NOT flagged",
  !fires(
    "raw-table-in-page",
    `import { DataTable } from "@workspace/ui-core";`,
  ),
);
check(
  "<tr>/<td> on their own are NOT flagged (only <table> opener)",
  !fires(
    "raw-table-in-page",
    `<tr><td>row inside DataTable render() callback</td></tr>`,
  ),
);

// ─── rtl-text-align-lr (ratchet) ───────────────────────────────────────────
//
// Physical text-left/right don't flip in RTL — they're the reason
// Arabic headings drift to the wrong side on mobile. Logical pair:
// text-start / text-end.

console.log("rtl-text-align-lr rule");

check(
  "text-left in className IS flagged",
  fires(
    "rtl-text-align-lr",
    `<div className="text-left mb-2">x</div>`,
  ),
);
check(
  "text-right in className IS flagged",
  fires(
    "rtl-text-align-lr",
    `<th className="p-2 text-right">العنوان</th>`,
  ),
);
check(
  "text-start is NOT flagged (logical equivalent)",
  !fires(
    "rtl-text-align-lr",
    `<div className="text-start mb-2">x</div>`,
  ),
);
check(
  "text-end is NOT flagged",
  !fires(
    "rtl-text-align-lr",
    `<th className="p-2 text-end">العنوان</th>`,
  ),
);

// ─── rtl-margin-padding-lr (ratchet) ───────────────────────────────────────

console.log("rtl-margin-padding-lr rule");

check(
  "ml-2 IS flagged",
  fires(
    "rtl-margin-padding-lr",
    `<Icon className="ml-2 h-4 w-4" />`,
  ),
);
check(
  "responsive md:pr-4 IS flagged",
  fires(
    "rtl-margin-padding-lr",
    `<div className="p-2 md:pr-4">x</div>`,
  ),
);
check(
  "ms-2 / me-2 are NOT flagged",
  !fires(
    "rtl-margin-padding-lr",
    `<Icon className="ms-2 me-1" />`,
  ),
);
check(
  "border-l-2 is NOT flagged (border, not margin)",
  !fires(
    "rtl-margin-padding-lr",
    `<div className="border-l-2 border-status-info">x</div>`,
  ),
);

// ─── rtl-position-left-right (ratchet) ─────────────────────────────────────

console.log("rtl-position-left-right rule");

check(
  "right-3 in absolute positioning IS flagged",
  fires(
    "rtl-position-left-right",
    `<Search className="absolute right-3 top-1/2" />`,
  ),
);
check(
  "left-0 IS flagged",
  fires(
    "rtl-position-left-right",
    `<div className="absolute left-0 top-1" />`,
  ),
);
check(
  "start-3 / end-3 are NOT flagged",
  !fires(
    "rtl-position-left-right",
    `<Search className="absolute start-3 top-1/2" />`,
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
