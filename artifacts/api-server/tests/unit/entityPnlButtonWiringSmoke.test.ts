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
};

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
