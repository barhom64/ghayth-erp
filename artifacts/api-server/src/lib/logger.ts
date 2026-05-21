import pino from "pino";
import { trace, isSpanContextValid } from "@opentelemetry/api";
import { config } from "./config.js";
import { getRequestId } from "./requestContext.js";

export const logger = pino({
  level: config.logLevel,
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  // Stamps correlation ids onto every log line without touching any of the
  // ~1900 logger call sites:
  //  - `reqId`   — the request correlation id (AsyncLocalStorage, lib/requestContext).
  //  - `trace_id`/`span_id` — the active OpenTelemetry span, so a log line can
  //    be pivoted to its distributed trace.
  // The OTel lookup is inert when tracing is off (lib/tracing.ts only starts
  // the SDK when OTEL_EXPORTER_OTLP_ENDPOINT is set): with no SDK registered
  // `getActiveSpan()` returns undefined, so no `trace_id` is emitted and
  // behaviour is unchanged.
  mixin() {
    const reqId = getRequestId();
    const fields: Record<string, string> = reqId ? { reqId } : {};
    const span = trace.getActiveSpan();
    if (span) {
      const sc = span.spanContext();
      if (isSpanContextValid(sc)) {
        fields.trace_id = sc.traceId;
        fields.span_id = sc.spanId;
      }
    }
    return fields;
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
