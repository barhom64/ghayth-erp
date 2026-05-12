// Runs `pnpm run check:schema-drift` and parses the failure output into a
// list of normalized error objects. Returns [] on OK or non-parseable output.
//
// Output line shape (from check-schema-drift.mjs L817-820):
//   "  <file>  →  <id> (<kind> on \"<table>\")"
//   "  <file>  →  <id> (<kind>)"

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
  // exit 0 = clean. exit 1 = drift. exit 2 = crash.
  if (res.status === 0) return [];
  const out = (res.stderr || "") + "\n" + (res.stdout || "");
  const lines = out.split("\n");
  const findings = [];
  // Match "  <file>  →  <id> (<kind> on "<table>")" or "(<kind>)"
  const re = /^\s+(\S.+?\.ts)\s+→\s+(\S+)\s+\((\w+)(?:\s+on\s+"([^"]+)")?\)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const [, file, id, kind, table] = m;
    findings.push({
      collector: "schema-drift",
      file,
      id,
      kind,
      table: table || null,
      key: makeKey({ collector: "schema-drift", file, id, table }),
    });
  }
  return findings;
}

export function makeKey({ collector, file, id, table }) {
  const raw = `${collector}|${file}|${id}|${table || ""}`;
  return crypto.createHash("sha1").update(raw).digest("hex").slice(0, 16);
}
