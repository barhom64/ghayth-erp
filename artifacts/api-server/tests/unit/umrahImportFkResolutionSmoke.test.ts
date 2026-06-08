import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the fix for the "import succeeded but no pilgrim / no agent
 * showed up anywhere" bug.
 *
 * Before: POST /umrah/import/mutamers called a legacy `doImport()`
 * helper that ran INSERTs against `umrah_pilgrims` directly. That
 * helper NEVER resolved the row's `nuskAgentNumber` → `agentId`,
 * the family/group name → `groupId`, or the sub-agent code →
 * `subAgentId`. Every row landed with `agentId = NULL`, which means
 *   - the pilgrim was nowhere on its agent's roster,
 *   - the agent statement showed zero balance for that batch,
 *   - the dashboard counters under-reported.
 * An operator confirmed importing 1,363 rows that "succeeded" but
 * left the system showing no new pilgrims and no new agents.
 *
 * After: the route calls `confirmMutamersImport(scope, rows, fileName)`
 * from `lib/umrahImportEngine.ts`. That function:
 *   - calls `resolveGroup` / `resolveAgent` / `resolveSubAgent`
 *     before each INSERT,
 *   - auto-creates primary agents that the file references but
 *     don't exist yet (surfaced to the wizard via
 *     `diff.newAgentsToCreate` at preview time so the operator can
 *     review BEFORE confirming),
 *   - writes a real `umrah_import_batches` row so the
 *     /umrah/imports list and the batch drill-down work.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahImportEngine.ts"),
  "utf8",
);

describe("umrah — /import/mutamers calls the engine, not legacy doImport", () => {
  it("imports confirmMutamersImport from the engine module", () => {
    expect(ROUTE).toMatch(/confirmMutamersImport,\s*[\r\n]/);
    expect(ROUTE).toMatch(/from "\.\.\/lib\/umrahImportEngine\.js"/);
  });

  it("the route hands normalized rows to confirmMutamersImport", () => {
    // Specifically: the route body must include a call of the form
    // `confirmMutamersImport(importScope, normalizedRows, fileName ?? "import-mutamers")`.
    expect(ROUTE).toMatch(
      /confirmMutamersImport\(\s*importScope,\s*normalizedRows,\s*fileName \?\? "import-mutamers"\s*\)/,
    );
  });

  it("the route does NOT call the legacy doImport helper from /import/mutamers", () => {
    // Pin the regression: the /import/mutamers handler block must NOT
    // reference doImport. (The helper still exists for the legacy
    // /import passthrough endpoint, but the wizard-facing route
    // must never hit it again.)
    const mutamersHandler = ROUTE.match(
      /router\.post\(["']\/import\/mutamers["'][\s\S]*?\n\}\);\n/,
    );
    expect(mutamersHandler).not.toBeNull();
    expect(mutamersHandler![0]).not.toMatch(/\bdoImport\s*\(/);
  });

  it("importScope carries the four fields confirmMutamersImport's ImportScope expects", () => {
    // The engine reads scope.companyId / branchId / userId / seasonId
    // out of the scope. Build the object explicitly rather than
    // spreading `scope` so we don't accidentally widen the shape.
    expect(ROUTE).toMatch(
      /const importScope = \{\s*companyId: scope\.companyId,\s*branchId: scope\.branchId,\s*userId: scope\.userId,\s*seasonId,\s*\};/,
    );
  });

  it("requires an open season — same guard the /import/vouchers route uses", () => {
    // Walk the handler to confirm requireOpenSeason runs before the
    // engine call (matches /import/vouchers semantics).
    const mutamersHandler = ROUTE.match(
      /router\.post\(["']\/import\/mutamers["'][\s\S]*?\n\}\);\n/,
    );
    expect(mutamersHandler).not.toBeNull();
    expect(mutamersHandler![0]).toMatch(/await requireOpenSeason\(seasonId, scope\.companyId\)/);
  });

  it("the schema accepts an optional fileName so audit + batch tracking lines up", () => {
    expect(ROUTE).toMatch(
      /importMutamersSchema = z\.object\(\{[\s\S]{0,400}fileName: z\.string\(\)\.trim\(\)\.optional\(\)/,
    );
  });

  it("event entityId is the engine batchId (not legacy umrah_import_logs id)", () => {
    expect(ROUTE).toMatch(/entity: "umrah_import_batches",\s*entityId: result\.batchId \?\? 0/);
  });
});

describe("engine — confirmMutamersImport DOES resolve the FK fields", () => {
  // Belt-and-braces: even though confirmMutamersImport is the
  // engine's existing export, pin its resolver wiring so a future
  // refactor that drops the resolution silently fails this test
  // instead of silently re-introducing the orphan-rows bug.
  it("calls resolveGroup before INSERT", () => {
    expect(ENGINE).toMatch(/const groupId = await resolveGroup\(client, scope, row\)/);
  });

  it("calls resolveAgent before INSERT", () => {
    expect(ENGINE).toMatch(/const agentId = await resolveAgent\(client, scope, row\)/);
  });

  it("calls resolveSubAgent before INSERT", () => {
    expect(ENGINE).toMatch(/const subAgentId = await resolveSubAgent\(client, scope, row, agentId\)/);
  });

  it("the INSERT into umrah_pilgrims wires groupId / subAgentId / agentId", () => {
    // Confirm the parameter list passes all three FK columns rather
    // than NULL placeholders — the legacy bug.
    expect(ENGINE).toMatch(/"groupId","subAgentId","agentId"/);
    expect(ENGINE).toMatch(/groupId, subAgentId, agentId,/);
  });
});
