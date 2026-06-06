import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P1 — worker / API process split contract ──────────────────────────────
//
// The senior architectural review's finding #1 was that the API process
// runs 12+ background subsystems (cron, event listeners, rules engine,
// print delivery, AI client, runtime telemetry, alert evaluation, etc.).
// A crash in any of them takes down the HTTP server too.
//
// P1 introduces a separate `worker.ts` process. The API can run as
// HTTP-only via API_ONLY=true; the worker owns the background work.
// This file locks the contract so a regression PR can't quietly fold
// the worker back into the API process.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const INDEX = read("artifacts/api-server/src/index.ts");
const WORKER = read("artifacts/api-server/src/worker.ts");
const PKG = JSON.parse(read("artifacts/api-server/package.json"));
const BUILD = read("artifacts/api-server/build.mjs");

describe("P1 — index.ts respects API_ONLY env flag", () => {
  it("reads apiOnly through the typed config (FND-003 — no direct process.env)", () => {
    expect(INDEX).toContain("config.apiOnly");
    expect(INDEX).toContain("isApiOnly");
    // Direct process.env read forbidden outside config.ts
    expect(INDEX).not.toMatch(/process\.env\.API_ONLY/);
  });

  it("skips event listeners + rules engine when API_ONLY=true", () => {
    expect(INDEX).toContain("if (!isApiOnly)");
    const block = INDEX.slice(INDEX.indexOf("Event listeners + rules engine"));
    expect(block).toContain("registerEventListeners()");
    expect(block).toContain("deferred to worker.ts");
  });

  it("skips cron + print + telemetry + alerts when API_ONLY=true", () => {
    expect(INDEX).toContain("API_ONLY=true — skipping cron / print / telemetry / alerts");
    // The early return MUST come before startCronScheduler / startRuntimeTelemetry.
    const earlyReturnIdx = INDEX.indexOf("handled by worker.ts");
    const cronIdx = INDEX.indexOf("await startCronScheduler()");
    const telIdx = INDEX.indexOf("startRuntimeTelemetry()");
    expect(earlyReturnIdx).toBeGreaterThan(-1);
    expect(cronIdx).toBeGreaterThan(earlyReturnIdx);
    expect(telIdx).toBeGreaterThan(earlyReturnIdx);
  });
});

describe("P1 — worker.ts entry point exists and owns the background systems", () => {
  it("worker.ts imports the same background-system modules as index.ts", () => {
    const required = [
      "startCronScheduler",
      "startRuntimeTelemetry",
      "startAlertEvaluation",
      "registerEventListeners",
      "registerRulesEngineListener",
    ];
    for (const sym of required) expect(WORKER).toContain(sym);
  });

  it("worker.ts starts cron + telemetry + alerts during boot", () => {
    expect(WORKER).toContain("await startCronScheduler()");
    expect(WORKER).toContain("startRuntimeTelemetry()");
    expect(WORKER).toContain("startAlertEvaluation()");
  });

  it("worker.ts registers print delivery + AI client", () => {
    expect(WORKER).toContain("registerDefaultChannels");
    expect(WORKER).toContain("registerDefaultAiClient");
  });

  it("worker.ts runs migrations + RBAC sync (idempotent — safe in both processes)", () => {
    expect(WORKER).toContain("runMigrations()");
    expect(WORKER).toContain("syncFeatureCatalog()");
    expect(WORKER).toContain("syncLegacyToV2()");
  });

  it("worker.ts exposes /healthz + /readyz on a config-driven port", () => {
    expect(WORKER).toContain("/healthz");
    expect(WORKER).toContain("/readyz");
    expect(WORKER).toContain("config.workerHealthPort");
    // Direct process.env read forbidden outside config.ts
    expect(WORKER).not.toMatch(/process\.env\.WORKER_HEALTH_PORT/);
  });

  it("worker.ts implements graceful shutdown matching the API process", () => {
    expect(WORKER).toContain("SIGTERM");
    expect(WORKER).toContain("SIGINT");
    expect(WORKER).toContain("stopCronScheduler()");
    expect(WORKER).toContain("stopRuntimeTelemetry()");
    expect(WORKER).toContain("stopAlertEvaluation()");
    expect(WORKER).toContain("await pool.end()");
  });

  it("worker.ts logs include process: 'worker' for log filtering", () => {
    expect(WORKER).toContain('process: "worker"');
  });
});

describe("P1 — package.json declares worker scripts", () => {
  it("has a worker:start script that runs the bundled worker entry", () => {
    expect(PKG.scripts["worker:start"]).toBe("node --enable-source-maps ./dist/worker.mjs");
  });

  it("has a worker:dev script that builds + starts the worker", () => {
    expect(PKG.scripts["worker:dev"]).toContain("pnpm run build");
    expect(PKG.scripts["worker:dev"]).toContain("pnpm run worker:start");
  });

  it("has an API_ONLY convenience script for split-deploy mode", () => {
    expect(PKG.scripts["start:api-only"]).toContain("API_ONLY=true");
    expect(PKG.scripts["start:api-only"]).toContain("./dist/index.mjs");
  });

  it("keeps the legacy `start` script unchanged (single-process backwards compat)", () => {
    expect(PKG.scripts.start).toBe("node --enable-source-maps ./dist/index.mjs");
  });
});

describe("P1 — build.mjs produces both API and worker bundles", () => {
  it("includes worker-impl as a new esbuild entryPoint", () => {
    expect(BUILD).toContain('"worker-impl"');
    expect(BUILD).toContain("src/worker.ts");
  });

  it("writes a worker.mjs shim that preloads OTEL before worker-impl", () => {
    expect(BUILD).toContain("workerShim");
    expect(BUILD).toContain('"./worker-impl.mjs"');
    expect(BUILD).toContain('dist/worker.mjs');
  });
});
