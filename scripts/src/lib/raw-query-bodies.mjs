//
// scripts/src/lib/raw-query-bodies.mjs
//
// Canonical `rawQuery(`…`)` template-literal body extractor shared by
// the SQL-scanning guards (ghost-rows, schema-drift, sql-ambiguity via
// ghost-rows, and audit-schema-drift). Centralised because three
// independent copies had silently drifted: each used a slightly
// different `rawQuery(` matcher, and a too-narrow one silently skips
// call sites instead of failing loudly.
//
// THE BUG THIS PREVENTS — silent typed-call skip:
//   A naive pattern `rawQuery\s*\(` (no generic handling) skips every
//   `rawQuery<RowType>(`…`)` call. A one-level pattern
//   `rawQuery\s*(?:<[^>]*>)?\s*\(` still skips NESTED generics like
//   `rawQuery<Record<string, unknown>>(`…`)` — `[^>]*` stops at the
//   first `>`. The failure is silent: the body is never extracted, so
//   the guard reports a clean 0-finding run while the real
//   ghost-row / drift / ambiguity goes unscanned.
//
// THE FIX — `[^(]*` swallows the entire type-argument payload (generics
// contain no `(`) and the trailing `>` is matched by backtracking, so
// arbitrarily-nested generics are tolerated. Keep this regex and the
// per-scanner copies in `check-scoped-where-ambiguity.mjs` in sync; any
// guard that locates rawQuery bodies by regex MUST tolerate nested
// inline generics.
//
export const RAW_QUERY_OPEN_RE = /rawQuery\b\s*(?:<[^(]*>)?\s*\(\s*`/g;

// Pull every rawQuery(`…`) template-literal body out of a source file
// TOGETHER WITH the source offset where each body begins (the index of
// the first character after the opening backtick). Preserves `${…}`
// interpolations as literal text (with balanced-brace nesting) so the
// per-statement scanners can detect and skip them. Multi-line and
// escaped content is handled.
//
// The offset is what check-scoped-where-ambiguity needs to resolve a
// `${where}` hole against the NEAREST PRECEDING producer assignment, so
// it consumes this variant directly instead of carrying a private copy
// of the (generic-tolerant) extraction loop — see
// `extractRawQueryBodies` for the body-only shape every other guard uses.
export function extractRawQueryBodiesWithOffsets(source) {
  const results = [];
  // Fresh regex object so callers can't share lastIndex state.
  const re = new RegExp(RAW_QUERY_OPEN_RE.source, "g");
  let match;
  while ((match = re.exec(source)) !== null) {
    let i = match.index + match[0].length;
    const index = i; // first body char, just past the opening backtick
    let depth = 0; // depth of ${...} interpolations
    let body = "";
    while (i < source.length) {
      const ch = source[i];
      if (ch === "\\" && i + 1 < source.length) {
        body += source[i] + source[i + 1];
        i += 2;
        continue;
      }
      if (ch === "$" && source[i + 1] === "{") {
        depth++;
        body += "${";
        i += 2;
        continue;
      }
      if (ch === "}" && depth > 0) {
        depth--;
        body += "}";
        i++;
        continue;
      }
      if (ch === "`" && depth === 0) break;
      body += ch;
      i++;
    }
    results.push({ body, index });
  }
  return results;
}

// Pull every rawQuery(`…`) template-literal body out of a source file,
// preserving `${…}` interpolations as literal text (with balanced-brace
// nesting) so the per-statement scanners can detect and skip them.
// Multi-line and escaped content is handled. Thin wrapper over
// `extractRawQueryBodiesWithOffsets` so the extraction loop (and its
// nested-generic tolerance) lives in exactly one place.
export function extractRawQueryBodies(source) {
  return extractRawQueryBodiesWithOffsets(source).map((r) => r.body);
}

// Replace every `${…}` interpolation in a template-literal body with a
// neutral placeholder, tolerating BALANCED, ARBITRARILY-NESTED braces.
//
// THE BUG THIS PREVENTS — silent partial-strip:
//   A one-level regex `/\$\{[^}]*\}/g` stops `[^}]*` at the FIRST `}`,
//   so a nested interpolation like `${ cond ? `${x}` : '' }` is only
//   PARTIALLY blanked. The leftover SQL-looking tail (`}` plus whatever
//   trailed it) can produce a false finding, or — worse — a real
//   identifier/column drift can slip through unscanned. Like the
//   typed-rawQuery skip this is silent: a clean run can really mean
//   "the stripper choked on the braces", not "nothing is wrong".
//
// THE FIX — walk the body counting `{`/`}` depth so the whole balanced
// `${…}` span (however deeply nested) collapses to one placeholder. This
// is the SINGLE shared depth-aware walker for all SQL guards: the
// ambiguity scanners (check-sql-ambiguity, check-scoped-where-ambiguity)
// route their interpolation stripping through here so a future fix to the
// brace-walking can't be applied to one copy and forgotten in the others.
//
// `replacement` is caller-configurable so the schema-drift scanners keep
// their historical `" ? "` token. It may be either:
//   - a string: every `${…}` span collapses to that literal token; or
//   - a function `(inner) => string`: it receives the interpolation's
//     inner text (the content between `${` and its matching `}`) and
//     returns the replacement, so a caller can vary the token per hole
//     (e.g. check-scoped-where-ambiguity tags scope-where holes).
export function stripInterpolations(body, replacement = " ? ") {
  const replaceFn =
    typeof replacement === "function" ? replacement : () => replacement;
  let out = "";
  let i = 0;
  while (i < body.length) {
    if (body[i] === "$" && body[i + 1] === "{") {
      let depth = 0;
      let j = i;
      for (; j < body.length; j++) {
        if (body[j] === "{") depth++;
        else if (body[j] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      out += replaceFn(body.slice(i + 2, j));
      i = j + 1;
    } else {
      out += body[i];
      i++;
    }
  }
  return out;
}
