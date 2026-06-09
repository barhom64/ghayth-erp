import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the "manual entity creation lacks resolution/validation" fixes.
 *
 * Same operator pain (data lands invisibly) as the /import/mutamers
 * NULL-FK bug from #1867, but via a different path: the manual
 * pilgrim form and the manual violation form. Both routes accepted
 * a subset of FK columns and skipped consistency checks, so:
 *
 *   - A pilgrim added by hand could only be linked to an agent,
 *     never to a group or sub-agent → invisible on group
 *     statements + sub-agent rollups + agent → group → sub-agent
 *     drill-down.
 *   - A violation could be filed against pilgrim P (under agent A)
 *     with agentId=B → dashboard's per-agent penalty totals
 *     attributed the penalty to the wrong party.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const FORM = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrim-create.tsx"),
  "utf8",
);

describe("POST /umrah/pilgrims — schema accepts the FK trio", () => {
  it("createPilgrimSchema declares subAgentId / groupId / nuskNumber", () => {
    expect(ROUTE).toMatch(/createPilgrimSchema = z\.object\(\{[\s\S]{0,800}subAgentId: z\.coerce\.number\(\)\.optional\(\)/);
    expect(ROUTE).toMatch(/createPilgrimSchema = z\.object\(\{[\s\S]{0,800}groupId: z\.coerce\.number\(\)\.optional\(\)/);
    expect(ROUTE).toMatch(/createPilgrimSchema = z\.object\(\{[\s\S]{0,800}nuskNumber: z\.string\(\)\.trim\(\)\.optional\(\)/);
  });
});

describe("POST /umrah/pilgrims — handler validates ownership + INSERTs the new columns", () => {
  it("checks sub-agent belongs to the company AND to the supplied agent", () => {
    expect(ROUTE).toMatch(/SELECT id, "agentId" FROM umrah_sub_agents WHERE id=\$1/);
    expect(ROUTE).toMatch(/المكتب المختار لا ينتمي للوكيل المحدد/);
  });

  it("checks group belongs to the company AND to the supplied agent", () => {
    expect(ROUTE).toMatch(/SELECT id, "agentId" FROM umrah_groups WHERE id=\$1/);
    expect(ROUTE).toMatch(/المجموعة المختارة لا تنتمي للوكيل المحدد/);
  });

  it("INSERT into umrah_pilgrims wires subAgentId / groupId / nuskNumber", () => {
    expect(ROUTE).toMatch(/INSERT INTO umrah_pilgrims[\s\S]{0,300}"subAgentId","groupId","nuskNumber"/);
  });
});

describe("pilgrim-create.tsx — form exposes the FK trio to the operator", () => {
  it("schema declares subAgentId / groupId / nuskNumber as optional", () => {
    expect(FORM).toMatch(/subAgentId: z\.string\(\)\.optional\(\)/);
    expect(FORM).toMatch(/groupId: z\.string\(\)\.optional\(\)/);
    expect(FORM).toMatch(/nuskNumber: z\.string\(\)\.optional\(\)/);
  });

  it("fetches the sub-agents and groups option lists", () => {
    expect(FORM).toMatch(/useApiQuery<any>\(\["umrah-sub-agents"\], "\/umrah\/sub-agents"\)/);
    expect(FORM).toMatch(/useApiQuery<any>\(\["umrah-groups"\], "\/umrah\/groups"\)/);
  });

  it("submit body coerces the new fields to Number / string undefined", () => {
    expect(FORM).toMatch(/subAgentId: values\.subAgentId \? Number\(values\.subAgentId\) : undefined/);
    expect(FORM).toMatch(/groupId: values\.groupId \? Number\(values\.groupId\) : undefined/);
    expect(FORM).toMatch(/nuskNumber: values\.nuskNumber \|\| undefined/);
  });

  it("renders FormSelectField bound to each new id field", () => {
    expect(FORM).toMatch(/name="subAgentId"[\s\S]{0,200}label="المكتب \(الوكيل الفرعي\)"/);
    expect(FORM).toMatch(/name="groupId"[\s\S]{0,200}label="المجموعة"/);
    expect(FORM).toMatch(/name="nuskNumber"[\s\S]{0,200}label="رقم المعتمر \(نسك\)"/);
  });
});

describe("POST /umrah/violations — FK chain consistency check", () => {
  it("looks up the pilgrim's agentId / subAgentId when mutamerId is set", () => {
    expect(ROUTE).toMatch(/SELECT id, "agentId", "subAgentId" FROM umrah_pilgrims WHERE id=\$1/);
  });

  it("rejects mismatched agentId vs pilgrim's agentId", () => {
    expect(ROUTE).toMatch(/الوكيل المحدد لا يطابق وكيل المعتمر/);
  });

  it("rejects mismatched subAgentId vs pilgrim's subAgentId", () => {
    expect(ROUTE).toMatch(/المكتب المحدد لا يطابق مكتب المعتمر/);
  });

  it("auto-fills agentId / subAgentId from the pilgrim when not provided", () => {
    // Avoids forcing the operator to repeat data the system can
    // derive; also keeps dashboard filters cheap (no LEFT JOIN
    // umrah_pilgrims required for per-agent rollups).
    expect(ROUTE).toMatch(/agentId = agentId \?\? p\.agentId/);
    expect(ROUTE).toMatch(/subAgentId = subAgentId \?\? p\.subAgentId/);
  });

  it("INSERT uses the resolved agentId / subAgentId (not raw body values)", () => {
    // The INSERT must use the locally-resolved variables, not
    // `b.agentId` / `b.subAgentId` — otherwise the auto-fill path
    // would still write NULL.
    const handler = ROUTE.match(
      /router\.post\(["']\/violations["'][\s\S]*?\n\}\);\n/,
    );
    expect(handler).not.toBeNull();
    expect(handler![0]).toMatch(/agentId, subAgentId, b\.description \|\| null/);
  });

  it("verifies sub-agent ↔ agent linkage even without a pilgrim row", () => {
    expect(ROUTE).toMatch(/المكتب لا ينتمي للوكيل المحدد/);
  });
});
