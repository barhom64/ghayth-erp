#!/usr/bin/env node
//
// Tests for check-frontend-backend-wiring.mjs.
//
// The audit's value depends on three things being correct:
//   1. The string-literal reader handles nested templates without
//      truncating URLs.
//   2. The URL normaliser distinguishes path params (`${id}`) from
//      query suffixes (`${scopeSuffix}`, conditional QS).
//   3. urlsMatch treats `:param` as a wildcard segment.
// A regression in any of them silently swings the "0 orphan" baseline
// in either direction (false positives or false negatives), so each
// behaviour gets a dedicated fixture below.

import {
  normaliseFrontendUrl,
  urlsMatch,
  methodsMatch,
  readString,
  inferMethod,
  runAudit,
} from "./check-frontend-backend-wiring.mjs";

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) {
    console.log(`  ✓ ${name}`);
    pass++;
  } else {
    console.log(`  ✗ ${name}`);
    fail++;
  }
}

// ─── readString: string-literal reader ─────────────────────────────────────

console.log("readString — string-literal reader with nested templates");

check(
  "reads a plain double-quoted string",
  readString(`"/x/y"`, 0)?.value === "/x/y",
);
check(
  "reads a plain backtick template",
  readString("`/x/y`", 0)?.value === "/x/y",
);
check(
  "balances a single ${id} interpolation",
  readString("`/x/${id}/y`", 0)?.value === "/x/${id}/y",
);
check(
  "balances a nested template ${cond ? `?${qs}` : \"\"}",
  readString("`/x${cond ? `?${qs}` : \"\"}`", 0)?.value ===
    "/x${cond ? `?${qs}` : \"\"}",
);
check(
  "returns null on unterminated literal",
  readString("`/x/y", 0) === null,
);

// ─── normaliseFrontendUrl: ${...} → :param vs strip-QS ────────────────────

console.log("normaliseFrontendUrl — path param vs query suffix");

check(
  "plain literal: /finance/journals → /api/finance/journals",
  normaliseFrontendUrl("/finance/journals") === "/api/finance/journals",
);
check(
  "path param: /x/${id}/post → /api/x/:param/post",
  normaliseFrontendUrl("/x/${id}/post") === "/api/x/:param/post",
);
check(
  "drops scopeSuffix QS: /dashboard${scopeSuffix} → /api/dashboard",
  normaliseFrontendUrl("/dashboard${scopeSuffix}") === "/api/dashboard",
);
check(
  "drops filterParams QS: /x${filterParams} → /api/x",
  normaliseFrontendUrl("/x${filterParams}") === "/api/x",
);
check(
  "drops conditional QS: /x${cond ? `?${qs}` : \"\"} → /api/x",
  normaliseFrontendUrl('/x${cond ? `?${qs}` : ""}') === "/api/x",
);
check(
  "drops literal ?key= QS: /x?relatedId=${id} → /api/x",
  normaliseFrontendUrl("/x?relatedId=${id}") === "/api/x",
);
check(
  "preserves /api prefix if already present",
  normaliseFrontendUrl("/api/finance/x") === "/api/finance/x",
);

// ─── urlsMatch: segment-by-segment with :param wildcard ────────────────────

console.log("urlsMatch — segment-by-segment with :param wildcards");

check(
  "exact match",
  urlsMatch("/api/finance/x", "/api/finance/x") === true,
);
check(
  "frontend :param matches backend literal ID position",
  urlsMatch("/api/x/:param/post", "/api/x/:id/post") === true,
);
check(
  "different segment count never matches",
  urlsMatch("/api/x", "/api/x/y") === false,
);
check(
  "non-param mismatch fails",
  urlsMatch("/api/x/a", "/api/x/b") === false,
);
check(
  "both sides param: matches",
  urlsMatch("/api/x/:param/:param", "/api/x/:foo/:bar") === true,
);
check(
  "frontend :param does NOT match backend literal (regression guard)",
  // The original bug: `:param` would match `/impact-preview` and route
  // a `/projects/:id`-style frontend call to the wrong backend method.
  urlsMatch("/api/projects/:param", "/api/projects/impact-preview") === false,
);
check(
  "backend :id matches frontend literal numeric segment",
  urlsMatch("/api/users/42", "/api/users/:id") === true,
);

// ─── methodsMatch + inferMethod: HTTP-verb extraction ─────────────────────

console.log("methodsMatch — HTTP verb compatibility");

check(
  "exact verb match",
  methodsMatch("POST", "POST") === true,
);
check(
  "mismatched verbs fail",
  methodsMatch("POST", "GET") === false,
);
check(
  "'?' frontend wildcards match anything (apiFetch with spread options)",
  methodsMatch("?", "POST") === true,
);

