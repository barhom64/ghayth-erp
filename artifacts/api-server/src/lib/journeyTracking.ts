// ─────────────────────────────────────────────────────────────────────────────
// JOURNEY TRACKING — ربط محرك الرحلات بناقل الأحداث (wiring for journeyEngine)
// ─────────────────────────────────────────────────────────────────────────────
//
// Activates journeyEngine (#1604, under #1594) WITHOUT scattering logic into
// routes and WITHOUT touching the central eventListeners file. It observes the
// existing event bus and advances journey_instances as the events fire.
//
// How it works:
//   - Builds a reverse index from every JOURNEY_DEFINITIONS step's
//     `requiredEvent` -> [{ journeyType, stepKey, isFirst }].
//   - Subscribes one bus handler per distinct requiredEvent.
//   - On the FIRST step's event for an entity, it starts a journey instance;
//     on later events it advances the matching in-progress instance.
//
// The engine itself does NOT enforce ordering — it just marks steps complete
// as their events are observed (see journeyEngine.ts header). This module is
// the observer that feeds it. Idempotent registration (guarded by a flag), so
// it is safe across test/hot-reload.

import { eventBus, type EventName, type EventPayload } from "./eventBus.js";
import {
  JOURNEY_DEFINITIONS,
  startJourney,
  advanceJourney,
  getJourneyProgress,
} from "./journeyEngine.js";
import { logger } from "./logger.js";

interface StepMapping {
  journeyType: string;
  stepKey: string;
}

let _registered = false;

// Per-(journey:entity) serialization. Events for the same journey instance can
// fire near-simultaneously (e.g. invoice.created then invoice.approved); without
// serialization the second handler can run before the first has created the
// instance and its step would be lost. Chaining per key processes them in order.
const chains = new Map<string, Promise<void>>();
function enqueue(key: string, fn: () => Promise<void>): void {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(fn).catch((err) => logger.error(err, "[journeyTracking] handler error"));
  chains.set(key, next.finally(() => { if (chains.get(key) === next) chains.delete(key); }));
}

export function registerJourneyTracking(): void {
  if (_registered) return;
  _registered = true;

  // requiredEvent -> mappings
  const index = new Map<string, StepMapping[]>();
  for (const def of JOURNEY_DEFINITIONS) {
    for (const step of def.steps) {
      if (!step.requiredEvent) continue;
      const arr = index.get(step.requiredEvent) ?? [];
      arr.push({ journeyType: def.type, stepKey: step.key });
      index.set(step.requiredEvent, arr);
    }
  }

  for (const [eventName, mappings] of index) {
    eventBus.on(eventName as EventName, (payload: EventPayload) => {
      void handleEvent(mappings, payload);
    });
  }

  logger.info(`[journeyTracking] wired ${index.size} event type(s) across ${JOURNEY_DEFINITIONS.length} journeys`);
}

async function handleEvent(mappings: StepMapping[], payload: EventPayload): Promise<void> {
  const companyId = Number(payload.companyId);
  if (!Number.isFinite(companyId) || companyId <= 0) return;
  const entityType = typeof payload.entity === "string" ? payload.entity : undefined;
  const entityIdRaw = (payload as Record<string, unknown>).entityId;
  const entityId = entityIdRaw != null && Number.isFinite(Number(entityIdRaw)) ? Number(entityIdRaw) : undefined;

  for (const m of mappings) {
    const key = `${companyId}:${m.journeyType}:${entityType ?? ""}:${entityId ?? ""}`;
    enqueue(key, async () => {
      // Order-independent: ensure an in-progress instance exists for this
      // entity (start it on whichever step's event arrives first), then mark
      // the step. Serialized per key so concurrent events never double-start.
      const existing = await getJourneyProgress(companyId, m.journeyType, entityType, entityId);
      if (!existing || existing.status !== "in_progress") {
        await startJourney(companyId, m.journeyType, entityType, entityId);
      }
      await advanceJourney(companyId, m.journeyType, m.stepKey, entityType, entityId);
    });
  }
}
