import pino from "pino";
import { config } from "./config.js";
import { getRequestId } from "./requestContext.js";

export const logger = pino({
  level: config.logLevel,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  // Stamps the request correlation id onto every log line emitted within a
  // request, without touching any of the ~1900 logger call sites.
  mixin() {
    const reqId = getRequestId();
    return reqId ? { reqId } : {};
  },
  ...(config.isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
