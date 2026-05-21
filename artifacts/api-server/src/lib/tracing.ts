/**
 * OpenTelemetry distributed-tracing bootstrap.
 *
 * INERT BY DEFAULT: the SDK only starts when OTEL_EXPORTER_OTLP_ENDPOINT is
 * set. A deployment without an OTLP collector configured pays zero tracing
 * cost and sees no behaviour change — tracing is strictly opt-in via env.
 *
 * Scope: HTTP and PostgreSQL instrumentation — incoming-request and outbound
 * http/https spans, `pg` query spans, and W3C `traceparent` context
 * propagation. Express route/middleware-layer spans are intentionally not
 * included: the server bundle imports express as an ES module, which OTel can
 * only instrument via its experimental import-in-the-middle loader hook — a
 * process-wide experimental mechanism deferred as a separate increment.
 *
 * Load order: `pg` auto-instrumentation patches the package when it is
 * loaded, so this must run before it is imported. It is started from the
 * `dist/otel.mjs` preload (src/otel.ts), which the `dist/index.mjs` shim
 * imports ahead of the server bundle. `startTracing()` is idempotent
 * across that preload and the server bundle via a process-global SDK handle,
 * so the existing call in index.ts is a harmless no-op once the preload has
 * already started it.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { logger } from "./logger.js";

// The SDK handle lives on globalThis, not in a module-local: the preload
// bundle (dist/otel.mjs) and the server bundle (dist/server.mjs) each carry
// their own copy of this module, and both must observe the same single SDK
// instance — the preload starts it, the server's shutdown path stops it.
const g = globalThis as typeof globalThis & { __ghaythOtelSdk?: NodeSDK };

/**
 * Start tracing. No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is configured, so a
 * misconfigured or collector-less deployment is unaffected. The OTLP exporter
 * reads its endpoint/headers from the standard OTEL_EXPORTER_OTLP_* env vars.
 */
export function startTracing(): void {
  if (g.__ghaythOtelSdk) return;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  try {
    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter(),
      instrumentations: [
        new HttpInstrumentation(),
        new PgInstrumentation(),
      ],
    });
    sdk.start();
    g.__ghaythOtelSdk = sdk;
    logger.info(
      { endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT },
      "OpenTelemetry tracing started",
    );
  } catch (err) {
    g.__ghaythOtelSdk = undefined;
    logger.error(err, "OpenTelemetry tracing failed to start");
  }
}

/** Flush pending spans and stop tracing — called during graceful shutdown. */
export async function stopTracing(): Promise<void> {
  const sdk = g.__ghaythOtelSdk;
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch (err) {
    logger.error(err, "OpenTelemetry tracing shutdown failed");
  } finally {
    g.__ghaythOtelSdk = undefined;
  }
}
