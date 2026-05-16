import app from "./app.js";
import { logger } from "./lib/logger.js";
import { runMigrations } from "./lib/migrate.js";
import { startCronScheduler, stopCronScheduler } from "./lib/cronScheduler.js";
import { registerEventListeners } from "./lib/eventListeners.js";
import { registerRulesEngineListener } from "./lib/rulesEngine.js";
import "./lib/engines/hrEngine.js";
import { seedDemoData } from "./lib/seedDemoData.js";
import { bootstrapAdminUser } from "./lib/bootstrapAdmin.js";
import { syncFeatureCatalog } from "./lib/rbac/catalogSync.js";
import { syncLegacyToV2 } from "./lib/rbac/autoMigrate.js";
import { pool } from "./lib/rawdb.js";
import {
  initObservability,
  captureException as obsCaptureException,
  flushObservability,
  attachExpressErrorHandler,
} from "./lib/observability/index.js";
import { unhandledErrorsTotal, startNotificationQueueCollector, startOcrPendingCollector, startGhClientQuotaCollector } from "./lib/metrics.js";
import { rawQuery } from "./lib/rawdb.js";
import http from "http";
import fs from "node:fs";
import path from "node:path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const isDev = process.env.NODE_ENV === "development";

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled Promise Rejection — NOT crashing, logged for investigation");
  unhandledErrorsTotal.inc({ source: "unhandledRejection" });
  obsCaptureException(reason, { tags: { source: "unhandledRejection" } });
});

process.on("uncaughtException", async (err) => {
  logger.error({ err }, "Uncaught Exception — shutting down gracefully");
  unhandledErrorsTotal.inc({ source: "uncaughtException" });
  obsCaptureException(err, { tags: { source: "uncaughtException" } });
  await flushObservability(2000);
  process.exit(1);
});

async function start() {
  await initObservability();
  // Mount Sentry's Express error handler now that init has resolved.
  // (Mounting it inside app.ts at module-load time would be a no-op
  // because `sentryEnabled` flips to true only after `initObservability`
  // awaits the dynamic import — review-flagged ordering bug.)
  attachExpressErrorHandler(app);

  try {
    await runMigrations();
    logger.info("Database migrations complete");
  } catch (err) {
    logger.error({ err }, "Migration failed");
    if (!isDev) {
      logger.error("Exiting: migrations must succeed in non-development environments");
      process.exit(1);
    }
    logger.warn("Continuing despite migration failure (development mode only)");
  }

  // E2E bench admin — materialise the deterministic owner@local.test user
  // via the canonical SQL fixture (db/seed-admin-user.sql) when
  // SEED_DEMO_DATA=true. The fixture is idempotent and bootstraps a minimal
  // company+branch when none exist, so it must run BEFORE bootstrapAdminUser
  // (which requires company id=1 to already exist) on fresh CI databases.
  // Logic is NOT duplicated in JS — the SQL file is the single source of truth.
  if (process.env.SEED_DEMO_DATA === "true") {
    const seedPath = path.resolve(process.cwd(), "db/seed-admin-user.sql");
    try {
      const sql = fs.readFileSync(seedPath, "utf-8");
      await pool.query(sql);
      logger.info({ file: "db/seed-admin-user.sql" }, "E2E bench admin seeded");
    } catch (seedErr) {
      logger.warn(
        { err: seedErr, tried: seedPath },
        "E2E bench admin seed skipped or failed — e2e tests requiring owner@local.test may fail",
      );
    }
  }

  try {
    await bootstrapAdminUser();
    logger.info("Admin bootstrap complete");
  } catch (bootstrapErr) {
    logger.warn({ err: bootstrapErr }, "Admin bootstrap skipped or failed");
  }

  try {
    const cat = await syncFeatureCatalog();
    logger.info({ ...cat }, "RBAC v2: feature catalog synced");
    const sync = await syncLegacyToV2();
    logger.info({ ...sync }, "RBAC v2: legacy roles auto-migrated");
  } catch (rbacErr) {
    logger.warn({ err: rbacErr }, "RBAC v2 sync skipped or failed (legacy RBAC still active)");
  }

  if (process.env.SEED_DEMO_DATA === "true") {
    try {
      await seedDemoData();
      logger.info("Demo data seeding complete");
    } catch (seedErr) {
      logger.warn({ err: seedErr }, "Demo data seeding skipped or failed");
    }
  } else {
    logger.info("Demo data seeding disabled (set SEED_DEMO_DATA=true to enable)");
  }

  registerEventListeners();
  registerRulesEngineListener();
  logger.info("Event listeners and rules engine registered");

  if (!isDev && process.env.PERSIST_ALL_EVENTS !== "true") {
    logger.warn(
      "PERSIST_ALL_EVENTS is unset/false in a non-development environment. " +
      "Only events flagged `critical: true` in the catalog will land in event_logs; " +
      "non-critical events stay in-memory only. PDPL audit-trail completeness " +
      "requires PERSIST_ALL_EVENTS=true. Set it once event_logs growth has been sized."
    );
  }

  const server = http.createServer(app);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      logger.error({ port }, "Port already in use");
    } else {
      logger.error({ err }, "Server error");
    }
    process.exit(1);
  });

  server.listen(port, "0.0.0.0", async () => {
    logger.info({ port }, "Server listening");

    try {
      await startCronScheduler();
      logger.info("Cron scheduler started");
    } catch (cronErr) {
      logger.error({ err: cronErr }, "Failed to start cron scheduler");
    }

    // Periodic Prometheus gauge: pending email/sms/whatsapp queue depth.
    // Refreshes every 30s; failures are swallowed so the metrics path
    // can never crash the server.
    try {
      startNotificationQueueCollector(rawQuery);
      logger.info("Notification queue length collector started");
    } catch (err) {
      logger.warn({ err }, "Failed to start notification queue collector");
    }

    // Periodic Prometheus gauge: pending OCR document backlog (Task #331).
    // Lets ops alert when a forgotten OCR_PROVIDER env var or a broken
    // cloud Vision endpoint quietly accumulates unscanned uploads.
    try {
      startOcrPendingCollector(rawQuery);
      logger.info("OCR pending collector started");
    } catch (err) {
      logger.warn({ err }, "Failed to start OCR pending collector");
    }

    // Per-workflow GitHub proxy budget gauges (Task #373). Reads the
    // rolling JSONL audit log written by scripts/src/lib/github-client.mjs
    // and exposes per-workflow request/throttle rate + % of the 10 RPS
    // shared budget so Prometheus can page on-call when one workflow eats
    // the whole quota (rule `GhClientWorkflowHogsBudget`).
    try {
      startGhClientQuotaCollector();
      logger.info("GitHub client quota collector started");
    } catch (err) {
      logger.warn({ err }, "Failed to start GitHub client quota collector");
    }
  });

  async function shutdown(signal: string) {
    logger.info({ signal }, "Received shutdown signal, starting graceful shutdown");

    stopCronScheduler();
    logger.info("Cron scheduler stopped");

    server.close(async (err) => {
      if (err) {
        logger.error({ err }, "Error closing HTTP server");
      } else {
        logger.info("HTTP server closed");
      }

      try {
        await pool.end();
        logger.info("Database pool closed");
      } catch (dbErr) {
        logger.error({ err: dbErr }, "Error closing database pool");
      }

      try {
        await flushObservability(2000);
      } catch { /* swallow on shutdown */ }

      process.exit(0);
    });

    setTimeout(() => {
      logger.error("Graceful shutdown timed out, forcing exit");
      process.exit(1);
    }, 30000);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

start();