console.log("inferMethod — verb extraction from each helper");

check(
  "apiPatch → PATCH",
  inferMethod("apiPatch", `apiPatch("/x", body);`, 0) === "PATCH",
);
check(
  "apiPost → POST",
  inferMethod("apiPost", `apiPost("/x", body);`, 0) === "POST",
);
check(
  "apiPut → PUT",
  inferMethod("apiPut", `apiPut("/x", body);`, 0) === "PUT",
);
check(
  "apiDelete → DELETE",
  inferMethod("apiDelete", `apiDelete("/x");`, 0) === "DELETE",
);
check(
  "useApiQuery → GET",
  inferMethod("useApiQuery", `useApiQuery([], "/x");`, 0) === "GET",
);
{
  const src = `apiFetch("/x", { method: "DELETE" })`;
  const afterUrl = src.indexOf(`",`) + 2; // just past the URL literal
  check(
    "apiFetch with method:DELETE in options → DELETE",
    inferMethod("apiFetch", src, afterUrl) === "DELETE",
  );
}
{
  const src = `apiFetch("/x")`;
  const afterUrl = src.indexOf(`")`) + 1;
  check(
    "apiFetch without options → GET (default)",
    inferMethod("apiFetch", src, afterUrl) === "GET",
  );
}
{
  const src = `useApiMutation("/x", "POST", […])`;
  const afterUrl = src.indexOf(`",`) + 2;
  check(
    "useApiMutation second arg → POST",
    inferMethod("useApiMutation", src, afterUrl) === "POST",
  );
}

// ─── normaliser: ternary value-substitution is NOT a QS suffix ────────────

console.log("normaliseFrontendUrl — ternary value substitution");

check(
  "ternary returning a path-segment value: /x/${editingId : \"\"} → /api/x/:param",
  // The ternary `editingId : ""` reads as "this segment or no segment".
  // Earlier the audit's QS heuristic was too greedy and stripped it,
  // turning a PATCH /x/:id call into a GET /x mismatch.
  normaliseFrontendUrl(`/x/\${typeof editingId === "number" ? editingId : ""}`) ===
    "/api/x/:param",
);

// ─── end-to-end: baseline must stay at zero orphans ────────────────────────
//
// This is the actual gate the audit is supposed to enforce. If anything
// regresses (a real broken URL lands, OR a heuristic gets too narrow and
// starts flagging valid templates), the count moves and this test
// surfaces it before the script does.

console.log("end-to-end audit — baseline invariant");

const { resolved, orphans, methodMismatches, unusedBackend, backendEndpointCount, frontend } = runAudit();
check(
  `every scanned frontend call resolves to a real backend route (got ${orphans.length} orphan(s))`,
  orphans.length === 0,
);
check(
  `every resolved call uses a method the backend serves (got ${methodMismatches.length} method mismatch(es))`,
  methodMismatches.length === 0,
);
check(
  `scan picks up a meaningful number of call-sites (>= 500, got ${frontend.length})`,
  frontend.length >= 500,
);
// Prop-source URLs (ApprovalActions / ConfirmDeleteDialog JSX props)
// were once best-effort (silently dropped on orphan / method-mismatch
// while pre-existing FE/BE drift was being cleaned up). Now they're
// gated the same as helper-source URLs, so the invariant is the
// strict three-bucket sum again.
check(
  `resolved + orphans + methodMismatches accounts for the whole scan`,
  resolved.length + orphans.length + methodMismatches.length === frontend.length,
);
// Reverse-direction sanity check: the unused-backend bookkeeping must
// produce a usable list. The original "> 0" assertion served as a canary
// against a `touchedByFrontend` bug that would mark every endpoint
// covered. Relaxing it to ">= 0" made it a tautology (any array's
// length is >= 0), removing the canary. Restore real teeth by asserting
// the unused list cannot cover ALL backend endpoints — if every endpoint
// suddenly looks "unused" something's broken in the matcher.
check(
  `unused-backend list is computed (got ${unusedBackend.length} entries — Phase C signal)`,
  Array.isArray(unusedBackend) && unusedBackend.length < resolved.length + orphans.length + methodMismatches.length,
);

// ─── summary ───────────────────────────────────────────────────────────────

console.log();
if (fail === 0) {
  console.log(`[check-frontend-backend-wiring.test] PASS — ${pass} fixtures passed.`);
  process.exit(0);
} else {
  console.log(
    `[check-frontend-backend-wiring.test] FAIL — ${fail} failed, ${pass} passed.`,
  );
  process.exit(1);
}
