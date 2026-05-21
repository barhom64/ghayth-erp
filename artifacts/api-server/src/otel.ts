/**
 * OpenTelemetry tracing preload entry.
 *
 * Built to `dist/otel.mjs` and imported FIRST by the `dist/index.mjs` shim
 * (see build.mjs), ahead of the server bundle.
 *
 * Why a separate preload: OpenTelemetry auto-instrumentation patches a module
 * (`http`/`https`, `pg`) when it is first loaded, so tracing must initialise
 * before those modules are imported. The server bundle hoists its imports
 * above all of its own code, so an in-bundle init runs too late. This file
 * runs to completion first — installing the instrumentation hooks — before
 * the server bundle is dynamically imported.
 *
 * INERT unless OTEL_EXPORTER_OTLP_ENDPOINT is set — see lib/tracing.ts.
 */
import { startTracing } from "./lib/tracing.js";

startTracing();
