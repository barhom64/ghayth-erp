// @workspace/report-kit — Print + export (Phase 1: re-export shim).
//
// See README.md and docs/UNIFICATION_PLAN.md §P8.

// ─── Print primitives ─────────────────────────────────────────────────
export {
  PrintDocument,
  PrintPreviewModal,
  PrintActions,
  directPrint,
  LetterheadHeader,
  LetterheadFooter,
} from "../../../artifacts/ghayth-erp/src/components/print-layout";
export type {
  BranchLetterhead,
} from "../../../artifacts/ghayth-erp/src/components/print-layout";

// ─── Entity-aware print ───────────────────────────────────────────────
export {
  EntityPrintButton,
  PrintSections,
} from "../../../artifacts/ghayth-erp/src/components/shared/entity-print";
export type {
  PrintSection,
} from "../../../artifacts/ghayth-erp/src/components/shared/entity-print";

// ─── Export buttons ───────────────────────────────────────────────────
export {
  ExportButton,
  MultiExportButton,
} from "../../../artifacts/ghayth-erp/src/components/shared/export-buttons";
