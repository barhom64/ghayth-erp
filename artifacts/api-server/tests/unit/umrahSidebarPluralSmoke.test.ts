import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-18-P2 — sidebar plural unification.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-18 audit §3.2 +
 * UMRAH_CANONICAL_GLOSSARY.md plural rule):
 *   - Standalone sidebar labels switch from accusative to nominative
 *     plural:
 *       المعتمرين       → المعتمرون
 *       الوكلاء الرئيسيين → الوكلاء الرئيسيون
 *       الوكلاء الفرعيين  → الوكلاء الفرعيون
 *   - Object-position phrases ("حركات المعتمرين", "كشف المعتمرين")
 *     keep the accusative form per the glossary rule.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No API contract change. ❌ No route rename.
 *   - No FE behaviour change beyond the literal labels.
 *   - No glossary edit — the canonical glossary is the source.
 *
 * Failure modes pinned:
 *   - Sidebar regressed back to the accusative form → §A fails.
 *   - The phrase-context labels were accidentally rewritten →
 *     §B fails (would break the glossary's bilateral rule).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const NAV = readFileSync(
  join(
    REPO_ROOT,
    "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts",
  ),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Sidebar standalone labels are nominative
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P2 §A — sidebar standalone labels use the nominative plural", () => {
  it("/umrah/pilgrims label = 'المعتمرون'", () => {
    expect(NAV).toMatch(
      /label:\s*["']المعتمرون["'],\s*path:\s*["']\/umrah\/pilgrims["']/,
    );
  });

  it("/umrah/agents label = 'الوكلاء الرئيسيون'", () => {
    expect(NAV).toMatch(
      /label:\s*["']الوكلاء الرئيسيون["'],\s*path:\s*["']\/umrah\/agents["']/,
    );
  });

  it("/umrah/sub-agents label = 'الوكلاء الفرعيون'", () => {
    expect(NAV).toMatch(
      /label:\s*["']الوكلاء الفرعيون["'],\s*path:\s*["']\/umrah\/sub-agents["']/,
    );
  });

  it("no regression: /umrah/pilgrims is NOT labelled with the accusative 'المعتمرين'", () => {
    expect(NAV).not.toMatch(
      /label:\s*["']المعتمرين["'],\s*path:\s*["']\/umrah\/pilgrims["']/,
    );
  });

  it("no regression: /umrah/agents is NOT labelled with the accusative 'الوكلاء الرئيسيين'", () => {
    expect(NAV).not.toMatch(
      /label:\s*["']الوكلاء الرئيسيين["'],\s*path:\s*["']\/umrah\/agents["']/,
    );
  });

  it("no regression: /umrah/sub-agents is NOT labelled with the accusative 'الوكلاء الفرعيين'", () => {
    expect(NAV).not.toMatch(
      /label:\s*["']الوكلاء الفرعيين["'],\s*path:\s*["']\/umrah\/sub-agents["']/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Phrase-context labels keep the accusative form
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P2 §B — phrase-context labels keep the accusative form per the glossary rule", () => {
  it("'حركات المعتمرين' kept as-is (head noun + accusative phrase)", () => {
    expect(NAV).toMatch(/حركات المعتمرين/);
    // The NOMINATIVE form would be wrong here — pin it OUT.
    expect(NAV).not.toMatch(/حركات المعتمرون/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Other standalone labels unchanged (no over-broad replacement)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-18-P2 §C — non-target labels were not silently rewritten", () => {
  it("'المعتمرون المعفون' (already nominative, distinct entry) preserved", () => {
    expect(NAV).toMatch(/المعتمرون المعفون/);
  });

  it("'إدارة العمرة' parent label unchanged", () => {
    expect(NAV).toMatch(
      /label:\s*["']إدارة العمرة["']/,
    );
  });
});
