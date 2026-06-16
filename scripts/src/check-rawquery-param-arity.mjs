#!/usr/bin/env node
// scripts/src/check-rawquery-param-arity.mjs
//
// Guard: every parameterized SQL call must bind exactly as many values as the
// statement has placeholders. Postgres rejects a Bind whose value count does
// not equal the number of `$N` placeholders the statement was parsed with:
//
//     08P01  bind message supplies 3 parameters, but prepared statement
//            "" requires 2
//
// This is a hard 500 at runtime, invisible to typecheck/lint, and it is exactly
// the class that took down `GET /api/umrah/calendar/events` (the `overstay`
// layer): a query that referenced only `$1,$2` was handed the shared 3-element
// `baseParams` array, so the default (no-seasonId) calendar view 500'd on every
// request while the other layers — which all referenced `$3` via
// `BETWEEN $2 AND $3` — were fine.
//
// Two sound, low-false-positive rules (both reflect a real Postgres invariant,
// not a style preference):
//
//   RULE A — literal array arity. A call of the form
//        rawQuery(`... $1 ... $2 ...`, [a, b])
//     whose params argument is a *statically-sized array literal* must supply
//     exactly `max($N)` elements. A literal `[a,b,c]` (3) against a `$1,$2`
//     statement (max 2) is an unconditional 08P01. (Skipped when the SQL string
//     contains a `${...}` interpolation that could add higher placeholders, or
//     when the array uses a spread `...x` whose length is not statically known.)
//
//   RULE B — under-bound shared array. When an array is declared in the handler
//     with a literal initializer — `const baseParams = [companyId, from, to]`
//     (guaranteed minimum length 3) — any query that passes that identifier but
//     references a `max($N)` BELOW that minimum length over-binds: Postgres is
//     handed >=3 values for a statement with only 2 placeholders → 08P01. This
//     is exactly the overstay bug (baseParams min-length 3, overstay query
//     references only `$2`). Conditional `.push()` calls only GROW the array, so
//     the literal length is a sound lower bound; an incrementally-built
//     `let params = []` (min length 0) is never flagged, because no `$N` can be
//     below 0 — eliminating the false-positive class where a count/total query
//     shares an empty-initialized, push-grown `params` with a filtered sibling.
//     We never flag `max($N) > minLen`: pushes may have grown the array to
//     exactly that, so it is not provably wrong.
//
//   RULE C — placeholder gap. Postgres parses a statement's parameter count
//     from the HIGHEST `$N` referenced and then requires a resolvable data type
//     for EVERY `$1..$max`. An unreferenced placeholder inside that range — a
//     "gap", whether LEADING (`$1` unused while `$2,$3` are) or MIDDLE (`$3`
//     unused while `$1,$2,$4` are) — has no usage from which to infer its type:
//
//         42P18  could not determine data type of parameter $1
//
//     This is independent of how many values are bound, so it is a pure
//     property of the SQL string (verified empirically against live Postgres
//     for both leading and middle gaps). It is the silent twin of the arity
//     bug: the offending child queries here were all wrapped in
//     `.catch(() => [])`, so the 42P18 was swallowed and the owning UI section
//     (employee «العهد»/«المسميات»/scores/signals, client active-contracts,
//     printed Umrah manifests) just rendered permanently EMPTY. Skipped for
//     interpolated SQL, where a `${...}` clause may supply the missing `$i`.
//
// Scan scope: artifacts/api-server/src/{routes,lib}/**/*.ts (recursive) — the
// arity/gap invariants are Postgres facts that hold for SQL built in lib
// helpers (print loaders, engines) just as much as in route handlers. Route
// handlers are delimited by `router.<verb>(` so an identifier named `params` in
// one handler is never grouped with a `params` in another; a lib file with no
// `router.` calls is analyzed as a single module-scope segment.
//
// Allowlist: scripts/rawquery-param-arity-allowlist.txt — one
// `file::handlerIndex::identifier::maxN` (or `file::LITERAL::lineHint`) key per
// pre-existing finding, so the guard blocks NEW violations without forcing a
// historical cleanup. Lines starting with `#` are comments.
//
// Exit codes: 0 = clean, 1 = arity violation(s), 2 = scan failed.
//
// KNOWN BLIND SPOTS (accepted — soundness over coverage):
//   * Fully interpolated SQL whose placeholders all live inside `${...}` is not
//     arity-checked for RULE A/C (we cannot statically count `$N` we cannot
//     see). RULE B still catches an under-bound shared array in that case.
//   * A params argument passed as a bare identifier whose initializer is NOT a
//     statically-sized literal (e.g. built by a helper / `.map()` / `.concat()`)
//     has no known minimum length, so RULE B does not fire. RULE A still
//     applies to inline literals. These are deliberate to keep false positives
//     at zero; a missed dynamic case is still caught at runtime by the gap-aware
//     `.catch()` audit, not by this static gate.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIRS = [
  "artifacts/api-server/src/routes",
  "artifacts/api-server/src/lib",
];
const ALLOWLIST = "scripts/rawquery-param-arity-allowlist.txt";

