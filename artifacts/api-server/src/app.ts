import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
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
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(eventBusMiddleware);
app.use(auditMiddleware);
app.use(activityTrackerMiddleware());

app.use("/api", router);

app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
  logger.error({ err }, "Unhandled error reached central middleware");
  if (res.headersSent) return next(err);
  const { status, message } = classifyDbError(err);
  res.status(status).json({ error: message });
});

export default app;
