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
  readString,
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

// ─── end-to-end: baseline must stay at zero orphans ────────────────────────
//
// This is the actual gate the audit is supposed to enforce. If anything
// regresses (a real broken URL lands, OR a heuristic gets too narrow and
// starts flagging valid templates), the count moves and this test
// surfaces it before the script does.

console.log("end-to-end audit — baseline invariant");

const { resolved, orphans, frontend } = runAudit();
check(
  `every scanned frontend call resolves to a real backend route (got ${orphans.length} orphan(s))`,
  orphans.length === 0,
);
check(
  `scan picks up a meaningful number of call-sites (>= 500, got ${frontend.length})`,
  frontend.length >= 500,
);
check(
  `resolved + orphans accounts for the whole scan`,
  resolved.length + orphans.length === frontend.length,
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
