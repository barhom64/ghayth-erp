/**
 * OpenTelemetry distributed-tracing bootstrap.
 *
 * INERT BY DEFAULT: the SDK only starts when OTEL_EXPORTER_OTLP_ENDPOINT is
 * set. A deployment without an OTLP collector configured pays zero tracing
 * cost and sees no behaviour change — tracing is strictly opt-in via env.
 *
 * Scope: HTTP instrumentation only — incoming-request spans, outbound
 * http/https spans, and W3C `traceparent` context propagation. express/pg
 * spans would additionally require those packages to be esbuild-externalised
 * in build.mjs (they are bundled today); that is a separate, deliberate build
 * change and is intentionally not made here.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { logger } from "./logger.js";

let sdk: NodeSDK | null = null;

/**
 * Start tracing. No-op unless OTEL_EXPORTER_OTLP_ENDPOINT is configured, so a
 * misconfigured or collector-less deployment is unaffected. The OTLP exporter
 * reads its endpoint/headers from the standard OTEL_EXPORTER_OTLP_* env vars.
 */
export function startTracing(): void {
  if (sdk) return;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  try {
    sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter(),
      instrumentations: [new HttpInstrumentation()],
    });
    sdk.start();
    logger.info(
      { endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT },
      "OpenTelemetry tracing started",
    );
  } catch (err) {
    sdk = null;
    logger.error(err, "OpenTelemetry tracing failed to start");
  }
}

/** Flush pending spans and stop tracing — called during graceful shutdown. */
export async function stopTracing(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
  } catch (err) {
    logger.error(err, "OpenTelemetry tracing shutdown failed");
  } finally {
    sdk = null;
  }
}
