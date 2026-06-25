import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Umrah split-off groups go through the numbering centre.
 *
 * Background: POST /umrah/groups/:id/split creates a brand-new (split-off)
 * group. Historically that INSERT set a derived `nuskGroupNumber` but NO
 * `internalRef` — it never went through the numbering centre, unlike POST
 * /umrah/groups. The gap was surfaced during the U-07 Phase 22 carve (the
 * audit:numbering-coverage check passed only because the create path's
 * issueNumber lived in the same file).
 *
 * This pins the fix: the split route now issues a per-season umrah_group number
 * (issueNumber, entityKey "umrah_group"), writes it into the new group's
 * internalRef column, and links the numbering_assignments row to the new id —
 * exactly mirroring the create path. Behaviour parity, not a new contract.
 */

const SRC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-groups.ts"),
  "utf8",
);

// Isolate the split handler body so assertions don't accidentally match the
// create (POST /groups) handler, which already issued numbers.
const splitIdx = SRC.indexOf('router.post("/groups/:id/split"');
const splitEnd = SRC.indexOf('router.post("/groups/merge"', splitIdx);
const SPLIT = SRC.slice(splitIdx, splitEnd > -1 ? splitEnd : undefined);

describe("umrah split — numbering-centre parity", () => {
  it("the split handler was located (guard against a silent empty slice)", () => {
    expect(splitIdx).toBeGreaterThan(-1);
    expect(SPLIT.length).toBeGreaterThan(500);
  });

  it("issues an umrah_group number via the numbering centre", () => {
    expect(SPLIT).toMatch(/await issueNumber\(\{/);
    expect(SPLIT).toMatch(/entityKey:\s*"umrah_group"/);
    expect(SPLIT).toMatch(/entityTable:\s*"umrah_groups"/);
    // Seasoned by the SOURCE group's season (the split-off inherits it).
    expect(SPLIT).toMatch(/seasonId:\s*source\.seasonId/);
  });

  it("writes the issued number into the new group's internalRef column", () => {
    // The INSERT column list now carries internalRef, and the value bound to it
    // is the issued number.
    expect(SPLIT).toMatch(/INSERT INTO umrah_groups[\s\S]*"internalRef"/);
    expect(SPLIT).toMatch(/issuedSplit\.number/);
  });

  it("links the numbering_assignments row to the new group id (same as create)", () => {
    expect(SPLIT).toMatch(/UPDATE numbering_assignments SET "entityId" = \$1 WHERE id = \$2/);
    expect(SPLIT).toMatch(/splitAssignmentId/);
  });

  it("keeps the public response shape unchanged — assignmentId is not spread into the body", () => {
    // The captured assignment id is a local (let), not part of the returned
    // `result` object, so `res.json({ success: true, ...result })` is untouched.
    expect(SPLIT).toMatch(/let splitAssignmentId/);
    expect(SPLIT).toMatch(/return \{ newGroup, movedCount: body\.pilgrimIds\.length \};/);
  });
});
