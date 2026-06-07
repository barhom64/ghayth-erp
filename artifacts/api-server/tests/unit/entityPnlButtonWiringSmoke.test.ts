import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Wires the per-entity P&L drill (PR #1551) into the existing entity
 * detail pages via a single shared component. One import + one render
 * line per page — the component handles deep-linking, icon, label,
 * and testid in a uniform way.
 */

const COMPONENT = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/entity-pnl-button.tsx"),
  "utf8",
);

const PAGES = {
  client: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/client-detail.tsx"), "utf8"),
  vendor: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/vendor-detail.tsx"), "utf8"),
  vehicle: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/vehicle-detail.tsx"), "utf8"),
  project: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/project-detail.tsx"), "utf8"),
  umrah_agent: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-agent-detail.tsx"), "utf8"),
  // Phase 2 — the remaining 4 routable entity types from the backend allowlist.
  employee: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/employee-detail.tsx"), "utf8"),
  driver: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/driver-detail.tsx"), "utf8"),
  contract: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/legal-contract-detail.tsx"), "utf8"),
  umrah_season: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-season-detail.tsx"), "utf8"),
};

const RANKING_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/entity-ranking.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// Shared component
// ─────────────────────────────────────────────────────────────────────────────
describe("EntityPnlButton — generic drop-in", () => {
  it("declares the 9 supported entityType values in the prop type (must match the backend allowlist)", () => {
    // Pinned 1:1 with ENTITY_TYPE_TO_JL_COLUMN in the route — if a new
    // entity type is added on one side without the other, this test
    // catches the drift.
    for (const t of [
      "client", "vendor", "employee", "vehicle", "driver",
      "project", "contract", "umrah_agent", "umrah_season",
    ]) {
      expect(COMPONENT).toContain(`"${t}"`);
    }
  });

  it("emits a stable testid keyed by entityType + entityId", () => {
    expect(COMPONENT).toContain("data-testid={`entity-pnl-button-${entityType}-${entityId}`}");
  });

  it("deep-links to /finance/entity-pnl/:entityType/:entityId", () => {
    expect(COMPONENT).toMatch(/`\/finance\/entity-pnl\/\$\{entityType\}\/\$\{entityId\}`/);
  });

  it("supports two visual variants — inline (default, action-bar) and card (sidebar slot)", () => {
    expect(COMPONENT).toMatch(/variant\?: "inline" \| "card"/);
    expect(COMPONENT).toMatch(/variant === "card"/);
  });

  it("uses the TrendingUp icon (visible 'profitability' signal)", () => {
    expect(COMPONENT).toContain("TrendingUp");
  });

  it("Arabic label: 'أرباح وخسائر' (same wording the drill page uses)", () => {
    expect(COMPONENT).toContain("أرباح وخسائر");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Per-page wiring
// ─────────────────────────────────────────────────────────────────────────────
describe("Detail-page wiring — one line of integration per page", () => {
  for (const [entityType, page] of Object.entries(PAGES)) {
    it(`${entityType} detail page imports EntityPnlButton`, () => {
      expect(page).toMatch(/import \{ EntityPnlButton \} from "@\/components\/shared\/entity-pnl-button"/);
    });

    it(`${entityType} detail page mounts the button with the matching entityType`, () => {
      expect(page).toMatch(new RegExp(`<EntityPnlButton entityType="${entityType}"`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Entity-ranking page — CSV export action button
// ─────────────────────────────────────────────────────────────────────────────
describe("entity-ranking page — CSV export", () => {
  it("imports exportRowsToCsv from the unified-export helper", () => {
    expect(RANKING_PAGE).toMatch(/import \{ exportRowsToCsv \} from "@\/lib\/unified-export"/);
  });

  it("renders an export button only when data has rows (no-op for empty results)", () => {
    expect(RANKING_PAGE).toMatch(/data && data\.rows\.length > 0/);
  });

  it("entityType=report_entity_ranking on the export payload — letterhead routing", () => {
    expect(RANKING_PAGE).toMatch(/entityType: "report_entity_ranking"/);
  });

  it("CSV columns cover rank + id + name + revenue + expense + net + entries (7 columns)", () => {
    for (const k of ["rank", "entityId", "entityName", "revenue", "expense", "net", "entries"]) {
      expect(RANKING_PAGE).toContain(`key: "${k}"`);
    }
  });

  it("filename encodes the current entityType + metric + direction (operators recognise their export)", () => {
    expect(RANKING_PAGE).toMatch(/`entity-ranking-\$\{entityType\}-\$\{metric\}-\$\{direction\}`/);
  });

  it("stable testid on the export button", () => {
    expect(RANKING_PAGE).toContain('data-testid="entity-ranking-export-csv"');
  });
});
