import app from "./app.js";
import { logger } from "./lib/logger.js";
import { runMigrations } from "./lib/migrate.js";
import { startCronScheduler } from "./lib/cronScheduler.js";
import { registerEventListeners } from "./lib/eventListeners.js";
import { registerRulesEngineListener } from "./lib/rulesEngine.js";
import { registerUmrahEventListeners } from "./lib/umrahEventListeners.js";
import { seedDemoData } from "./lib/seedDemoData.js";
import { bootstrapAdminUser } from "./lib/bootstrapAdmin.js";
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
  registerUmrahEventListeners();
  registerRulesEngineListener();
  logger.info("Event listeners and rules engine registered");

  const server = http.createServer(app);

  server.listen(port, "0.0.0.0", async (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

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
