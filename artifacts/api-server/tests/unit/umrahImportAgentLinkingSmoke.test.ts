import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins gap #5 from docs/umrah-import-gaps-fix-plan.md: the preview phase
 * MUST surface auto-link gaps before the user confirms. Two specific risks:
 *
 *   1. The confirm step auto-creates missing umrah_agents rows. Without a
 *      preview warning the operator only finds out after the directory
 *      already has 50 duplicate-spelled rows.
 *   2. Rows that name no agent at all save with agentId=NULL — they
 *      disappear from agent statements. Without the count surfaced in the
 *      preview the operator never notices.
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahImportEngine.ts"),
  "utf8",
);
const WIZARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/import-wizard.tsx"),
  "utf8",
);

describe("umrahImportEngine — preview agent-linking warnings", () => {
  it("ImportDiff exposes newAgentsToCreate", () => {
    expect(ENGINE).toMatch(/newAgentsToCreate:\s*\{\s*nuskAgentNumber:\s*string\s*\|\s*null;\s*agentName:\s*string;\s*rowCount:\s*number\s*\}\[\]/);
  });

  it("ImportDiff exposes rowsWithoutAgent count", () => {
    expect(ENGINE).toMatch(/rowsWithoutAgent:\s*number/);
  });

  it("initialises both fields to empty/zero", () => {
    expect(ENGINE).toContain("newAgentsToCreate: [],");
    expect(ENGINE).toContain("rowsWithoutAgent: 0,");
  });

  it("pre-fetches known agents by nuskAgentNumber (umrah_agents.contractRef) + name", () => {
    // resolveAgent matches by contractRef first, then by name. The preview
    // mirror must hit BOTH columns or it'll false-flag rows that confirm
    // would silently match.
    expect(ENGINE).toMatch(/SELECT "contractRef"\s+FROM umrah_agents/);
    expect(ENGINE).toMatch(/SELECT name\s+FROM umrah_agents/);
  });

  it("increments rowsWithoutAgent when no agent info present", () => {
    expect(ENGINE).toContain("diff.rowsWithoutAgent++");
  });

  it("falls into newAgentsMap when neither nusk number nor name matches", () => {
    expect(ENGINE).toContain("if (!matchesByNuskNumber && !matchesByName)");
    expect(ENGINE).toMatch(/newAgentsMap\.set\(/);
  });

  it("dedupes across rows with the synthetic `${nuskNum}::${name}` key", () => {
    // The map key mirrors what resolveAgent would create on confirm, so a
    // file with 50 rows naming the same new agent surfaces once, not 50
    // times.
    expect(ENGINE).toMatch(/const key = `\$\{nuskNum \?\? ""\}::\$\{finalName\}`/);
  });

  it("falls back to `وكيل ${nuskNum}` when only the number is present (mirrors resolveAgent)", () => {
    expect(ENGINE).toMatch(/const finalName = aName \?\? `وكيل \$\{nuskNum\}`/);
  });

  it("emits the populated arrays on the diff before returning", () => {
    expect(ENGINE).toContain("diff.newAgentsToCreate = [...newAgentsMap.values()]");
  });
});

describe("import-wizard UI — agent-linking banners", () => {
  it("PreviewSummary type declares the two new fields", () => {
    expect(WIZARD).toContain("newAgentsToCreate?:");
    expect(WIZARD).toContain("rowsWithoutAgent?:");
  });

  it("renders a warning card for new agents to auto-create", () => {
    expect(WIZARD).toContain("وكلاء سيتم إنشاؤهم تلقائياً");
    expect(WIZARD).toMatch(/preview\.newAgentsToCreate\.map\(/);
  });

  it("renders a warning banner for rows without any agent", () => {
    expect(WIZARD).toContain("لا يحوي رقم وكيل ولا اسم وكيل");
    expect(WIZARD).toMatch(/preview\.rowsWithoutAgent/);
  });

  it("warns about duplicate-spelled agents in the auto-create card", () => {
    // The whole point of the card is to catch misspellings before they
    // pollute the directory. The copy must mention that risk.
    expect(WIZARD).toMatch(/مكررة|مكرر|إنشاء سجلات/);
  });
});
