import { describe, it, expect } from "vitest";
import {
  eventBus,
  registerCrossDomainHandler,
  HANDLER_MAX_ATTEMPTS,
  __dlqBufferLength,
} from "../../src/lib/eventBus.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll `pred` every 20ms until true or the timeout elapses. */
async function waitFor(pred: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await sleep(20);
  }
}

describe("eventBus — cross-domain handler retry + DLQ", () => {
  it("retries a transient failure and succeeds without dead-lettering", async () => {
    let calls = 0;
    registerCrossDomainHandler("test.retry.eventual", async () => {
      calls += 1;
      if (calls < 3) throw new Error("transient failure");
    });

    const dlqBefore = __dlqBufferLength();
    eventBus.emit("test.retry.eventual", { companyId: 1 });

    await waitFor(() => calls >= 3, 4000);
    await sleep(60); // settle — ensure no dead-letter follows a success

    expect(calls).toBe(3); // failed twice, succeeded on the 3rd attempt
    expect(__dlqBufferLength()).toBe(dlqBefore); // success → not dead-lettered
  });

  it("dead-letters after HANDLER_MAX_ATTEMPTS exhausted failures", async () => {
    let calls = 0;
    registerCrossDomainHandler("test.retry.exhaust", async () => {
      calls += 1;
      throw new Error("permanent failure");
    });

    const dlqBefore = __dlqBufferLength();
    eventBus.emit("test.retry.exhaust", { companyId: 2 });

    await waitFor(() => __dlqBufferLength() > dlqBefore, 5000);

    expect(calls).toBe(HANDLER_MAX_ATTEMPTS); // tried exactly the max
    expect(__dlqBufferLength()).toBe(dlqBefore + 1); // one DLQ entry
  });

  it("runs a healthy handler exactly once", async () => {
    let calls = 0;
    registerCrossDomainHandler("test.retry.firsttry", async () => {
      calls += 1;
    });

    eventBus.emit("test.retry.firsttry", { companyId: 3 });

    await waitFor(() => calls >= 1, 1000);
    await sleep(60);

    expect(calls).toBe(1); // no needless retry on success
  });
});
