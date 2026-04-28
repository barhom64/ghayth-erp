import { describe, it, expect } from "vitest";
import {
  haversineDistance,
  haversineKm,
  movingAverage,
  selectLeastLoadedResource,
  criticalPathLength,
  slaHours,
  maintenancePriority,
  slaDeadlineForPriority,
  maintenanceSlaDeadline,
  type Resource,
} from "../../src/lib/algorithms.js";

describe("haversineDistance", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineDistance(24.7136, 46.6753, 24.7136, 46.6753)).toBe(0);
  });

  it("computes the Riyadh → Jeddah great-circle distance to within 10km", () => {
    // Riyadh → Jeddah is ~845 km as the crow flies (haversine / spherical earth)
    const km = haversineDistance(24.7136, 46.6753, 21.4858, 39.1925);
    expect(km).toBeGreaterThan(840);
    expect(km).toBeLessThan(855);
  });

  it("is symmetric", () => {
    const ab = haversineDistance(24.7136, 46.6753, 21.4858, 39.1925);
    const ba = haversineDistance(21.4858, 39.1925, 24.7136, 46.6753);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it("exposes haversineKm alias", () => {
    expect(haversineKm).toBe(haversineDistance);
  });
});

describe("removed dead exports", () => {
  it("estimateTravelTime and fieldTaskDistance are no longer exported", async () => {
    const mod = await import("../../src/lib/algorithms.js");
    expect(mod).not.toHaveProperty("estimateTravelTime");
    expect(mod).not.toHaveProperty("fieldTaskDistance");
  });
});

describe("movingAverage", () => {
  it("returns 0 for empty array", () => {
    expect(movingAverage([])).toBe(0);
  });

  it("returns the single value for a 1-element window", () => {
    expect(movingAverage([42])).toBe(42);
  });

  it("weights recent values more heavily", () => {
    // Weights are 1,2,3 — so [1,1,10] = (1 + 2 + 30) / 6 = 5.5
    const result = movingAverage([1, 1, 10]);
    expect(result).toBeCloseTo(5.5, 6);
  });

  it("clamps to the tail when periods < length", () => {
    // Should only see [9,10] with weights 1,2 = (9 + 20) / 3 = 9.666..
    const result = movingAverage([1, 2, 3, 9, 10], 2);
    expect(result).toBeCloseTo(29 / 3, 6);
  });
});

describe("selectLeastLoadedResource", () => {
  it("returns null when no resources are available", () => {
    expect(selectLeastLoadedResource([])).toBeNull();
  });

  it("returns null when every resource exceeds maxWorkload", () => {
    const resources: Resource[] = [
      { id: 1, workload: 20 },
      { id: 2, workload: 30 },
    ];
    expect(selectLeastLoadedResource(resources, { maxWorkload: 10 })).toBeNull();
  });

  it("prefers the resource with the lowest workload when distance is absent", () => {
    const resources: Resource[] = [
      { id: 1, workload: 10 },
      { id: 2, workload: 2 },
      { id: 3, workload: 5 },
    ];
    const chosen = selectLeastLoadedResource(resources);
    expect(chosen?.id).toBe(2);
  });

  it("penalises distance when a target is provided", () => {
    // Both have equal workload — closer one should win.
    const resources: Resource[] = [
      { id: 1, workload: 5, lat: 24.72, lon: 46.68 }, // ~1km away
      { id: 2, workload: 5, lat: 21.49, lon: 39.19 }, // ~850km away
    ];
    const chosen = selectLeastLoadedResource(resources, {
      targetLat: 24.7136,
      targetLon: 46.6753,
    });
    expect(chosen?.id).toBe(1);
  });

  it("prefers a resource matching the requiredSpecialty", () => {
    const resources: Resource[] = [
      { id: 1, workload: 3, specialty: "plumbing" },
      { id: 2, workload: 3, specialty: "electrical" },
    ];
    const chosen = selectLeastLoadedResource(resources, {
      requiredSpecialty: "electrical",
    });
    expect(chosen?.id).toBe(2);
  });
});

