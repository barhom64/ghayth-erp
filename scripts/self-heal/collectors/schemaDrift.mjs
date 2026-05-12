// Runs `pnpm run check:schema-drift` and parses the failure output into a
// list of normalized error objects. Returns [] on OK or non-parseable output.
//
// Output line shape (from check-schema-drift.mjs L817-820):
//   "  <file>  →  <id> (<kind> on \"<table>\")"
//   "  <file>  →  <id> (<kind>)"
//
// `<kind>` is a free-form phrase that may itself contain parens, e.g.
//   "Drizzle update key (not in lib/db schema)"
//   "Drizzle insert column (missing from live DB)"
//   "INSERT column", "UPDATE column", "quoted identifier",
//   "INSERT table", "UPDATE table", "SELECT table".
// So we cannot use a simple `(\w+)` group — we extract `<id>` and the trailing
// parenthetical span, then split that span on the literal ` on "<table>"` suffix.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";

const REPO_ROOT = new URL("../../../", import.meta.url).pathname;

export function collect() {
  const res = spawnSync("pnpm", ["run", "check:schema-drift"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 120_000,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  // exit 0 = clean.  exit 1 = drift.  exit 2 = crash.  null = timeout/signal.
  if (res.status === 0) return [];
  if (res.status !== 1) {
    // Crash or timeout — surface so the orchestrator can log it instead of pretending healthy.
    const tail = ((res.stderr || "") + (res.stdout || "")).split("\n").slice(-12).join("\n");
    throw new Error(`schema-drift collector failed (exit=${res.status}, signal=${res.signal}):\n${tail}`);
  }

  const out = (res.stderr || "") + "\n" + (res.stdout || "");
  const lines = out.split("\n");
  const findings = [];
  // Step 1: pull "<file>  →  <id>" prefix; capture the rest of the line (the parenthetical).
  // We then strip the outermost wrapping parens and an optional `on "<table>"` suffix.
  const prefixRe = /^\s+(\S.+?\.ts)\s+→\s+(\S+)\s+\((.+)\)\s*$/;
  for (const line of lines) {
    const m = line.match(prefixRe);
    if (!m) continue;
    const [, file, id, body] = m;
    const { kind, table } = splitBody(body);
    findings.push({
      collector: "schema-drift",
      file,
      id,
      kind,
      table,
      key: makeKey({ collector: "schema-drift", file, id, table }),
    });
  }
  return findings;
}

// `body` is the content between the outermost parens of a FAIL line.
// It is either `<kind>` or `<kind> on "<table>"`. `<kind>` may contain
// nested parens, so we look for the LAST occurrence of ` on "..."` at end-of-string.
function splitBody(body) {
  const tableRe = /\s+on\s+"([^"]+)"$/;
  const m = body.match(tableRe);
  if (m) return { kind: body.slice(0, m.index).trim(), table: m[1] };
  return { kind: body.trim(), table: null };
}

export function makeKey({ collector, file, id, table }) {
  const raw = `${collector}|${file}|${id}|${table || ""}`;
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}
