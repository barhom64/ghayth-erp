import { describe, it, expect } from "vitest";
import { evaluateAlertRules } from "../../src/lib/alertRules.js";
import { resetMetrics, setGauge } from "../../src/lib/metrics.js";

describe("alertRules — runtime threshold evaluation", () => {
  it("does not fire when metrics are below threshold", () => {
    resetMetrics();
    setGauge("process.cpu.percent", 5);
    setGauge("db.pool.waiting", 0);
    expect(evaluateAlertRules()).toBe(0);
  });

  it("fires when a metric crosses its threshold, then dedups within the cooldown", () => {
    resetMetrics();
    setGauge("process.cpu.percent", 99); // cpu_high threshold is 90
    expect(evaluateAlertRules()).toBeGreaterThanOrEqual(1);
    // a second pass within the cooldown window must not re-fire the same rule
    expect(evaluateAlertRules()).toBe(0);
  });

  it("skips rules whose metric is not recorded", () => {
    resetMetrics();
    expect(evaluateAlertRules()).toBe(0);
  });
});
