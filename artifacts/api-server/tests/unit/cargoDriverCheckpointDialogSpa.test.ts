import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-03 — driver-side SPA dialog for cargo checkpoints.
 *
 * Backend (#2056) landed POST/GET /me/cargo/:id/checkpoint(s) + the
 * cargo_manifest_checkpoints table (migration 305) but had no driver
 * UI hook. The audit flagged it as TA-GAP-02 / A-04 uncloseable from
 * the cab. This PR mounts the dialog inside me-driver.tsx, gated by
 * the same 7 driver-controlled states the backend enforces.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SPA_SRC = join(REPO_ROOT, "artifacts/ghayth-erp/src");
const DIALOG = readFileSync(join(SPA_SRC, "components/shared/cargo-checkpoint-dialog.tsx"), "utf8");
const PAGE   = readFileSync(join(SPA_SRC, "pages/fleet/me-driver.tsx"), "utf8");

describe("#2079 TA-T18-03 SPA — dialog file exists at the canonical path", () => {
  it("ships under components/shared so any cargo-detail view can re-use it", () => {
    expect(existsSync(join(SPA_SRC, "components/shared/cargo-checkpoint-dialog.tsx"))).toBe(true);
  });
});

describe("#2079 TA-T18-03 SPA — dialog targets the driver-self surface", () => {
  it("POSTs to /fleet/me/cargo/:id/checkpoint (driver-self)", () => {
    expect(DIALOG).toMatch(/`\/fleet\/me\/cargo\/\$\{manifestId\}\/checkpoint`/);
    expect(DIALOG).toMatch(/method: "POST"/);
  });

  it("lazy-fetches GET /me/cargo/:id/checkpoints only when the dialog is open", () => {
    expect(DIALOG).toMatch(/open \? `\/fleet\/me\/cargo\/\$\{manifestId\}\/checkpoints` : null/);
    expect(DIALOG).toMatch(/enabled: open/);
  });

  it("never calls the dispatcher /cargo/manifests/:id/checkpoints endpoint", () => {
    expect(DIALOG).not.toMatch(/\/cargo\/manifests\//);
  });
});

describe("#2079 TA-T18-03 SPA — vocabulary matches the SQL CHECK", () => {
  it("declares all 10 bounded types — same set as cargo_manifest_checkpoints_type_check", () => {
    for (const t of [
      "loading_start", "loading_complete",
      "weighing", "rest_break", "inspection",
      "customs", "fueling",
      "unloading_start", "unloading_complete",
      "other",
    ]) {
      expect(DIALOG, `type ${t} missing from CHECKPOINT_OPTIONS`).toContain(`"${t}"`);
    }
  });

  it("each quantitative type carries its measuredUnit (kg / min / L / units)", () => {
    expect(DIALOG).toMatch(/type: "weighing"[\s\S]{0,200}unit: "kg"/);
    expect(DIALOG).toMatch(/type: "rest_break"[\s\S]{0,200}unit: "min"/);
    expect(DIALOG).toMatch(/type: "fueling"[\s\S]{0,200}unit: "L"/);
    expect(DIALOG).toMatch(/type: "unloading_start"[\s\S]{0,200}unit: "units"/);
  });

  it("emits measuredUnit ONLY when a measured value is provided (avoid stamping orphan units)", () => {
    expect(DIALOG).toMatch(/measuredUnit:\s+measured && option\.unit \? option\.unit : undefined/);
  });
});

describe("#2079 TA-T18-03 SPA — GPS capture is opt-in + degrades gracefully", () => {
  it("uses navigator.geolocation.getCurrentPosition with enableHighAccuracy + 8s timeout", () => {
    expect(DIALOG).toMatch(/navigator\.geolocation\.getCurrentPosition/);
    expect(DIALOG).toMatch(/enableHighAccuracy: true/);
    expect(DIALOG).toMatch(/timeout: 8_000/);
  });

  it("shows a destructive toast (not a crash) when geolocation is unavailable", () => {
    expect(DIALOG).toMatch(/if \(!navigator\.geolocation\)[\s\S]{0,200}variant: "destructive"/);
  });
});

describe("#2079 TA-T18-03 SPA — me-driver.tsx wiring", () => {
  it("imports CargoCheckpointDialog from the canonical path", () => {
    expect(PAGE).toMatch(/import \{ CargoCheckpointDialog \} from "@\/components\/shared\/cargo-checkpoint-dialog"/);
  });

  it("declares CARGO_CHECKPOINT_OPEN with the seven driver-controlled states", () => {
    expect(PAGE).toMatch(/CARGO_CHECKPOINT_OPEN: ReadonlySet<string> = new Set\(\[/);
    for (const s of [
      "driver_accepted", "trip_started", "arrived_pickup",
      "loaded", "in_transit", "arrived_delivery", "delivered",
    ]) {
      expect(PAGE, `state ${s} missing from open-set`).toContain(`"${s}"`);
    }
  });

  it("renders the dialog inside the cargo card with the gated disabled prop", () => {
    expect(PAGE).toMatch(/<CargoCheckpointDialog[\s\S]{0,400}manifestId=\{m\.id\}/);
    expect(PAGE).toMatch(/<CargoCheckpointDialog[\s\S]{0,500}disabled=\{!CARGO_CHECKPOINT_OPEN\.has\(m\.status\)\}/);
  });

  it("dialog mount does NOT replace the 7-state advance buttons — both coexist", () => {
    expect(PAGE).toMatch(/cargoAdvance\(m\.id, "driver_accepted"\)/);
    expect(PAGE).toMatch(/cargoAdvance\(m\.id, "delivered"\)/);
  });
});

describe("#2079 TA-T18-03 SPA — finance-blackout boundary intact", () => {
  it("dialog never reads or POSTs price/cost/revenue/invoice/amount", () => {
    expect(DIALOG).not.toMatch(/price|cost|revenue|invoice|amount/i);
  });

  it("me-driver.tsx introduces no JE-adjacent call", () => {
    expect(PAGE).not.toMatch(/journal|gl|ledger/i);
  });
});
