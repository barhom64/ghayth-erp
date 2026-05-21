import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dirname!, "../../src");
const tracing = readFileSync(join(dir, "lib/tracing.ts"), "utf8");
const otel = readFileSync(join(dir, "otel.ts"), "utf8");
const build = readFileSync(join(dir, "../build.mjs"), "utf8");

describe("tracing — OpenTelemetry bootstrap (OBS-6/OBS-9/OBS-10)", () => {
  it("registers HTTP, Express and PostgreSQL instrumentation", () => {
    expect(tracing).toContain("new HttpInstrumentation()");
    expect(tracing).toContain("new ExpressInstrumentation()");
    expect(tracing).toContain("new PgInstrumentation()");
  });

  it("is gated behind OTEL_EXPORTER_OTLP_ENDPOINT (inert by default)", () => {
    expect(tracing).toContain(
      "if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return",
    );
  });

  it("shares the SDK handle across the preload and server bundles", () => {
    expect(tracing).toContain("__ghaythOtelSdk");
  });
});

describe("tracing — preload load order (OBS-9/OBS-10)", () => {
  it("otel.ts preload starts tracing", () => {
    expect(otel).toContain("startTracing()");
  });

  it("otel.ts registers the ESM loader hook behind the tracing gate", () => {
    expect(otel).toContain("process.env.OTEL_EXPORTER_OTLP_ENDPOINT");
    expect(otel).toContain(
      'register("@opentelemetry/instrumentation/hook.mjs"',
    );
  });

  it("build externalises express and pg so they can be instrumented", () => {
    expect(build).toMatch(/external:[\s\S]*"express"/);
    expect(build).toMatch(/external:[\s\S]*"pg"/);
  });

  it("build emits the otel preload entry and the dist/index.mjs shim", () => {
    expect(build).toContain("otel:");
    expect(build).toContain('import "./otel.mjs"');
    expect(build).toContain('await import("./server.mjs")');
  });
});
