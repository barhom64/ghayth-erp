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
import http from "http";

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
