import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the wizard's smart-mapping integration — Phase B of PR #1474.
 * After the file is parsed and the priority cascade (preset → builtin)
 * runs, columns left unmapped trigger a POST to /umrah/import/suggest-
 * mapping. High-confidence suggestions pre-fill the dropdown; the
 * matched dictionary key is shown alongside so the operator can
 * confirm at a glance.
 */
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-wizard.tsx"),
  "utf8",
);

describe("wizard — smart-mapping state + interface", () => {
  it("declares MappingSuggestion type and a state slot for suggestions", () => {
    expect(PAGE).toMatch(/interface MappingSuggestion \{[\s\S]{0,400}target: string;/);
    expect(PAGE).toMatch(/confidence: number;/);
    expect(PAGE).toMatch(/matchedKey: string;/);
    expect(PAGE).toMatch(/source: "exact" \| "fuzzy"/);
    expect(PAGE).toMatch(/const \[mappingSuggestions, setMappingSuggestions\] = useState<Record<string, MappingSuggestion>>\(\{\}\)/);
  });
});

describe("wizard — smart-mapping pass after the cascade", () => {
  it("calls /umrah/import/suggest-mapping with ONLY the unmapped headers (no waste)", () => {
    // Sending mapped headers would be useless work; the engine
    // already covered them. Pin the body shape so a future refactor
    // can't accidentally widen the payload to all headers.
    expect(PAGE).toMatch(/apiFetch\("\/umrah\/import\/suggest-mapping",[\s\S]{1,400}headers: unmappedAfterCascade, fileType/);
  });

  it("only runs when something is unmapped (no round-trip on a fully-known file)", () => {
    expect(PAGE).toMatch(/if \(unmappedAfterCascade\.length > 0\) \{[\s\S]{1,800}apiFetch\("\/umrah\/import\/suggest-mapping"/);
  });

  it("merges suggestions into the cascade output WITHOUT overriding existing mappings", () => {
    // The cascade's preset/builtin matches are higher-trust than
    // any fuzzy guess. Pin the guard `!next[h]` so a future refactor
    // can't accidentally let a low-confidence guess overwrite an
    // operator's saved preset.
    expect(PAGE).toMatch(/if \(s && !next\[h\]\) \{\s*next\[h\] = s\.target/);
  });

  it("decrements unmapped count as suggestions are applied (auto-open panel respects it)", () => {
    // The mapping panel auto-opens when unmapped > 0. After smart-
    // mapping fills some columns, the count drops — if it reaches 0
    // the panel stays closed (zero typing for the operator).
    expect(PAGE).toMatch(/let finalUnmapped = unmappedAfterCascade\.length/);
    expect(PAGE).toMatch(/finalUnmapped--/);
    expect(PAGE).toMatch(/setShowMapping\(finalUnmapped > 0\)/);
  });

  it("swallows endpoint failures silently — manual mapping still works", () => {
    // Smart mapping is best-effort enhancement. A flaky network or a
    // server hiccup must NOT block the operator from completing the
    // import via the manual dropdowns.
    expect(PAGE).toMatch(/try \{[\s\S]{1,1500}apiFetch\("\/umrah\/import\/suggest-mapping"[\s\S]{0,1500}\} catch \{[\s\S]{1,300}\}/);
  });

  it("resets the suggestions state when no headers are unmapped (no stale hints)", () => {
    // If the operator re-picks a file and this one happens to match
    // perfectly, lingering suggestions from the PREVIOUS file would
    // wrongly decorate the new mapping.
    expect(PAGE).toMatch(/} else \{\s*setMappingSuggestions\(\{\}\)/);
  });
});

describe("wizard — suggestion hint rendered under each mapped column", () => {
  it("only shows when the current value MATCHES the suggestion target (no stale hints)", () => {
    // Suggestion text under a column that's been MANUALLY overridden
    // to something else would mislead the operator. The hint must
    // disappear the moment the operator changes the dropdown.
    expect(PAGE).toMatch(/const showHint =\s*suggestion != null && suggestion\.target === value/);
  });

  it("exact match → green '✓ تطابق دقيق' (high-trust visual cue)", () => {
    expect(PAGE).toContain("✓ تطابق دقيق");
    expect(PAGE).toMatch(/source === "exact"\s*\?\s*"text-status-success-foreground"/);
  });

  it("fuzzy match → blue '💡 اقتراح: X (NN%)' (lower-trust, asks confirmation)", () => {
    expect(PAGE).toContain("💡 اقتراح:");
    expect(PAGE).toMatch(/\$\{Math\.round\(suggestion\.confidence \* 100\)\}%/);
    expect(PAGE).toMatch(/"text-status-info-foreground"/);
  });

  it("each hint has a stable data-testid for e2e", () => {
    expect(PAGE).toContain('data-testid={`mapping-suggestion-${h}`}');
  });
});
