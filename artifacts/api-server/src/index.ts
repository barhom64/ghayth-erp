// Production Hardening — Phase 0. Imported first so the consolidated
// environment guard validates (and fails fast) before any other module
// runs its own ad-hoc process.env check.
import "./lib/env.js";
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
import { config, assertEnvOrExit } from "./lib/config.js";
import http from "http";
import fs from "node:fs";
import path from "node:path";

// Fail-fast: validate the whole environment before any other startup work.
// On a fatal misconfiguration this prints an actionable report and exits,
// so a missing/invalid variable never surfaces as a confusing error deep
// inside a request handler.
assertEnvOrExit();

const port = config.port;

const isDev = config.isDevelopment;

process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "Unhandled Promise Rejection — NOT crashing, logged for investigation");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught Exception — shutting down gracefully");
  process.exit(1);
});

async function start() {
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
  if (config.seedDemoData) {
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

  if (config.seedDemoData) {
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

  if (!isDev && !config.persistAllEvents) {
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
