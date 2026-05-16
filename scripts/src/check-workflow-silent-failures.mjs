#!/usr/bin/env node
// scripts/src/check-workflow-silent-failures.mjs
//
// Guard: flag any step in `.github/workflows/*.yml` that masks a
// non-zero exit code without re-checking it.
//
// Two patterns are flagged:
//
//   (A) `... || true` on a shell line. Catches the Task #404 family —
//       audit-runtime.yml ran `pnpm --filter @ghayth-erp/api-spec run
//       generate || true` (wrong package + wrong script) and the
//       `|| true` swallowed the resulting non-zero exit, so the
//       workflow stayed green for weeks while the codegen step did
//       nothing. Variants accepted: `|| true`, `||true`, `||  true`,
//       and `|| /bin/true`.
//
//   (B) `continue-on-error: true` on a step whose outcome is never
//       re-checked. `continue-on-error` is only safe when a later step
//       reads `steps.<id>.outcome` (or `.conclusion`) and decides what
//       to do; otherwise the entire step's failure mode is invisible.
//       A step with no `id:` at all is, by definition, never checked.
//
// Why a separate guard from check:workflow-pnpm-filters: that one
// catches typos in the filter call itself; this one catches the
// broader class of "exit code intentionally swallowed and never
// looked at again". They overlap only on the original Task #404 line.
//
// Allowlist: `scripts/workflow-silent-failures-allowlist.txt`. One
// entry per line, `#` comments OK. Two key shapes:
//
//   <basename>:or-true:<trimmed line content>
//     e.g. `audit-runtime.yml:or-true:tail -200 /tmp/api-server.log || true`
//     The line content must match the trimmed source line exactly
//     (after stripping leading shell indentation). This makes the
//     allowlist self-documenting and forces a re-review whenever the
//     line is edited.
//
//   <basename>:continue-on-error:<step-id-or-name>
//     e.g. `audit-runtime.yml:continue-on-error:audit`
//     The key is the step's `id:` if present, else the verbatim
//     `name:` value. Used for steps whose result is checked
//     indirectly (e.g. by inspecting an output file or a side-effect
//     gate later in the job).
//
// Stale allowlist entries fail the guard so the file stays honest.
//
// Exit codes: 0 = clean, 1 = violation(s) found, 2 = bad setup.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

const WORKFLOWS_DIR =
  process.env.WF_SILENT_WORKFLOWS_DIR ||
  path.join(REPO_ROOT, ".github", "workflows");
const ALLOWLIST_PATH =
  process.env.WF_SILENT_ALLOWLIST ||
  path.join(REPO_ROOT, "scripts", "workflow-silent-failures-allowlist.txt");

function listWorkflowFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => path.join(dir, f));
}

function readAllowlist(p) {
  const allow = new Map(); // key -> { hit, lineNo }
  if (!fs.existsSync(p)) return allow;
  const lines = fs.readFileSync(p, "utf8").split("\n");
  lines.forEach((raw, i) => {
    // Allowlist values for `or-true` keys may legitimately contain a
    // trailing `# comment` from the shell line itself, so we ONLY
    // strip whole-line comments (first non-space char is `#`). To
    // comment near an entry, put the `#` on its own line above it.
    const stripped = raw.replace(/\r$/, "");
    if (/^\s*#/.test(stripped)) return;
    const line = stripped.trim();
    if (!line) return;
    const parts = line.split(":");
    if (parts.length < 3) return;
    allow.set(line, { hit: false, lineNo: i + 1 });
  });
  return allow;
}

// Strip leading whitespace and a single optional YAML-list `- ` prefix.
// A "comment line" is a YAML/shell comment (first non-space char is `#`).
function isCommentLine(line) {
  const stripped = line.replace(/^\s+/, "");
  return stripped.startsWith("#");
}

// Find every shell line that masks a non-zero exit with `|| true` (or
// `|| /bin/true`). We do a substring scan because these calls live
// inside `run: |` script blocks; a real YAML parse is overkill and
// would require pulling in a dependency.
//
// Skip: comment lines (whole-line `#…`). We do NOT skip `|| true`
// that appears INSIDE a string literal — those are exceedingly rare
// in workflow files and a false positive there is harmless (just add
// it to the allowlist with a comment).
function findOrTrueViolations(text, basename, allow) {
  const out = [];
  const re = /\|\|\s*\/?(?:bin\/)?true\b/;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!re.test(line)) continue;
    if (isCommentLine(line)) continue;
    const trimmed = line.trim();
    const allowKey = `${basename}:or-true:${trimmed}`;
    if (allow.has(allowKey)) {
      allow.get(allowKey).hit = true;
      continue;
    }
    out.push({
      line: i + 1,
      lineText: trimmed,
      reason: `shell line masks non-zero exit with \`|| true\` and the failure is never re-checked`,
      hint:
        `if the failure is genuinely best-effort (log tailing, cleanup, ` +
        `idempotent setup), allowlist this exact line in ` +
        `${path.relative(REPO_ROOT, ALLOWLIST_PATH)} with a comment ` +
        `explaining why; otherwise drop the \`|| true\` and let the step fail.`,
      allowKey,
    });
  }
  return out;
}

