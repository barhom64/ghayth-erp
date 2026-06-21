import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Photo evidence for driver field reports — accident + breakdown (review gap C).
 * Mirrors fleet_inspection_photos: client uploads to GCS then posts the
 * storageKey metadata. Driver attaches to their OWN open report; supervisors
 * view by scope; manager lists surface a photoCount for discoverability.
 * Static / regex-only.
 */
const repoRoot = join(import.meta.dirname!, "../../../..");
const FLEET = readFileSync(join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"), "utf8");
const MIG = readFileSync(join(repoRoot, "artifacts/api-server/src/migrations/406_fleet_report_photos.sql"), "utf8");

function block(method: string, path: string): string {
  const re = new RegExp(`router\\.${method}\\("${path.replace(/\//g, "\\/")}"[\\s\\S]+?\\n\\}\\);`);
  const m = FLEET.match(re);
  expect(m, `${method.toUpperCase()} ${path} not found`).toBeTruthy();
  return m![0];
}

describe("migration 406 — report photo tables", () => {
  it("creates accident + breakdown photo tables, CASCADE to parent, type CHECK", () => {
    expect(MIG).toMatch(/CREATE TABLE IF NOT EXISTS fleet_accident_photos/);
    expect(MIG).toMatch(/"accidentId"\s+BIGINT\s+NOT NULL REFERENCES fleet_accidents\(id\) ON DELETE CASCADE/);
    expect(MIG).toMatch(/CREATE TABLE IF NOT EXISTS fleet_breakdown_photos/);
    expect(MIG).toMatch(/"breakdownId"\s+BIGINT\s+NOT NULL REFERENCES fleet_breakdowns\(id\) ON DELETE CASCADE/);
    expect(MIG).toMatch(/fleet_accident_photo_type_chk/);
    expect(MIG).toMatch(/fleet_breakdown_photo_type_chk/);
    expect(MIG).not.toMatch(/journal|gl_|REFERENCES finance/i);
  });
});

describe("driver photo upload — self-owned, open report only", () => {
  for (const kind of ["accidents", "breakdowns"]) {
    it(`POST /me/${kind}/:id/photos is driver-gated, self-scoped, blocks closed reports`, () => {
      const b = block("post", `/me/${kind}/:id/photos`);
      expect(b).toMatch(/authorize\(\{\s*feature:\s*"fleet\.driver\.me",\s*action:\s*"update"\s*\}\)/);
      expect(b).toMatch(/"driverId"=\$3/);          // only the driver's own report
      expect(b).toMatch(/لا يمكن إضافة صور بعد إغلاق البلاغ/); // closed-state guard
      expect(b).toMatch(new RegExp(`INSERT INTO fleet_${kind.slice(0, -1)}_photos`));
    });
  }
});

describe("supervisor photo access + discoverability", () => {
  it("GET /accidents/:id/photos & /breakdowns/:id/photos are fleet.vehicles view", () => {
    expect(block("get", "/accidents/:id/photos")).toMatch(/feature:\s*"fleet\.vehicles",\s*action:\s*"view"/);
    expect(block("get", "/breakdowns/:id/photos")).toMatch(/feature:\s*"fleet\.vehicles",\s*action:\s*"view"/);
  });
  it("manager list endpoints expose a photoCount", () => {
    expect(block("get", "/accidents")).toMatch(/FROM fleet_accident_photos[\s\S]+?AS "photoCount"/);
    expect(block("get", "/breakdowns")).toMatch(/FROM fleet_breakdown_photos[\s\S]+?AS "photoCount"/);
  });
});
