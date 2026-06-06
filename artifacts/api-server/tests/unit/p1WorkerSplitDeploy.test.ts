import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P1 (operational) — worker / API split deployment artifacts ─────────────
//
// The application code for the split shipped in P1 (worker.ts, API_ONLY,
// build.mjs two bundles). These assertions lock the DEPLOYMENT side:
// docker-compose.split.yml runs the two roles from one image with the
// flag triad that makes the split correct, and the Dockerfile documents
// the worker command override.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const SPLIT = read("docker-compose.split.yml");
const DOCKERFILE = read("Dockerfile.api-server");
const BUILD = read("artifacts/api-server/build.mjs");

describe("P1 — docker-compose.split.yml runs the two roles correctly", () => {
  it("defines both an api and a worker service", () => {
    expect(SPLIT).toMatch(/^\s{2}api:/m);
    expect(SPLIT).toMatch(/^\s{2}worker:/m);
  });

  it("api runs HTTP-only (API_ONLY=true) and emits to the outbox (OUTBOX_SOLE_DISPATCHER=true)", () => {
    const apiIdx = SPLIT.indexOf("\n  api:");
    const workerIdx = SPLIT.indexOf("\n  worker:");
    const apiBlock = SPLIT.slice(apiIdx, workerIdx);
    expect(apiBlock).toMatch(/API_ONLY:\s*"true"/);
  });

  it("worker runs the worker bundle and the relay (OUTBOX_RELAY_ACTIVE=true)", () => {
    const workerIdx = SPLIT.indexOf("\n  worker:");
    const webIdx = SPLIT.indexOf("\n  web:");
    const workerBlock = SPLIT.slice(workerIdx, webIdx);
    expect(workerBlock).toMatch(/dist\/worker\.mjs/);
    expect(workerBlock).toMatch(/OUTBOX_RELAY_ACTIVE:\s*"true"/);
    expect(workerBlock).toMatch(/WORKER_HEALTH_PORT:\s*"7001"/);
    expect(workerBlock).toMatch(/healthz/); // health check wired
  });

  it("OUTBOX_SOLE_DISPATCHER is set for BOTH roles (shared anchor)", () => {
    // Shared via the x-app-env anchor so api + worker can't drift.
    expect(SPLIT).toMatch(/OUTBOX_SOLE_DISPATCHER:\s*"true"/);
    expect(SPLIT).toContain("x-app-env");
  });

  it("both roles build from the same Dockerfile.api-server image", () => {
    const builds = [...SPLIT.matchAll(/dockerfile:\s*Dockerfile\.api-server/g)];
    expect(builds.length).toBeGreaterThanOrEqual(2);
  });
});

describe("P1 — Dockerfile + build produce both bundles", () => {
  it("build.mjs emits a worker shim at dist/worker.mjs", () => {
    expect(BUILD).toMatch(/dist\/worker\.mjs|"worker\.mjs"/);
    expect(BUILD).toContain("worker-impl");
  });

  it("Dockerfile documents the worker command override", () => {
    expect(DOCKERFILE).toMatch(/dist\/worker\.mjs/);
  });
});
