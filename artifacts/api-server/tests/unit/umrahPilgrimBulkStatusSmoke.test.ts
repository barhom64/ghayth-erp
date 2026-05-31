import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the bulk-status pilgrim flow.
 *
 *   - POST /umrah/pilgrims/status-bulk accepts { pilgrimIds, status }
 *     and flips every selected row whose CURRENT status is a valid
 *     source for the chosen target (per PILGRIM_TRANSITIONS).
 *
 *   - The endpoint refuses up-front if the target status has no
 *     legal source — without that check, the UPDATE would touch zero
 *     rows and the operator would mistake the no-op for success.
 *
 *   - Response carries `{ updated, skipped, toStatus }` so the UI
 *     toast can read out "47 updated / 3 skipped".
 *
 *   - The pilgrims page renders the bulk-status picker INSIDE the
 *     existing multi-select toolbar (no new modal) so the flight-
 *     landing flow is one selection + one click.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/pilgrims.tsx"),
  "utf8",
);

describe("POST /umrah/pilgrims/status-bulk", () => {
  it("declares the zod schema for bulkStatusSchema with the right shape", () => {
    expect(ROUTE).toMatch(/const bulkStatusSchema = z\.object\(\{/);
    expect(ROUTE).toMatch(/pilgrimIds:\s*z\.array\(z\.coerce\.number\(\)\)\.min\(1/);
    expect(ROUTE).toMatch(/status:\s*z\.enum\(PILGRIM_STATUSES\)/);
  });

  it("registers under feature: umrah, action: update (not create — it's a state change)", () => {
    expect(ROUTE).toMatch(/"\/pilgrims\/status-bulk"[\s\S]{0,200}feature:\s*"umrah",\s*action:\s*"update"/);
  });

  it("computes legal from-states by inverting PILGRIM_TRANSITIONS", () => {
    // The inversion lets the UPDATE filter `status = ANY($4)` so
    // already-departed rows in the selection are silently skipped.
    expect(ROUTE).toMatch(/Object\.entries\(PILGRIM_TRANSITIONS\)[\s\S]{0,200}\.filter\(\(\[,\s*targets\]\) => targets\.includes\(toStatus\)\)/);
  });

  it("refuses early when the target status has no legal source", () => {
    // If the operator picks "pending" (which nothing transitions
    // INTO), the UPDATE would no-op and the operator would mistake
    // the silent no-op for success.
    expect(ROUTE).toMatch(/if \(fromStates\.length === 0\)/);
    expect(ROUTE).toMatch(/لا يمكن الانتقال إلى الحالة/);
  });

  it("UPDATE filters by id ANY AND status ANY so skipped rows aren't regressed", () => {
    expect(ROUTE).toMatch(/UPDATE umrah_pilgrims[\s\S]{1,400}id = ANY\(\$3\)[\s\S]{0,200}status = ANY\(\$4\)/);
  });

  it("two-pass count surfaces updated + skipped separately in the response", () => {
    expect(ROUTE).toMatch(/SELECT COUNT\(\*\)::int AS c FROM umrah_pilgrims[\s\S]{0,300}id = ANY\(\$2\)/);
    expect(ROUTE).toMatch(/skippedCount = Math\.max\(0, Number\(targetedCount\) - updatedCount\)/);
    expect(ROUTE).toMatch(/res\.json\(\{ updated: updatedCount, skipped: skippedCount, toStatus \}\)/);
  });

  it("audit + event payloads carry the bulk counts for compliance trails", () => {
    expect(ROUTE).toMatch(/bulkStatusTo:\s*toStatus,\s*updated:\s*updatedCount,\s*skipped:\s*skippedCount/);
    expect(ROUTE).toMatch(/"umrah\.pilgrims\.bulk_status_changed"/);
  });
});

describe("pilgrims page — bulk-status picker on the multi-select toolbar", () => {
  it("declares a status options array mirroring the backend enum", () => {
    expect(PAGE).toMatch(/PILGRIM_STATUS_OPTIONS\s*=\s*\[/);
    expect(PAGE).toMatch(/value:\s*"arrived",\s*label:\s*"وصل"/);
    expect(PAGE).toMatch(/value:\s*"departed",\s*label:\s*"غادر"/);
  });

  it("mutation hits the new endpoint with the right shape", () => {
    expect(PAGE).toMatch(/"\/umrah\/pilgrims\/status-bulk",[\s\S]{0,50}"POST"/);
    expect(PAGE).toMatch(/pilgrimIds: Array\.from\(selectedIds\), status: bulkStatus/);
  });

  it("toast shows updated + skipped counts when any row was skipped", () => {
    expect(PAGE).toMatch(/r\.skipped > 0/);
    expect(PAGE).toMatch(/تم تحديث \$\{r\.updated\} \| تخطّي \$\{r\.skipped\}/);
  });

  it("UI elements have stable data-testids so e2e can target them", () => {
    expect(PAGE).toContain('data-testid="bulk-status-select"');
    expect(PAGE).toContain('data-testid="bulk-status-apply"');
  });

  it("apply button is gated by umrah:update permission (not :create)", () => {
    // The picker block sits next to bulk-assign. assign uses :create,
    // status flip is :update because it doesn't add a row. The
    // GuardedButton with the bulk-status testid must carry the
    // :update perm string.
    const block = PAGE.match(/<GuardedButton[\s\S]{0,400}data-testid="bulk-status-apply"/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain('perm="umrah:update"');
  });
});
