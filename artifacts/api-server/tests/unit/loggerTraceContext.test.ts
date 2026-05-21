import { describe, it, expect, vi, afterEach } from "vitest";
import { trace } from "@opentelemetry/api";
import { logContextMixin } from "../../src/lib/logger.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger — correlation/trace mixin", () => {
  it("returns no fields with no execution context and no active span", () => {
    expect(logContextMixin()).toEqual({});
  });

  it("stamps trace_id/span_id when an OpenTelemetry span is active", () => {
    const span = trace.wrapSpanContext({
      traceId: "0af7651916cd43dd8448eb211c80319c",
      spanId: "b7ad6b7169203331",
      traceFlags: 1,
    });
    vi.spyOn(trace, "getActiveSpan").mockReturnValue(span);

    const out = logContextMixin();
    expect(out.trace_id).toBe("0af7651916cd43dd8448eb211c80319c");
    expect(out.span_id).toBe("b7ad6b7169203331");
  });

  it("omits trace fields for an invalid (all-zero) span context", () => {
    const span = trace.wrapSpanContext({
      traceId: "00000000000000000000000000000000",
      spanId: "0000000000000000",
      traceFlags: 0,
    });
    vi.spyOn(trace, "getActiveSpan").mockReturnValue(span);

    const out = logContextMixin();
    expect(out.trace_id).toBeUndefined();
    expect(out.span_id).toBeUndefined();
  });
});
