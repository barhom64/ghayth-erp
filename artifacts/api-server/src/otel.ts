/**
 * OpenTelemetry tracing preload entry.
 *
 * Built to `dist/otel.mjs` and imported FIRST by the `dist/index.mjs` shim
 * (see build.mjs), ahead of the server bundle.
 *
 * Why a separate preload: OpenTelemetry auto-instrumentation patches a module
 * (`http`/`https`, `express`, `pg`) when it is first loaded, so tracing must
 * initialise before those modules are imported. The server bundle hoists its
 * imports above all of its own code, so an in-bundle init runs too late. This
 * file runs to completion first — registering OTel's ESM loader hook and
 * installing the instrumentation hooks — before the server bundle is
 * dynamically imported.
 *
 * INERT unless OTEL_EXPORTER_OTLP_ENDPOINT is set — see lib/tracing.ts. The
 * loader hook is registered behind the same gate, so a deployment with
 * tracing off pays zero loader-hook cost.
 */
import { register } from "node:module";
import { startTracing } from "./lib/tracing.js";
import { config } from "./lib/config.js";

if (config.otelExporterEndpoint) {
  // The server bundle imports express as an ES module; OTel can only patch an
  // ES-module package when its import-in-the-middle loader hook is registered
  // before that bundle is imported.
  register("@opentelemetry/instrumentation/hook.mjs", import.meta.url);
}

startTracing();
