import { describe, it, expect } from "vitest";
import { getRequestId, runWithCorrelationId } from "../../src/lib/requestContext.js";

describe("requestContext — correlation context", () => {
  it("has no correlation id outside any context", () => {
    expect(getRequestId()).toBeUndefined();
  });

  it("exposes the id inside runWithCorrelationId", () => {
    const seen = runWithCorrelationId("job-1", () => getRequestId());
    expect(seen).toBe("job-1");
  });

  it("returns the callback's value", () => {
    expect(runWithCorrelationId("job-2", () => 42)).toBe(42);
  });

  it("clears the context once the callback returns", () => {
    runWithCorrelationId("job-3", () => getRequestId());
    expect(getRequestId()).toBeUndefined();
  });

  it("isolates nested contexts and restores the outer id", () => {
    const result = runWithCorrelationId("outer", () => {
      const inner = runWithCorrelationId("inner", () => getRequestId());
      return { inner, afterInner: getRequestId() };
    });
    expect(result.inner).toBe("inner");
    expect(result.afterInner).toBe("outer");
  });

  it("carries the id across async continuations", async () => {
    const seen = await runWithCorrelationId("async-job", async () => {
      await Promise.resolve();
      await new Promise((r) => setTimeout(r, 1));
      return getRequestId();
    });
    expect(seen).toBe("async-job");
  });

  it("keeps concurrent contexts independent", async () => {
    const [a, b] = await Promise.all([
      runWithCorrelationId("ctx-a", async () => {
        await new Promise((r) => setTimeout(r, 5));
        return getRequestId();
      }),
      runWithCorrelationId("ctx-b", async () => {
        await new Promise((r) => setTimeout(r, 1));
        return getRequestId();
      }),
    ]);
    expect(a).toBe("ctx-a");
    expect(b).toBe("ctx-b");
  });
});
