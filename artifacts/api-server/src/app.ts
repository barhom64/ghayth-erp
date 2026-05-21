import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { eventBusMiddleware } from "./middlewares/eventBusMiddleware.js";
import { auditMiddleware } from "./middlewares/auditMiddleware.js";
import { classifyDbError } from "./lib/errorHandler.js";
import { activityTrackerMiddleware } from "./lib/activityTracker.js";
import { httpMetricsMiddleware } from "./lib/observability.js";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Times every request and feeds the observability metrics (http.requests,
// status-class counters, request-duration histogram). Attaches only a
// `finish` listener — it reads nothing from the request/response body and
// changes no behaviour.
app.use(httpMetricsMiddleware);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

const allowedOrigins: Set<string> = new Set();
if (process.env.REPLIT_DEV_DOMAIN) {
  allowedOrigins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
}
if (process.env.REPLIT_DEPLOYMENT_URL) {
  allowedOrigins.add(process.env.REPLIT_DEPLOYMENT_URL.replace(/\/$/, ""));
}
if (process.env.CORS_ORIGINS) {
  process.env.CORS_ORIGINS.split(",").forEach(o => allowedOrigins.add(o.trim().replace(/\/$/, "")));
}
if (process.env.CORS_ORIGIN) {
  process.env.CORS_ORIGIN.split(",").forEach(s => allowedOrigins.add(s.trim().replace(/\/$/, "")));
}
if (process.env.NODE_ENV !== "production") {
  // In dev, the Replit proxy serves apps on http(s)://localhost (port 80/443),
  // so the browser sends Origin: http://localhost for same-origin XHRs.
  // Allow common dev origins so internal calls (e.g. activity tracking) don't 500.
  allowedOrigins.add("http://localhost");
  allowedOrigins.add("https://localhost");
  allowedOrigins.add("http://localhost:3000");
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://localhost:80");
}

const isProduction = process.env.NODE_ENV === "production";

const replitDevHostPattern: RegExp | null = (() => {
  if (isProduction) return null;
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (!dev) return null;
  const prefix = dev.split(".")[0];
  if (!prefix) return null;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^https://${escaped}\\.(?:[a-z0-9-]+\\.)?(?:repl\\.co|replit\\.dev)$`);
})();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalizedOrigin = origin.replace(/\/$/, "");
    if (allowedOrigins.has(normalizedOrigin)) {
      callback(null, true);
    } else if (replitDevHostPattern && replitDevHostPattern.test(normalizedOrigin)) {
      callback(null, true);
    } else if (!isProduction && allowedOrigins.size === 0) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not in allowlist`));
    }
  },
  credentials: true,
}));
app.use(cookieParser());
// Higher body limit only for import/upload routes that receive large payloads
app.use("/api/umrah/import", express.json({ limit: "50mb" }));
app.use("/api/umrah/assign-bulk", express.json({ limit: "10mb" }));
app.use("/api/storage", express.json({ limit: "10mb" }));
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

app.use(eventBusMiddleware);
app.use(auditMiddleware);
app.use(activityTrackerMiddleware());

// NOTE: A blanket per-IP `globalLimiter` previously sat here on `/api`.
// It violated the per-user rate-limit policy because every authenticated
// request — admin or not, on a shared proxy IP or not — was counted
// against the same per-IP bucket. The replacement lives in routes/index.ts:
//  - `anonymousIpLimiter` is mounted on the truly anonymous routes
//    (/api/auth, /api/portal, /api/public, /api/careers, /api/pdpl) and
//    gives those endpoints the same anonymous-abuse protection.
//  - `globalUserLimiter` is mounted right after authMiddleware as a
//    catch-all per-user budget for every authenticated route, so admins
//    on a shared IP aren't lumped together.
//
// The umrah-specific limiter that previously lived here as well was
// moved into routes/index.ts for the same reason.

app.get("/api/health", async (_req, res) => {
  try {
    const { pool } = await import("./lib/rawdb.js");
    const result = await pool.query("SELECT 1");
    res.json({ status: "ok", db: result.rows.length > 0 ? "connected" : "error", timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected", timestamp: new Date().toISOString() });
  }
});

app.use("/api", router);

// Catch-all for unknown /api/* routes. Must come after the router so real
// handlers win, but before the error handler so 404s don't fall through to
// Express's default HTML response (which breaks JSON clients).
app.use("/api", (req: Request, res: Response) => {
  res.status(404).json({
    error: "المسار غير موجود",
    path: req.originalUrl,
    method: req.method,
  });
});

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  const requestId = randomUUID();
  logger.error({ err, requestId, path: req.originalUrl, method: req.method }, "Unhandled error reached central middleware");
  if (res.headersSent) return next(err);
  const { status, message } = classifyDbError(err);
  const body: Record<string, unknown> = { error: message, requestId };
  if (process.env.NODE_ENV !== "production") {
    body.detail = err?.message ?? String(err);
  }
  res.status(status).json(body);
});

export default app;