// Query-builder call names whose first arg is a SQL string and whose second arg
// is the bound-params array.
const QUERY_FNS = ["rawQuery", "rawExecute", "pool.query", "client.query", "db.query"];

// ---------------------------------------------------------------------------
// Low-level scanning helpers (exported for unit tests).
// ---------------------------------------------------------------------------

// Walk `src` from the index of an opening `(` and return the substring of the
// balanced argument list (exclusive of the outer parens), respecting nested
// (), [], {}, single/double/backtick strings, and `${...}` template
// interpolations (which may themselves contain any of the above). Returns null
// if the parens never balance.
export function readBalancedArgs(src, openParenIdx) {
  let depth = 0;
  let i = openParenIdx;
  const n = src.length;
  // String/template state stack: each entry is the closing delimiter we await.
  const stack = [];
  const top = () => stack[stack.length - 1];
  for (; i < n; i++) {
    const ch = src[i];
    const cur = top();
    if (cur === "'" || cur === '"') {
      if (ch === "\\") { i++; continue; }
      if (ch === cur) stack.pop();
      continue;
    }
    if (cur === "`") {
      if (ch === "\\") { i++; continue; }
      if (ch === "`") { stack.pop(); continue; }
      if (ch === "$" && src[i + 1] === "{") { stack.push("}"); i++; continue; }
      continue;
    }
    // Inside a `${ ... }` interpolation or normal code: handle nesting.
    if (ch === "'" || ch === '"' || ch === "`") { stack.push(ch); continue; }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; continue; }
    if (ch === ")" || ch === "]" || ch === "}") {
      // A `}` that closes a `${...}` interpolation is handled by the "`" branch
      // above via the "}" sentinel; here we only see structural brackets.
      if (cur === "}" && ch === "}") { stack.pop(); continue; }
      depth--;
      if (depth === 0) {
        return src.slice(openParenIdx + 1, i);
      }
      continue;
    }
  }
  return null;
}

