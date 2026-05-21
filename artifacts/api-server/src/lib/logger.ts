import pino from "pino";
import { trace, isSpanContextValid } from "@opentelemetry/api";
import { config } from "./config.js";
import { getRequestId } from "./requestContext.js";

/**
 * pino `mixin` — stamps correlation ids onto every log line without touching
 * any of the ~1900 logger call sites:
 *   - `reqId`               the current execution unit (HTTP request, cron run,
 *                           event delivery — see lib/requestContext.ts)
 *   - `trace_id`/`span_id`  the in-flight OpenTelemetry span, so a log line
 *                           links to its distributed trace (OBS-6)
 *
 * `trace.getActiveSpan()` is undefined whenever no OTel SDK is registered, so
 * the trace fields are strictly inert in a deployment with tracing off.
 * Exported for unit testing.
 */
export function logContextMixin(): Record<string, string> {
  const fields: Record<string, string> = {};
  const reqId = getRequestId();
  if (reqId) fields.reqId = reqId;
  const spanCtx = trace.getActiveSpan()?.spanContext();
  if (spanCtx && isSpanContextValid(spanCtx)) {
    fields.trace_id = spanCtx.traceId;
    fields.span_id = spanCtx.spanId;
  }
  return fields;
}

export const logger = pino({
  level: config.logLevel,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  mixin: logContextMixin,
  ...(config.isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