// Parse step blocks just enough to map every `continue-on-error: true`
// to the step's `id:` (or `name:`) and determine whether any later
// step references `steps.<id>.outcome|conclusion`.
//
// We use a tiny indentation-aware scan:
//   - A "step start" is a line matching `^\s*-\s+(name|id|uses|run):`.
//     We track the indentation of the leading `-` to delimit the step.
//   - Within a step block we collect `id:` and `name:` and look for
//     `continue-on-error: true`.
function findContinueOnErrorViolations(text, basename, allow) {
  const out = [];
  const lines = text.split("\n");
  // First pass: collect every `steps.<id>.outcome|conclusion` reference
  // anywhere in the file.
  const referenced = new Set();
  const refRe = /\bsteps\.([A-Za-z0-9_-]+)\.(outcome|conclusion)\b/g;
  let m;
  while ((m = refRe.exec(text)) !== null) referenced.add(m[1]);

  // Second pass: walk steps.
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const stepStart = line.match(/^(\s*)-\s+(name|id|uses|run|with|env|shell|if|continue-on-error|working-directory|timeout-minutes):/);
    if (!stepStart) { i++; continue; }
    const dashIndent = stepStart[1].length; // indent before the `-`
    // Collect the step's lines: the first line (already at i) plus
    // every subsequent line whose indent is greater than dashIndent
    // (i.e. continuation of this list item) until we hit another
    // sibling list item or a less-indented line.
    const stepLines = [{ idx: i, text: line }];
    let j = i + 1;
    while (j < lines.length) {
      const l = lines[j];
      if (/^\s*$/.test(l)) { stepLines.push({ idx: j, text: l }); j++; continue; }
      const m2 = l.match(/^(\s*)\S/);
      if (!m2) { j++; continue; }
      const indent = m2[1].length;
      if (indent <= dashIndent) break; // sibling step or job-level key
      stepLines.push({ idx: j, text: l });
      j++;
    }

    // Inspect this step block.
    let stepId = null;
    let stepName = null;
    let coeLineNo = null;
    let coeRaw = null;
    for (const sl of stepLines) {
      const t = sl.text;
      const idM = t.match(/^\s*(?:-\s+)?id:\s*['"]?([^'"\s#]+)['"]?\s*$/);
      if (idM) stepId = idM[1];
      const nameM = t.match(/^\s*(?:-\s+)?name:\s*(.+?)\s*$/);
      if (nameM && stepName === null) {
        stepName = nameM[1].replace(/^['"]|['"]$/g, "");
      }
      const coeM = t.match(/^\s*continue-on-error:\s*true\s*$/);
      if (coeM) {
        coeLineNo = sl.idx + 1;
        coeRaw = t.trim();
      }
    }

    if (coeLineNo !== null) {
      const checked = stepId !== null && referenced.has(stepId);
      if (!checked) {
        const key = stepId || stepName || `line:${coeLineNo}`;
        const allowKey = `${basename}:continue-on-error:${key}`;
        if (allow.has(allowKey)) {
          allow.get(allowKey).hit = true;
        } else {
          const reason = stepId === null
            ? `\`continue-on-error: true\` on a step with no \`id:\` — its outcome cannot be checked`
            : `\`continue-on-error: true\` on step \`${stepId}\`, but no later step reads \`steps.${stepId}.outcome\` (or \`.conclusion\`)`;
          out.push({
            line: coeLineNo,
            lineText: coeRaw,
            reason,
            hint:
              `either drop \`continue-on-error: true\` and let the step fail, ` +
              `or add a follow-up step that gates on \`steps.<id>.outcome == 'failure'\`. ` +
              `If the failure is checked indirectly (e.g. by a later step inspecting an output file), ` +
              `allowlist as \`${allowKey}\` in ${path.relative(REPO_ROOT, ALLOWLIST_PATH)} with a comment.`,
            allowKey,
          });
        }
      }
    }

    i = j;
  }
  return out;
}

function main() {
  const wfFiles = listWorkflowFiles(WORKFLOWS_DIR);
  if (wfFiles.length === 0) {
    console.error(`ERROR: no workflow files under ${WORKFLOWS_DIR}`);
    process.exit(2);
  }
  const allow = readAllowlist(ALLOWLIST_PATH);
  const violations = [];
  let totalLines = 0;
  for (const file of wfFiles) {
    const basename = path.basename(file);
    const text = fs.readFileSync(file, "utf8");
    totalLines += text.split("\n").length;
    for (const v of findOrTrueViolations(text, basename, allow)) {
      violations.push({ file, ...v });
    }
    for (const v of findContinueOnErrorViolations(text, basename, allow)) {
      violations.push({ file, ...v });
    }
  }
  const stale = [];
  for (const [key, v] of allow.entries()) {
    if (!v.hit) stale.push({ key, lineNo: v.lineNo });
  }

  if (violations.length > 0 || stale.length > 0) {
    if (violations.length > 0) {
      console.error(
        `\n✗ check:workflow-silent-failures — ${violations.length} violation(s) ` +
          `across ${wfFiles.length} workflow file(s):\n`,
      );
      for (const v of violations) {
        const rel = path.relative(REPO_ROOT, v.file);
        console.error(`  • ${rel}:${v.line}`);
        console.error(`      ${v.lineText}`);
        console.error(`      ${v.reason}`);
        console.error(`      ${v.hint}`);
      }
    }
    if (stale.length > 0) {
      console.error(
        `\n✗ check:workflow-silent-failures — ${stale.length} stale allowlist entry/entries in ${path.relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
      );
      for (const s of stale) {
        console.error(`  • line ${s.lineNo}: "${s.key}" no longer matches any workflow line — remove it.`);
      }
    }
    console.error(
      `\nWhy: Task #404 — \`audit-runtime.yml\` wrapped a wrong-package ` +
        `\`pnpm --filter\` call in \`|| true\`, hiding the failure for weeks. ` +
        `This guard catches the broader silent-failure family.`,
    );
    process.exit(1);
  }

  console.log(
    `✓ check:workflow-silent-failures — ${wfFiles.length} workflow file(s), ` +
      `${totalLines} line(s) scanned, no unchecked \`|| true\` or ` +
      `\`continue-on-error: true\` (${allow.size} allowlisted entry/entries hit).`,
  );
}

main();