// Split a balanced argument list on top-level commas (commas not nested inside
// (), [], {}, or any string/template). Returns trimmed argument strings.
export function splitTopLevelArgs(argStr) {
  const args = [];
  let depth = 0;
  let start = 0;
  const stack = [];
  const top = () => stack[stack.length - 1];
  for (let i = 0; i < argStr.length; i++) {
    const ch = argStr[i];
    const cur = top();
    if (cur === "'" || cur === '"') {
      if (ch === "\\") { i++; continue; }
      if (ch === cur) stack.pop();
      continue;
    }
    if (cur === "`") {
      if (ch === "\\") { i++; continue; }
      if (ch === "`") { stack.pop(); continue; }
      if (ch === "$" && argStr[i + 1] === "{") { stack.push("}"); i++; continue; }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { stack.push(ch); continue; }
    if (ch === "(" || ch === "[" || ch === "{") { depth++; continue; }
    if (ch === ")" || ch === "]" || ch === "}") {
      if (cur === "}" && ch === "}") { stack.pop(); continue; }
      depth--;
      continue;
    }
    if (ch === "," && depth === 0) {
      args.push(argStr.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = argStr.slice(start).trim();
  if (last.length || args.length) args.push(last);
  return args;
}

// Highest `$N` referenced in a SQL string. Returns 0 if none.
export function maxPlaceholder(sql) {
  let max = 0;
  const re = /\$(\d+)/g;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const n = Number(m[1]);
    if (n > max) max = n;
  }
  return max;
}

// Does the SQL string contain a `${...}` template interpolation? Such a clause
// can append higher placeholders at runtime, so RULE A (exact literal arity)
// is unsafe and is skipped; RULE B still applies because every sibling shares
// the same interpolation offset.
export function hasInterpolation(sql) {
  return /\$\{/.test(sql);
}

// Smallest unreferenced placeholder `$i` within `1..max($N)`, or 0 when the
// run `$1..$max` is contiguous (or there are no placeholders). Postgres needs a
// resolvable type for EVERY placeholder up to the max it parsed, so any gap —
// leading (`$1` unused) or middle (`$3` unused) — is a 42P18 at runtime. Pure
// function of the SQL string; callers skip interpolated SQL (a `${...}` clause
// may inject the missing `$i`).
export function placeholderGap(sql) {
  const max = maxPlaceholder(sql);
  if (max === 0) return 0;
  const seen = new Set();
  const re = /\$(\d+)/g;
  let m;
  while ((m = re.exec(sql)) !== null) seen.add(Number(m[1]));
  for (let i = 1; i <= max; i++) if (!seen.has(i)) return i;
  return 0;
}

// Remove `// line` and `/* block */` comments that appear OUTSIDE of string /
// template literals, preserving everything inside them. Needed before counting
// array elements: a comment such as `// computed from the input line, not the
// pin` contains a comma that `splitTopLevelArgs` would otherwise treat as an
// element separator, inflating the count (the false 17-vs-16 reading of
// accountingAllocation.ts). Newlines are preserved so any downstream line math
// stays correct.
export function stripComments(code) {
  let out = "";
  const stack = []; // pending closing delimiters: "'" '"' "`" or "}" (for ${})
  const top = () => stack[stack.length - 1];
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const nx = code[i + 1];
    const cur = top();
    if (cur === "'" || cur === '"') {
      out += ch;
      if (ch === "\\") { out += nx ?? ""; i++; continue; }
      if (ch === cur) stack.pop();
      continue;
    }
    if (cur === "`") {
      out += ch;
      if (ch === "\\") { out += nx ?? ""; i++; continue; }
      if (ch === "`") { stack.pop(); continue; }
      if (ch === "$" && nx === "{") { out += nx; i++; stack.push("}"); continue; }
      continue;
    }
    // Code region (top of stack is undefined or a "}" sentinel for `${...}`).
    if (ch === "/" && nx === "/") {
      while (i < code.length && code[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (ch === "/" && nx === "*") {
      i += 2;
      while (i < code.length && !(code[i] === "*" && code[i + 1] === "/")) i++;
      i++; // skip the closing "/"
      out += " ";
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") { stack.push(ch); out += ch; continue; }
    if (cur === "}" && ch === "}") { stack.pop(); out += ch; continue; }
    out += ch;
  }
  return out;
}

// Count elements of a statically-sized array literal like "[a, b, c]".
// Returns null when not a plain array literal or when it contains a spread
// (`...x`) whose contribution is not statically known.
export function literalArrayLength(arg) {
  const t = arg.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return null;
  const inner = stripComments(t.slice(1, -1)).trim();
  if (inner === "") return 0;
  const parts = splitTopLevelArgs(inner).filter((p) => p.length > 0);
  if (parts.some((p) => p.startsWith("..."))) return null;
  return parts.length;
}

const IDENT_RE = /^[A-Za-z_$][\w$]*$/;

// Extract the SQL literal from a first-arg expression. Handles a bare template
// literal `` `...` `` and a plain quoted string. Returns null otherwise (e.g. a
// variable holding the SQL — not statically analyzable).
export function extractSqlLiteral(arg) {
  const t = arg.trim();
  if (t.startsWith("`") && t.endsWith("`")) return t.slice(1, -1);
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-file analysis.
// ---------------------------------------------------------------------------

// Split a route-file source into handler segments delimited by `router.<verb>(`.
// Each segment is { index, start, text }. Code before the first handler becomes
// segment 0 (module scope), which is fine — identifiers there are still scoped
// away from per-handler ones.
export function splitHandlers(src) {
  const re = /router\.(get|post|put|patch|delete|use|all)\s*\(/g;
  const starts = [];
  let m;
  while ((m = re.exec(src)) !== null) starts.push(m.index);
  if (starts.length === 0) return [{ index: 0, start: 0, text: src }];
  const segs = [];
  if (starts[0] > 0) segs.push({ index: 0, start: 0, text: src.slice(0, starts[0]) });
  for (let k = 0; k < starts.length; k++) {
    const start = starts[k];
    const end = k + 1 < starts.length ? starts[k + 1] : src.length;
    segs.push({ index: segs.length, start, text: src.slice(start, end) });
  }
  return segs;
}

// Find every query call in a chunk of source. Returns
// { fn, sql, sqlLiteral, paramsArg, callOffset }.
export function findQueryCalls(text) {
  const calls = [];
  for (const fn of QUERY_FNS) {
    let from = 0;
    while (true) {
      const idx = text.indexOf(fn, from);
      if (idx === -1) break;
      from = idx + fn.length;
      // Char before must not be part of a longer identifier (avoid `myRawQuery`).
      const before = text[idx - 1];
      if (before && /[\w$.]/.test(before) && !fn.includes(".")) continue;
      // Allow an optional generic `<...>` then `(`.
      let j = idx + fn.length;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === "<") {
        let d = 0;
        for (; j < text.length; j++) {
          if (text[j] === "<") d++;
          else if (text[j] === ">") { d--; if (d === 0) { j++; break; } }
        }
        while (j < text.length && /\s/.test(text[j])) j++;
      }
      if (text[j] !== "(") continue;
      const argStr = readBalancedArgs(text, j);
      if (argStr == null) continue;
      const args = splitTopLevelArgs(argStr);
      if (args.length < 2) continue;
      const sqlLiteral = extractSqlLiteral(args[0]);
      if (sqlLiteral == null) continue;
      calls.push({
        fn,
        sqlLiteral,
        paramsArg: args[1].trim(),
        callOffset: idx,
      });
    }
  }
  return calls;
}

// Find array-literal declarations in a chunk of source and return a map of
// identifier -> guaranteed-minimum length (the literal element count). When the
// same name is initialized more than once with a literal, the SMALLEST literal
// length is kept (most conservative lower bound, fewest false positives). Names
// initialized from a non-literal (`= buildParams()`) are absent from the map,
// so calls passing them are never flagged.
export function findArrayLiteralDecls(text) {
  const mins = new Map();
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*\[/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const ident = m[1];
    const openBracket = re.lastIndex - 1; // index of the `[`
    const inner = readBalancedArgs(text, openBracket);
    if (inner == null) continue;
    const trimmed = stripComments(inner).trim();
    let len;
    if (trimmed === "") len = 0;
    else {
      const parts = splitTopLevelArgs(trimmed).filter((p) => p.length > 0);
      if (parts.some((p) => p.startsWith("..."))) continue; // unknown length
      len = parts.length;
    }
    const prev = mins.get(ident);
    mins.set(ident, prev == null ? len : Math.min(prev, len));
  }
  return mins;
}

// Analyze one file's source. Returns an array of violation objects.
export function analyzeSource(relFile, src) {
  const violations = [];
  const segments = splitHandlers(src);
  for (const seg of segments) {
    const calls = findQueryCalls(seg.text);
    const decls = findArrayLiteralDecls(seg.text);
    // RULE A — inline literal array arity (exact match required).
    for (const c of calls) {
      if (hasInterpolation(c.sqlLiteral)) continue;
      const arrLen = literalArrayLength(c.paramsArg);
      if (arrLen == null) continue;
      const maxN = maxPlaceholder(c.sqlLiteral);
      if (arrLen !== maxN) {
        const line = lineOf(src, seg.start + c.callOffset);
        violations.push({
          file: relFile,
          rule: "A",
          handler: seg.index,
          identifier: "LITERAL",
          maxN,
          arrLen,
          line,
          key: `${relFile}::LITERAL::${line}`,
          msg: `inline params array has ${arrLen} element(s) but SQL references $${maxN} (08P01 bind mismatch)`,
        });
      }
    }
    // RULE B — identifier bound to a literal-initialized array; flag any query
    // whose max($N) is below that array's guaranteed-minimum length.
    //
    // Interpolation handling is the crux of avoiding false positives. The
    // dominant safe idiom builds the WHERE from a `conditions[]` array whose
    // FIRST element already carries `$1` (`["companyId"=$1]`) and is spliced in
    // via `${conditions.join(" AND ")}` — so the literal template itself has NO
    // `$N` (literalMaxN 0) even though the runtime SQL references $1..$k. We
    // must NOT flag those. The overstay bug is the opposite: the base
    // placeholders ($1,$2) live in the LITERAL and an interpolated clause only
    // appends HIGHER ones — so when the SQL is interpolated we require the
    // literal to anchor at least one placeholder (literalMaxN >= 1) before
    // trusting it as the true base arity. Non-interpolated SQL is the whole
    // statement, so literalMaxN is exact (0 included).
    for (const c of calls) {
      if (!IDENT_RE.test(c.paramsArg)) continue;
      const minLen = decls.get(c.paramsArg);
      if (minLen == null || minLen === 0) continue;
      const maxN = maxPlaceholder(c.sqlLiteral);
      if (hasInterpolation(c.sqlLiteral) && maxN < 1) continue;
      if (maxN < minLen) {
        const line = lineOf(src, seg.start + c.callOffset);
        violations.push({
          file: relFile,
          rule: "B",
          handler: seg.index,
          identifier: c.paramsArg,
          maxN,
          minLen,
          line,
          key: `${relFile}::${seg.index}::${c.paramsArg}::${maxN}`,
          msg: `query binds \`${c.paramsArg}\` (>= ${minLen} values) but references only $${maxN} (08P01: over-binds by >= ${minLen - maxN})`,
        });
      }
    }
    // RULE C — placeholder gap. A property of the SQL string alone, so it runs
    // for every static-SQL call regardless of how the params are passed.
    for (const c of calls) {
      if (hasInterpolation(c.sqlLiteral)) continue;
      const gap = placeholderGap(c.sqlLiteral);
      if (gap > 0) {
        const maxN = maxPlaceholder(c.sqlLiteral);
        const line = lineOf(src, seg.start + c.callOffset);
        violations.push({
          file: relFile,
          rule: "C",
          handler: seg.index,
          identifier: "GAP",
          maxN,
          gap,
          line,
          key: `${relFile}::GAP::${line}`,
          msg: `SQL references $${maxN} but never uses $${gap} (42P18: could not determine data type of parameter $${gap})`,
        });
      }
    }
  }
  return violations;
}

function lineOf(src, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

// Recursively collect .ts files under a directory.
export function collectTsFiles(absDir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(absDir, e.name);
    if (e.isDirectory()) out.push(...collectTsFiles(p));
    else if (e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

export function loadAllowlist(absPath) {
  try {
    return new Set(
      fs.readFileSync(absPath, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#")),
    );
  } catch {
    return new Set();
  }
}

// ---------------------------------------------------------------------------
// CLI entry.
// ---------------------------------------------------------------------------

export function runCheck({ repoRoot = REPO_ROOT } = {}) {
  const allow = loadAllowlist(path.join(repoRoot, ALLOWLIST));
  const all = [];
  const seenFiles = new Set();
  for (const dir of SCAN_DIRS) {
    for (const abs of collectTsFiles(path.join(repoRoot, dir))) {
      if (seenFiles.has(abs)) continue; // guard against overlapping SCAN_DIRS
      seenFiles.add(abs);
      const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
      const src = fs.readFileSync(abs, "utf8");
      for (const v of analyzeSource(rel, src)) {
        if (allow.has(v.key)) continue;
        all.push(v);
      }
    }
  }
  return all;
}

function invokedDirectly() {
  return import.meta.url === url.pathToFileURL(process.argv[1] || "").href;
}

if (invokedDirectly()) {
  let violations;
  try {
    violations = runCheck();
  } catch (e) {
    console.error("check:rawquery-param-arity — scan failed:", e?.stack || e);
    process.exit(2);
  }
  if (violations.length === 0) {
    console.log("check:rawquery-param-arity — OK (no SQL param-arity mismatches)");
    process.exit(0);
  }
  console.error(`check:rawquery-param-arity — ${violations.length} param-arity violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [rule ${v.rule}]  ${v.msg}`);
    console.error(`      allowlist key: ${v.key}`);
  }
  console.error(
    "\nA Postgres parameterized statement must be bound with exactly max($N) values.\n" +
    "Fix the query/array, or (only for a vetted pre-existing case) add the printed\n" +
    `key to ${ALLOWLIST}.`,
  );
  process.exit(1);
}
