import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the pilgrim-detail reassign feature:
 *
 *   - PATCH /umrah/pilgrims/:id accepts agentId + subAgentId + packageId
 *     where an empty string ("") means "unassign". Pre-PR the schema
 *     used z.coerce.number() which turned "" into 0 and crashed the
 *     FK insert.
 *
 *   - The whitelist of patchable fields includes subAgentId so the
 *     update handler actually persists the change (it was previously
 *     dropped silently).
 *
 *   - The pilgrim-detail page surfaces a "إعادة إسناد" button that
 *     opens a modal with the two agent dropdowns, pre-filled to the
 *     current values. Both dropdowns include a "— no agent —" option
 *     so explicit unassign is a single click.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrim-detail.tsx"),
  "utf8",
);

describe("/umrah/pilgrims/:id PATCH — reassign-friendly schema", () => {
  it("defines a nullableFkId preprocess that maps '' / undefined → null", () => {
    expect(ROUTE).toMatch(/const nullableFkId = z\.preprocess\(/);
    expect(ROUTE).toMatch(/v === "" \|\| v === undefined \? null : v/);
    expect(ROUTE).toMatch(/z\.coerce\.number\(\)\.nullable\(\)/);
  });

  it("agentId / subAgentId / packageId all use the new preprocess", () => {
    expect(ROUTE).toMatch(/agentId:\s*nullableFkId\.optional\(\)/);
    expect(ROUTE).toMatch(/subAgentId:\s*nullableFkId\.optional\(\)/);
    expect(ROUTE).toMatch(/packageId:\s*nullableFkId\.optional\(\)/);
  });

  it("subAgentId is on the whitelist of patchable fields", () => {
    // Pre-PR fieldKeys was ["agentId","packageId",...] WITHOUT
    // subAgentId; so PATCH would accept the value via zod but the
    // update SQL would never set it. The reassign modal needs both
    // ids to persist.
    expect(ROUTE).toMatch(/fieldKeys\s*=\s*\["agentId","subAgentId","packageId"/);
  });
});

describe("pilgrim-detail page — reassign modal", () => {
  it("loads agents + sub-agents lists for the dropdowns", () => {
    expect(PAGE).toContain('"/umrah/agents"');
    expect(PAGE).toContain('"/umrah/sub-agents"');
    expect(PAGE).toContain('["umrah-agents"]');
    expect(PAGE).toContain('["umrah-sub-agents"]');
  });

  it("surfaces a reassign button (data-testid + Arabic label)", () => {
    expect(PAGE).toContain('data-testid="pilgrim-reassign-button"');
    expect(PAGE).toContain("إعادة إسناد");
  });

  it("opens an EntityEditDialog wired to the existing PATCH endpoint", () => {
    expect(PAGE).toMatch(/EntityEditDialog/);
    expect(PAGE).toMatch(/PilgrimReassignForm/);
    expect(PAGE).toMatch(/endpoint=\{`\/umrah\/pilgrims\/\$\{id\}`\}/);
  });

  it("dropdowns include an explicit unassign option", () => {
    // The "— لا وكيل —" / "— لا وكيل فرعي —" entries map to the empty
    // string that the backend's preprocess turns into null.
    expect(PAGE).toContain("— لا وكيل —");
    expect(PAGE).toContain("— لا وكيل فرعي —");
  });

  it("pre-fills defaultValues from the current agent + sub-agent ids", () => {
    // Operators usually flip one of the two — pre-fill makes the
    // unchanged one survive the save instead of getting wiped.
    expect(PAGE).toMatch(/agentId:\s*data\.agentId != null \? String\(data\.agentId\) : ""/);
    expect(PAGE).toMatch(/subAgentId:\s*data\.subAgentId != null \? String\(data\.subAgentId\) : ""/);
  });

  it("schema keeps both ids as strings on the wire (backend handles '' → null)", () => {
    // The transform→number→null pattern broke EntityEditDialog's
    // generic input/output equality; keeping the schema string-only
    // and pushing the empty-string mapping into the backend's
    // preprocess is the simpler split.
    expect(PAGE).toMatch(/agentId:\s*z\.string\(\)\.optional\(\)\.default\(""\)/);
    expect(PAGE).toMatch(/subAgentId:\s*z\.string\(\)\.optional\(\)\.default\(""\)/);
  });
});
