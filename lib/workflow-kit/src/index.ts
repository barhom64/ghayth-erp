// @workspace/workflow-kit — Approvals + lifecycle (Phase 1: re-export shim).
//
// See README.md and docs/UNIFICATION_PLAN.md §P8.

// ─── Approval actions ─────────────────────────────────────────────────
export {
  ApprovalActions,
  ActionHistory,
  NotesDisplay,
} from "../../../artifacts/ghayth-erp/src/components/approval-actions";
export type {
  ApprovalActionType,
  ApprovalActionsProps,
  ActionHistoryProps,
  NotesDisplayProps,
} from "../../../artifacts/ghayth-erp/src/components/approval-actions";

// ─── Approval timeline ────────────────────────────────────────────────
export {
  ApprovalTimeline,
} from "../../../artifacts/ghayth-erp/src/components/shared/approval-timeline";

// ─── Lifecycle action hook (P1.5) ─────────────────────────────────────
export {
  useLifecycleAction,
} from "../../../artifacts/ghayth-erp/src/hooks/use-lifecycle-action";
export type {
  LifecycleActionOptions,
  RunOptions,
  LifecycleHandle,
} from "../../../artifacts/ghayth-erp/src/hooks/use-lifecycle-action";