describe("criticalPathLength", () => {
  it("returns 0 for an empty list", () => {
    expect(criticalPathLength([])).toBe(0);
  });

  it("returns the single task's hours when there are no deps", () => {
    expect(criticalPathLength([{ id: 1, estimatedHours: 8, dependsOn: [] }])).toBe(8);
  });

  it("sums along the longest dependency chain", () => {
    // 1 → 2 → 3 : 4 + 6 + 2 = 12
    // 1 → 4 (parallel): 4 + 3 = 7
    // longest = 12
    const tasks = [
      { id: 1, estimatedHours: 4, dependsOn: [] },
      { id: 2, estimatedHours: 6, dependsOn: [1] },
      { id: 3, estimatedHours: 2, dependsOn: [2] },
      { id: 4, estimatedHours: 3, dependsOn: [1] },
    ];
    expect(criticalPathLength(tasks)).toBe(12);
  });

  it("handles diamond dependencies", () => {
    // 1 → {2,3} → 4
    // Longest branch: 1 (3h) → 2 (5h) → 4 (2h) = 10
    const tasks = [
      { id: 1, estimatedHours: 3, dependsOn: [] },
      { id: 2, estimatedHours: 5, dependsOn: [1] },
      { id: 3, estimatedHours: 2, dependsOn: [1] },
      { id: 4, estimatedHours: 2, dependsOn: [2, 3] },
    ];
    expect(criticalPathLength(tasks)).toBe(10);
  });
});

describe("slaHours", () => {
  it("maps critical → 2h, high → 4h, medium → 8h, low → 24h", () => {
    expect(slaHours("critical")).toBe(2);
    expect(slaHours("high")).toBe(4);
    expect(slaHours("medium")).toBe(8);
    expect(slaHours("low")).toBe(24);
  });

  it("defaults unknown priorities to 24h", () => {
    expect(slaHours("unknown")).toBe(24);
    expect(slaHours("")).toBe(24);
  });
});

describe("maintenancePriority", () => {
  it("escalates structural + slow history to critical", () => {
    // severity 5 + history 3 = 8 → critical
    expect(maintenancePriority("structural", 20)).toBe("critical");
  });

  it("demotes general + fast history to low", () => {
    // severity 1 + history 1 = 2 → low
    expect(maintenancePriority("general", 1)).toBe("low");
  });

  it("lands plumbing + mid history at high", () => {
    // severity 3 + history 2 = 5 → high
    expect(maintenancePriority("plumbing", 10)).toBe("high");
  });

  it("defaults unknown category to severity 2", () => {
    // severity 2 + history 1 = 3 → medium
    expect(maintenancePriority("unknown", 1)).toBe("medium");
  });

  it("is case-insensitive on the category", () => {
    expect(maintenancePriority("STRUCTURAL", 20)).toBe("critical");
    expect(maintenancePriority("Structural", 20)).toBe("critical");
  });
});

describe("slaDeadlineForPriority", () => {
  it("adds the SLA hours to now", () => {
    const before = Date.now();
    const deadline = slaDeadlineForPriority("critical");
    const after = Date.now();
    const diff = deadline.getTime() - before;
    expect(diff).toBeGreaterThanOrEqual(2 * 60 * 60 * 1000 - 50);
    expect(diff).toBeLessThanOrEqual(2 * 60 * 60 * 1000 + (after - before) + 50);
  });
});

describe("maintenanceSlaDeadline", () => {
  it("uses the maintenance-specific SLA table", () => {
    const now = Date.now();
    // critical = 4h, high = 24h, medium = 72h, low = 168h
    const crit = maintenanceSlaDeadline("critical").getTime() - now;
    const high = maintenanceSlaDeadline("high").getTime() - now;
    const med = maintenanceSlaDeadline("medium").getTime() - now;
    const low = maintenanceSlaDeadline("low").getTime() - now;

    // ±2s slack for clock drift during the test
    expect(crit).toBeGreaterThanOrEqual(4 * 60 * 60 * 1000 - 2000);
    expect(crit).toBeLessThanOrEqual(4 * 60 * 60 * 1000 + 2000);
    expect(high).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 2000);
    expect(high).toBeLessThanOrEqual(24 * 60 * 60 * 1000 + 2000);
    expect(med).toBeGreaterThanOrEqual(72 * 60 * 60 * 1000 - 2000);
    expect(med).toBeLessThanOrEqual(72 * 60 * 60 * 1000 + 2000);
    expect(low).toBeGreaterThanOrEqual(168 * 60 * 60 * 1000 - 2000);
    expect(low).toBeLessThanOrEqual(168 * 60 * 60 * 1000 + 2000);
  });

  it("defaults unknown priority to 72h (medium)", () => {
    const now = Date.now();
    const deadline = maintenanceSlaDeadline("unknown").getTime() - now;
    expect(deadline).toBeGreaterThanOrEqual(72 * 60 * 60 * 1000 - 2000);
    expect(deadline).toBeLessThanOrEqual(72 * 60 * 60 * 1000 + 2000);
  });
});
