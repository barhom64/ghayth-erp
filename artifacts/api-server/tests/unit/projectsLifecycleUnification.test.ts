import { describe, it, expect } from "vitest";
import { getStateMachine, isValidTransition } from "../../src/lib/lifecycleEngine.js";

// ─── PRJ-P2 — Project lifecycle unified through lifecycleEngine ──────────────
// Before P2, the project transition graph lived in projects.ts as a local
// PROJECT_TRANSITIONS map (validated inline), while POST /projects/:id/close
// drove its transition through applyTransition with a *separate* inline
// fromStates whitelist — two sources that could drift. P2 moves the graph into
// lifecycleEngine's STATE_MACHINES ("projects" / "project_phases") so both the
// PATCH validation and the /close applyTransition (defence-in-depth) consult
// the same machine. These tests pin that single source of truth and prove the
// engine rejects illegal / terminal transitions.

describe("PRJ-P2 — projects state machine is registered in lifecycleEngine", () => {
  it('getStateMachine("projects") resolves a machine', () => {
    const sm = getStateMachine("projects");
    expect(sm).toBeDefined();
    expect(sm!.entity).toBe("projects");
  });

  it("allows the legal lifecycle transitions used by PATCH", () => {
    expect(isValidTransition("projects", "planning", "active")).toBe(true);
    expect(isValidTransition("projects", "active", "on_hold")).toBe(true);
    expect(isValidTransition("projects", "on_hold", "active")).toBe(true);
    expect(isValidTransition("projects", "active", "in_progress")).toBe(true);
    expect(isValidTransition("projects", "in_progress", "blocked")).toBe(true);
  });

  it("allows the active/…/blocked → completed edges that /close drives", () => {
    // /close issues toState "completed" from each of these source states via
    // applyTransition; the machine must permit them or defence-in-depth would
    // reject a legitimate closure.
    for (const from of ["active", "in_progress", "planning", "planned", "on_hold", "draft", "blocked"]) {
      expect(isValidTransition("projects", from, "completed")).toBe(true);
    }
  });

  it("rejects illegal project transitions (the engine prevents the bad state)", () => {
    // Not edges in the graph at all.
    expect(isValidTransition("projects", "active", "planning")).toBe(false);
    expect(isValidTransition("projects", "active", "draft")).toBe(false);
    // active → cancelled is deliberately NOT a PATCH edge (cancellation comes
    // from on_hold/blocked/planning, or the project is closed).
    expect(isValidTransition("projects", "active", "cancelled")).toBe(false);
    // Unknown source / target.
    expect(isValidTransition("projects", "bogus", "active")).toBe(false);
    expect(isValidTransition("projects", "active", "bogus")).toBe(false);
  });

  it("completed and cancelled are terminal — no transition leaves them", () => {
    const sm = getStateMachine("projects")!;
    expect(sm.transitions["completed"]).toEqual([]);
    expect(sm.transitions["cancelled"]).toEqual([]);
    expect(isValidTransition("projects", "completed", "active")).toBe(false);
    expect(isValidTransition("projects", "cancelled", "active")).toBe(false);
  });
});

describe("PRJ-P2 — project_phases state machine is registered in lifecycleEngine", () => {
  it('getStateMachine("project_phases") resolves a machine', () => {
    const sm = getStateMachine("project_phases");
    expect(sm).toBeDefined();
    expect(sm!.entity).toBe("project_phases");
  });

  it("only an in_progress phase may complete (pending must be started first)", () => {
    expect(isValidTransition("project_phases", "in_progress", "completed")).toBe(true);
    expect(isValidTransition("project_phases", "pending", "completed")).toBe(false);
  });

  it("rejects illegal phase transitions and treats completed/cancelled as terminal", () => {
    expect(isValidTransition("project_phases", "completed", "in_progress")).toBe(false);
    expect(isValidTransition("project_phases", "cancelled", "completed")).toBe(false);
    expect(isValidTransition("project_phases", "in_progress", "pending")).toBe(false);
  });
});
