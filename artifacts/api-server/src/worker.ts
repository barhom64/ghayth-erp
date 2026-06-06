// ─────────────────────────────────────────────────────────────────────────────
// Worker process — runs the background systems that used to share the API's
// process: cron, event listeners, rules engine, print delivery, AI client,
// runtime telemetry, alert evaluation.
//
// Separating them addresses the senior architectural review's finding #1:
// running everything in one process means a crash in any background job
// (a failing cron, a flaky AI client, an event handler that throws) takes
// down the HTTP server too.
//
// Deployment:
//   - API container:    npm run start          (sets API_ONLY=true)
//   - Worker container: npm run worker:start   (this file)
//
// In single-process / dev mode (no API_ONLY env), index.ts still runs all
// the background systems in-process, so existing setups don't break.
// ─────────────────────────────────────────────────────────────────────────────

import { startTracing, stopTracing } from "./lib/tracing.js";
import { logger } from "./lib/logger.js";
import { runMigrations } from "./lib/migrate.js";
import { startCronScheduler, stopCronScheduler } from "./lib/cronScheduler.js";
import { startRuntimeTelemetry, stopRuntimeTelemetry } from "./lib/runtimeTelemetry.js";
import { startAlertEvaluation, stopAlertEvaluation } from "./lib/alertRules.js";
import { registerEventListeners } from "./lib/eventListeners.js";
import { registerRulesEngineListener } from "./lib/rulesEngine.js";
import "./lib/engines/hrEngine.js";
import { warmVendorSettingsCache } from "./lib/vendorSettings.js";
import { syncFeatureCatalog } from "./lib/rbac/catalogSync.js";
import { syncLegacyToV2 } from "./lib/rbac/autoMigrate.js";
import { pool } from "./lib/rawdb.js";
import { config, assertEnvOrExit, describeConfig } from "./lib/config.js";
import http from "http";
import express from "express";

// P1 — OpenTelemetry first.
startTracing();

// Same fail-fast config validation as the API process.
assertEnvOrExit();
logger.info({ env: describeConfig(), process: "worker" }, "worker environment validated");

const isDev = config.isDevelopment;

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise, process: "worker" }, "[worker] Unhandled Promise Rejection — NOT crashing");
});
process.on("uncaughtException", (err) => {
  logger.error({ err, process: "worker" }, "[worker] Uncaught Exception — shutting down");
  process.exit(1);
});

async function start() {
  // (1) Migrations — runs in BOTH api and worker because either process
  // could be the first one to come up on a fresh DB. The migrate runner
  // is idempotent (each migration is wrapped in a transaction and uses
  // a registry table) so concurrent runs don't corrupt anything; the
  // loser just sees "no new migrations to apply".
  try {
    await runMigrations();
    logger.info("[worker] Database migrations complete");
  } catch (err) {
    logger.error({ err }, "[worker] Migration failed");
    if (!isDev) process.exit(1);
    logger.warn("[worker] Continuing despite migration failure (dev mode)");
  }

  // (2) Vendor settings cache — listeners may need it (e.g. PBX webhook
  // verifier in the event-driven path).
  try {
    await warmVendorSettingsCache();
    logger.info("[worker] Vendor settings cache warmed");
  } catch (vsErr) {
    logger.warn({ err: vsErr }, "[worker] Vendor settings cache warm skipped");
  }

  // (3) RBAC sync — same as the API, idempotent.
  try {
    const cat = await syncFeatureCatalog();
    logger.info({ ...cat }, "[worker] RBAC v2: feature catalog synced");
    const sync = await syncLegacyToV2();
    logger.info({ ...sync }, "[worker] RBAC v2: legacy roles auto-migrated");
  } catch (rbacErr) {
    logger.warn({ err: rbacErr }, "[worker] RBAC v2 sync skipped or failed");
  }

  // (4) Event listeners + rules engine. These attach to the in-process
  // EventEmitter. When the outbox relay lands (P2) the listeners will
  // be driven by the relay instead of the in-process emitter, so the
  // worker truly owns event processing.
  registerEventListeners();
  registerRulesEngineListener();
  logger.info("[worker] Event listeners and rules engine registered");

  // (5) Cron scheduler.
  try {
    await startCronScheduler();
    logger.info("[worker] Cron scheduler started");
  } catch (cronErr) {
    logger.error({ err: cronErr }, "[worker] Failed to start cron scheduler");
  }

  // (6) Print Platform — delivery channels + AI client.
  try {
    const { registerDefaultChannels } = await import("./lib/print/delivery.js");
    await registerDefaultChannels();
    logger.info("[worker] Print delivery channels registered");
  } catch (err) {
    logger.error({ err }, "[worker] Failed to register print delivery channels");
  }
  try {
    const { registerDefaultAiClient } = await import("./lib/print/ai.js");
    await registerDefaultAiClient();
    logger.info("[worker] Print AI client registered");
  } catch (err) {
    logger.error({ err }, "[worker] Failed to register print AI client");
  }

  // (7) Runtime telemetry sampler + threshold-alert evaluator.
  startRuntimeTelemetry();
  logger.info("[worker] Runtime telemetry sampler started");
  startAlertEvaluation();
  logger.info("[worker] Runtime threshold-alert evaluation started");

  // (8) Health endpoint — minimal HTTP listener so the container
  // orchestrator (k8s, docker-compose healthcheck, PM2) can probe
  // the worker. /healthz returns 200; /readyz checks DB connectivity.
  // No business routes mounted — this is an ops surface, not an API.
  const healthApp = express();
  healthApp.get("/healthz", (_req, res) => {
    res.json({ status: "ok", process: "worker", uptime: process.uptime() });
  });
  healthApp.get("/readyz", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ status: "ready", db: "ok" });
    } catch (err: any) {
      res.status(503).json({ status: "degraded", db: "error", message: err?.message });
    }
  });
  const port = config.workerHealthPort;
  const server = http.createServer(healthApp);
  server.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "[worker] Health endpoints listening (/healthz, /readyz)");
  });

  async function shutdown(signal: string) {
    logger.info({ signal }, "[worker] Received shutdown signal — graceful shutdown starting");
    stopCronScheduler();
    logger.info("[worker] Cron scheduler stopped");
    stopRuntimeTelemetry();
    stopAlertEvaluation();
    await stopTracing();
    server.close(async () => {
      try {
        await pool.end();
        logger.info("[worker] Database pool closed");
      } catch (dbErr) {
        logger.error({ err: dbErr }, "[worker] Error closing database pool");
      }
      process.exit(0);
    });
    setTimeout(() => {
      logger.error("[worker] Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 30000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
