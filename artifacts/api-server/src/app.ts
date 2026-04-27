import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import { randomUUID } from "node:crypto";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { eventBusMiddleware } from "./middlewares/eventBusMiddleware.js";
import { auditMiddleware } from "./middlewares/auditMiddleware.js";
import { classifyDbError } from "./lib/errorHandler.js";
import { activityTrackerMiddleware } from "./lib/activityTracker.js";

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
if (allowedOrigins.size === 0 && process.env.NODE_ENV === "development") {
  allowedOrigins.add("http://localhost:3000");
  allowedOrigins.add("http://localhost:5173");
}

const isProduction = process.env.NODE_ENV === "production";
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const normalizedOrigin = origin.replace(/\/$/, "");
    if (allowedOrigins.has(normalizedOrigin)) {
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
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

app.use(eventBusMiddleware);
app.use(auditMiddleware);
app.use(activityTrackerMiddleware());

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى للطلبات. يرجى المحاولة لاحقاً" },
  validate: { ip: false, trustProxy: false },
  skip: (req) => req.path === "/api/health",
});
app.use("/api", globalLimiter);

const umrahLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "تم تجاوز الحد الأقصى لطلبات العمرة. يرجى المحاولة لاحقاً" },
  validate: { ip: false, trustProxy: false },
});
app.use("/api/umrah", umrahLimiter);

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
