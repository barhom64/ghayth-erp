import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eventBus } from "../../src/lib/eventBus.js";
import { config } from "../../src/lib/config.js";

// ─── P2 (finding #2 completion) — dispatch-source switch ────────────────────
//
// OUTBOX_SOLE_DISPATCHER makes eventBus.emit() capture to the outbox ONLY
// (no in-process super.emit), so the relay becomes the sole dispatcher.
// This is what makes the worker / API split correct: the API
// (API_ONLY=true, no listeners) emits → outbox; the worker
// (OUTBOX_RELAY_ACTIVE=true) drains → dispatches once.
//
// config is a plain (non-frozen) object built once at import, so these
// tests flip config.outboxSoleDispatcher at runtime and restore it in
// afterEach — exercising the real branch in emit() without module mocking.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const CONFIG = read("artifacts/api-server/src/lib/config.ts");
const EVENT_BUS = read("artifacts/api-server/src/lib/eventBus.ts");
const RELAY = read("artifacts/api-server/src/lib/outboxRelay.ts");

const TEST_EVENT = "test.dispatch.switch" as const;

describe("config — OUTBOX_SOLE_DISPATCHER flag", () => {
  it("declares the env var with a safe default of false", () => {
    expect(CONFIG).toContain("OUTBOX_SOLE_DISPATCHER: boolEnv(false)");
  });

  it("exposes config.outboxSoleDispatcher (boolean) and wires the env value", () => {
    expect(CONFIG).toMatch(/readonly outboxSoleDispatcher:\s*boolean/);
    expect(CONFIG).toContain("outboxSoleDispatcher: env.OUTBOX_SOLE_DISPATCHER");
  });

  it("defaults to false at runtime (unchanged single-process behaviour)", () => {
    expect(config.outboxSoleDispatcher).toBe(false);
  });
});

describe("eventBus.emit honours the dispatch-source switch", () => {
  const original = config.outboxSoleDispatcher;

  afterEach(() => {
    (config as { outboxSoleDispatcher: boolean }).outboxSoleDispatcher = original;
    eventBus.removeAllListeners(TEST_EVENT);
  });

  it("in-process mode (flag off): emit fires listeners synchronously", () => {
    (config as { outboxSoleDispatcher: boolean }).outboxSoleDispatcher = false;
    let fired = 0;
    eventBus.on(TEST_EVENT, () => { fired++; });
    eventBus.emit(TEST_EVENT, { companyId: 1 });
    expect(fired).toBe(1);
  });

  it("sole-dispatch mode (flag on): emit does NOT fire in-process listeners", () => {
    (config as { outboxSoleDispatcher: boolean }).outboxSoleDispatcher = true;
    let fired = 0;
    eventBus.on(TEST_EVENT, () => { fired++; });
    const hadListeners = eventBus.emit(TEST_EVENT, { companyId: 1 });
    // Listener must NOT run — the relay will dispatch it later.
    expect(fired).toBe(0);
    // Return value still reflects whether a listener is registered.
    expect(hadListeners).toBe(true);
  });

  it("dispatchFromOutbox always fires listeners regardless of the flag", () => {
    // The relay path must dispatch even in sole-dispatch mode — otherwise
    // nothing would ever run the listeners.
    (config as { outboxSoleDispatcher: boolean }).outboxSoleDispatcher = true;
    let fired = 0;
    eventBus.on(TEST_EVENT, () => { fired++; });
    eventBus.dispatchFromOutbox(TEST_EVENT, { companyId: 1 });
    expect(fired).toBe(1);
  });
});

describe("emit() source — the switch is implemented at the chokepoint", () => {
  it("emit() branches on config.outboxSoleDispatcher and returns via listenerCount (no super.emit)", () => {
    // The sole-dispatch branch must return `this.listenerCount(...)` so it
    // never reaches the fallback super.emit at the end of emit().
    expect(EVENT_BUS).toMatch(
      /if \(config\.outboxSoleDispatcher\)\s*\{[\s\S]{0,300}?return this\.listenerCount\(event\) > 0;\s*\n\s*\}/,
    );
  });

  it("super.emit remains the fallback dispatcher when the flag is off", () => {
    // The in-process path is preserved for the default single-process mode.
    const emitIdx = EVENT_BUS.indexOf("emit(event: EventName");
    const body = EVENT_BUS.slice(emitIdx, emitIdx + 1200);
    const branchIdx = body.indexOf("if (config.outboxSoleDispatcher)");
    const fallbackIdx = body.lastIndexOf("return super.emit(event, stamped);");
    expect(branchIdx).toBeGreaterThan(-1);
    expect(fallbackIdx).toBeGreaterThan(branchIdx); // fallback comes AFTER the branch
  });

  it("relay start log distinguishes sole-dispatch vs the double-dispatch hazard", () => {
    expect(RELAY).toContain("config.outboxSoleDispatcher");
    expect(RELAY).toContain("sole dispatcher");
    // The hazard warning is retained for the flag-off case.
    expect(RELAY).toContain("WILL double-dispatch");
  });
});
