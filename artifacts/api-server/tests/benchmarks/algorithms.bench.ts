// Benchmarks for pure algorithm helpers: haversine distance,
// moving average, critical-path scheduling, and the workload-aware
// resource picker used by `loadBalanceAssign`. These are the
// CPU-bound functions on the request path — the DB layer is
// covered by integration tests, not bench.
//
import { bench, describe } from "vitest";
import {
  haversineDistance,
  movingAverage,
  selectLeastLoadedResource,
  criticalPathLength,
  maintenancePriority,
  slaHours,
  type Resource,
} from "../../src/lib/algorithms.js";

// Reused fixtures so the per-iteration cost is the function, not
// the fixture construction.
const RIYADH: [number, number] = [24.7136, 46.6753];
const JEDDAH: [number, number] = [21.4858, 39.1925];

const shortSeries = Array.from({ length: 12 }, (_, i) => (i + 1) * 100);
const longSeries = Array.from({ length: 365 }, (_, i) => Math.sin(i / 7) * 1000 + 5000);

function makeResources(count: number): Resource[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    workload: i % 15,
    lat: 24.7 + (i % 10) * 0.01,
    lon: 46.6 + (i % 10) * 0.01,
    specialty: i % 4 === 0 ? "plumbing" : i % 4 === 1 ? "electrical" : i % 4 === 2 ? "hvac" : "general",
    rating: 3 + (i % 3),
  }));
}

const tenResources = makeResources(10);
const hundredResources = makeResources(100);

function makeTaskGraph(count: number) {
  // Linear chain with occasional branches — realistic project shape.
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    estimatedHours: (i % 8) + 1,
    dependsOn: i === 0 ? [] : i % 5 === 0 ? [i, i - 1] : [i],
  }));
}

const smallGraph = makeTaskGraph(20);
const mediumGraph = makeTaskGraph(200);

describe("haversineDistance", () => {
  bench("Riyadh → Jeddah", () => {
    haversineDistance(RIYADH[0], RIYADH[1], JEDDAH[0], JEDDAH[1]);
  });

  bench("identical points (short-circuit fastest path)", () => {
    haversineDistance(RIYADH[0], RIYADH[1], RIYADH[0], RIYADH[1]);
  });
});

describe("movingAverage", () => {
  bench("12-point series, default window", () => {
    movingAverage(shortSeries);
  });

  bench("365-point series, full window", () => {
    movingAverage(longSeries);
  });

  bench("365-point series, 30-day window", () => {
    movingAverage(longSeries, 30);
  });
});

describe("selectLeastLoadedResource", () => {
  bench("10 resources, no constraints", () => {
    selectLeastLoadedResource(tenResources);
  });

  bench("10 resources, geo + specialty + maxWorkload", () => {
    selectLeastLoadedResource(tenResources, {
      targetLat: RIYADH[0],
      targetLon: RIYADH[1],
      requiredSpecialty: "plumbing",
      maxWorkload: 10,
    });
  });

  bench("100 resources, geo + specialty + maxWorkload", () => {
    selectLeastLoadedResource(hundredResources, {
      targetLat: RIYADH[0],
      targetLon: RIYADH[1],
      requiredSpecialty: "electrical",
      maxWorkload: 12,
    });
  });
});

describe("criticalPathLength", () => {
  bench("20-task graph", () => {
    criticalPathLength(smallGraph);
  });

  bench("200-task graph", () => {
    criticalPathLength(mediumGraph);
  });
});

describe("priority helpers", () => {
  bench("maintenancePriority — plumbing, 7-day history", () => {
    maintenancePriority("plumbing", 7);
  });

  bench("slaHours — high", () => {
    slaHours("high");
  });
});
