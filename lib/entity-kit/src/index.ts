// @workspace/entity-kit — Entity-level composables (Phase 1: re-export shim).
//
// See README.md and docs/UNIFICATION_PLAN.md §P8.

// ─── Detail page layouts ──────────────────────────────────────────────
export {
  DetailPageLayout,
} from "../../../artifacts/ghayth-erp/src/components/shared/detail-page-layout";
export type {
  DetailPageLayoutProps,
  DetailStatus,
  RelatedEntity,
  DetailAction,
  ExtraTab,
} from "../../../artifacts/ghayth-erp/src/components/shared/detail-page-layout";

export {
  EntityDetailPage,
} from "../../../artifacts/ghayth-erp/src/components/shared/entity-detail-page";
export type {
  EntityDetailPageProps,
  EntityTab,
  EntityKpi,
  EntityHeaderAction,
} from "../../../artifacts/ghayth-erp/src/components/shared/entity-detail-page";

// ─── Timeline + workflow visualisations ───────────────────────────────
export {
  EntityTimeline,
  ProcessStages,
  CollectionStages,
  WorkflowTimeline,
  SlaStatusBadge,
} from "../../../artifacts/ghayth-erp/src/components/shared/entity-timeline";
export type {
  StageStep,
} from "../../../artifacts/ghayth-erp/src/components/shared/entity-timeline";

// ─── Comments ─────────────────────────────────────────────────────────
export {
  EntityComments,
} from "../../../artifacts/ghayth-erp/src/components/shared/entity-comments";

// ─── Documents ────────────────────────────────────────────────────────
export {
  EntityDocuments,
} from "../../../artifacts/ghayth-erp/src/components/shared/entity-documents";

// ─── Inline edit / delete helpers ─────────────────────────────────────
export {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "../../../artifacts/ghayth-erp/src/components/shared/detail-edit-delete-actions";
export type {
  DetailEditDeleteOptions,
  DetailEditDeleteHook,
  EditFieldDef,
} from "../../../artifacts/ghayth-erp/src/components/shared/detail-edit-delete-actions";
