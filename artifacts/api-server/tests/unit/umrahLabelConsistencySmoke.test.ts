import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-18-P5 — label consistency smoke.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-18 audit §3.5 +
 * UMRAH_CANONICAL_GLOSSARY.md):
 *   - Verifies the canonical glossary still references the API
 *     field names that appear in the codebase.
 *   - Pins the U-18-P2 nominative-plural decision on the sidebar
 *     (a second view on the same invariant the P2 smoke covers,
 *     in case the P2 file ever drifts).
 *   - Catches accidental UI leaks of raw API field names
 *     (`nuskCode`, `nuskAgentNumber`, `nuskGroupNumber`,
 *     `contractRef`) in sidebar / page-title labels.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch / no migration / no API contract change.
 *   - No bulk find-and-replace — the smoke just observes.
 *
 * Failure modes pinned:
 *   - Glossary doc deleted or renamed → §A fails.
 *   - Sidebar standalone plural regressed → §B fails.
 *   - A raw API field name appears as a sidebar label → §C fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const GLOSSARY_PATH = join(
  REPO_ROOT,
  "docs/governance/umrah-inventory-organization-repair/UMRAH_CANONICAL_GLOSSARY.md",
);
const NAV_PATH = join(
  REPO_ROOT,
  "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts",
);

const GLOSSARY = readFileSync(GLOSSARY_PATH, "utf8");
const NAV = readFileSync(NAV_PATH, "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// §A — Glossary is the source of truth + names the canonical terms
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P5 §A — glossary is present and carries the canonical entries", () => {
  it("doc declares Core entities section + every umrah_* table is present", () => {
    expect(GLOSSARY).toMatch(/Core entities/);
    for (const entity of [
      "umrah_pilgrims",
      "umrah_agents",
      "umrah_sub_agents",
      "umrah_seasons",
      "umrah_groups",
      "umrah_packages",
      "umrah_hotels",
    ]) {
      expect(GLOSSARY).toMatch(new RegExp(`\`${entity}\``));
    }
  });

  it("doc declares the Plural forms rule (nominative for standalone labels)", () => {
    expect(GLOSSARY).toMatch(/Plural forms/);
    expect(GLOSSARY).toMatch(/Nominative/);
    expect(GLOSSARY).toMatch(/Accusative/);
  });

  it("doc declares technical jargon that should NOT leak to UI", () => {
    expect(GLOSSARY).toMatch(/Technical jargon/);
    for (const field of [
      "nuskCode",
      "nuskAgentNumber",
      "nuskGroupNumber",
      "contractRef",
    ]) {
      expect(GLOSSARY).toMatch(new RegExp(`\`${field}\``));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Sidebar standalone plural still nominative (cross-check with P2)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P5 §B — sidebar standalone labels use the nominative plural", () => {
  it("/umrah/pilgrims is labelled 'المعتمرون' (nominative)", () => {
    expect(NAV).toMatch(
      /label:\s*["']المعتمرون["'],\s*path:\s*["']\/umrah\/pilgrims["']/,
    );
  });

  it("/umrah/agents is labelled 'الوكلاء الرئيسيون' (nominative)", () => {
    expect(NAV).toMatch(
      /label:\s*["']الوكلاء الرئيسيون["'],\s*path:\s*["']\/umrah\/agents["']/,
    );
  });

  it("/umrah/sub-agents is labelled 'الوكلاء الفرعيون' (nominative)", () => {
    expect(NAV).toMatch(
      /label:\s*["']الوكلاء الفرعيون["'],\s*path:\s*["']\/umrah\/sub-agents["']/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Raw API field names don't leak as sidebar labels
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P5 §C — sidebar labels do not surface raw API field names", () => {
  // Pin out the literal API field names from appearing as a label
  // value. This is a non-trivial regex because the JSX/TS expressions
  // around label: {...} are dynamic on some entries — we only flag
  // the verbatim case `label: "<rawField>"`.
  for (const field of [
    "nuskCode",
    "nuskAgentNumber",
    "nuskGroupNumber",
    "contractRef",
  ]) {
    it(`no entry has label: "${field}"`, () => {
      // String quotes can be either single or double; pinning both.
      expect(NAV).not.toMatch(new RegExp(`label:\\s*["']${field}["']`));
    });
  }
});
