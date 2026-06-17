/**
 * HR correctness bug-fixes (#2222 review pass). Source-only; no database.
 *
 *  - employees.ts: onboarding task count reported from the real plan length
 *    (was a hard-coded 4 while plans create 5-7), and the onboarding dueDate
 *    is computed from Riyadh today (was UTC `new Date()`, off-by-one at night).
 *  - fleet.ts: a driver-liability traffic fine for a driver not linked to an
 *    employee now fails fast instead of silently dropping the deduction.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const EMP = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"), "utf8");
const FLEET = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/fleet.ts"), "utf8");

describe("HR bugfix — onboarding task count is real, not hard-coded 4", () => {
  it("derives onboardingTaskCount from the activation plan length", () => {
    expect(EMP).toMatch(/const activationPlan = buildActivationPlan\(resolvedCategory\)/);
    expect(EMP).toMatch(/const onboardingTaskCount = activationPlan\.length/);
  });
  it("no longer emits the literal onboardingTasksCreated: 4 / onboardingTasks: 4", () => {
    expect(EMP).not.toMatch(/onboardingTasksCreated: 4\b/);
    expect(EMP).not.toMatch(/onboardingTasks: 4\b/);
    expect(EMP).not.toMatch(/تم إنشاء \$\{4\} مهام/);
  });
});

describe("HR bugfix — onboarding dueDate is Riyadh-local, not UTC", () => {
  it("anchors the +7 day due date on todayISO() noon-UTC, not raw new Date()", () => {
    expect(EMP).toMatch(/new Date\(`\$\{todayISO\(\)\}T12:00:00Z`\)/);
    expect(EMP).toMatch(/dueDateOnboarding\.setUTCDate\(dueDateOnboarding\.getUTCDate\(\) \+ 7\)/);
    // the old UTC-drift form must be gone from the onboarding sites
    expect(EMP).not.toMatch(/const dueDateOnboarding = new Date\(\);/);
  });
});

describe("HR bugfix — driver-liability fine cannot silently drop", () => {
  const block =
    FLEET.match(/router\.post\("\/traffic-violations"[\s\S]*?const \{ insertId \}/)?.[0] || "";
  it("resolves the driver's employeeId during the pre-insert driver check", () => {
    expect(block).toMatch(/SELECT id, "employeeId" FROM fleet_drivers/);
    expect(block).toMatch(/driverEmployeeId = driverRow\.employeeId \?\? null/);
  });
  it("rejects a driver-liability fine when the driver maps to no employee", () => {
    expect(block).toMatch(/liability === 'driver' && fineAmount > 0 && driverEmployeeId == null/);
    expect(block).toMatch(/لا يمكن حسم الغرامة من راتبه/);
  });
});
