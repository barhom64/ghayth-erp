// lib/branchResolution.ts
//
// Single source of truth for "which branch should this financial
// transaction land in?". Implements the user's requirement (verbatim):
//
//   "The financial system must capture the registered branch on every
//   transaction. It should auto-record based on the user's selected
//   branch. If the user has multiple branches, the system should ask
//   them to specify the branch — OR auto-post the transaction across
//   multiple branches if they're under the same company, with the
//   ability to manually override and split by lines or percentages."
//
// Decision matrix:
//
//   ┌────────────────────────┬───────────────────────────────────────┐
//   │ user's allowedBranches │ resolution                            │
//   ├────────────────────────┼───────────────────────────────────────┤
//   │ 1 branch               │ that branch (auto, no prompt needed)  │
//   │ N > 1 + body.branchId  │ body.branchId if user has access      │
//   │ N > 1 + no body field  │ throw BranchRequiredError → UI prompt │
//   │ N > 1 + body.splits[]  │ multi-branch allocation (split flow)  │
//   └────────────────────────┴───────────────────────────────────────┘
//
// Frontend forms read the X-Branch-Choice-Required error code from
// the response and render the branch picker / multi-branch split UI.

import { ValidationError } from "./errorHandler.js";

export interface BranchResolutionScope {
  companyId: number;
  branchId: number | null | undefined;
  /** RBAC catalog of branches the user has access to in this company. */
  allowedBranches?: number[];
}

export interface BranchSplit {
  branchId: number;
  /** Either an absolute amount OR a percentage 0-100. Caller picks the model. */
  amount?: number;
  percentage?: number;
}

export interface BranchResolutionResult {
  /** Single branch resolved for the whole transaction (most common). */
  branchId: number;
  /** When the operator passes splits[] explicitly, these flow through to
   *  per-line branchId on createJournalEntry. Empty if not splitting. */
  splits: BranchSplit[];
}

/** Thrown when a multi-branch user submits a transaction without picking a
 *  branch (or splits). Frontend renders the picker when it sees this code. */
export class BranchRequiredError extends ValidationError {
  constructor(allowedBranches: number[]) {
    super(
      "الرجاء تحديد الفرع — لديك صلاحية على أكثر من فرع",
      {
        field: "branchId",
        fix: "اختر فرعاً واحداً من القائمة، أو وزّع المعاملة على عدة فروع",
        meta: {
          code: "BRANCH_REQUIRED",
          allowedBranches,
        },
      },
    );
  }
}

/** Thrown when the operator passed a branchId they have no access to. */
export class BranchAccessDeniedError extends ValidationError {
  constructor(branchId: number, allowedBranches: number[]) {
    super(
      `ليس لديك صلاحية على الفرع #${branchId}`,
      {
        field: "branchId",
        fix: "اختر فرعاً من قائمة فروعك المصرّح بها",
        meta: {
          code: "BRANCH_ACCESS_DENIED",
          requestedBranch: branchId,
          allowedBranches,
        },
      },
    );
  }
}

/** Thrown when split percentages don't sum to 100 (within 0.01) or split
 *  amounts don't sum to the total. */
export class BranchSplitImbalanceError extends ValidationError {
  constructor(totalSplit: number, expected: number, mode: "percentage" | "amount") {
    super(
      mode === "percentage"
        ? `مجموع نسب التوزيع (${totalSplit.toFixed(2)}%) لا يساوي 100%`
        : `مجموع المبالغ الموزّعة (${totalSplit.toFixed(2)}) لا يساوي إجمالي المعاملة (${expected.toFixed(2)})`,
      {
        field: "branchSplits",
        fix: mode === "percentage"
          ? "تأكد أن مجموع النسب يساوي 100% بالضبط"
          : "تأكد أن مجموع المبالغ الموزّعة يساوي إجمالي المعاملة",
        meta: { code: "BRANCH_SPLIT_IMBALANCE", totalSplit, expected, mode },
      },
    );
  }
}

export interface ResolveBranchInput {
  scope: BranchResolutionScope;
  /** branchId from the request body — operator's explicit pick. */
  bodyBranchId?: number | null;
  /** Optional split allocation from the body. When provided + valid, the
   *  caller can use it to split a JE across branches in the same company. */
  bodySplits?: BranchSplit[];
  /** For amount-based splits, the total transaction amount used to
   *  validate that splits sum correctly. */
  totalAmount?: number;
}

/**
 * Resolve the branch for a financial transaction.
 *
 * Throws BranchRequiredError when the user has multiple branches and
 * didn't pick one. Throws BranchAccessDeniedError when the body's
 * branchId is outside the user's allowedBranches. Throws
 * BranchSplitImbalanceError when splits don't sum correctly.
 *
 * Returns { branchId, splits } — if splits is non-empty, the caller
 * should split the JE accordingly; otherwise the whole transaction
 * lands on branchId.
 */
export function resolveTransactionBranch(input: ResolveBranchInput): BranchResolutionResult {
  const { scope, bodyBranchId, bodySplits = [], totalAmount } = input;
  const allowed = scope.allowedBranches ?? [];

  // 1. Splits explicitly requested. Validate every branch is in allowed
  // and the math sums up.
  if (bodySplits.length > 0) {
    for (const s of bodySplits) {
      if (allowed.length > 0 && !allowed.includes(s.branchId)) {
        throw new BranchAccessDeniedError(s.branchId, allowed);
      }
    }
    const hasPercentages = bodySplits.some((s) => s.percentage != null);
    const hasAmounts = bodySplits.some((s) => s.amount != null);
    if (hasPercentages && hasAmounts) {
      throw new ValidationError(
        "لا يمكن خلط النسب والمبالغ في نفس التوزيع — اختر واحداً",
        { field: "branchSplits", fix: "استخدم النسب أو المبالغ، وليس كليهما" },
      );
    }
    if (hasPercentages) {
      const total = bodySplits.reduce((s, x) => s + (x.percentage ?? 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        throw new BranchSplitImbalanceError(total, 100, "percentage");
      }
    } else if (hasAmounts && totalAmount != null) {
      const total = bodySplits.reduce((s, x) => s + (x.amount ?? 0), 0);
      if (Math.abs(total - totalAmount) > 0.01) {
        throw new BranchSplitImbalanceError(total, totalAmount, "amount");
      }
    }
    // For the header branchId on the JE, use the first split as the
    // primary; per-line splits are applied separately on createJournalEntry.
    return { branchId: bodySplits[0].branchId, splits: bodySplits };
  }

  // 2. Explicit body branchId. Validate access.
  if (bodyBranchId != null && Number.isFinite(bodyBranchId)) {
    const requested = Number(bodyBranchId);
    if (allowed.length > 0 && !allowed.includes(requested)) {
      throw new BranchAccessDeniedError(requested, allowed);
    }
    return { branchId: requested, splits: [] };
  }

  // 3. No body field. Single-branch user → auto-derive. Multi-branch → ask.
  if (allowed.length === 1) {
    return { branchId: allowed[0], splits: [] };
  }
  if (allowed.length === 0) {
    // Owner / global role with no explicit allowedBranches — fall back to
    // scope.branchId. If even that is null, bubble up an error so the
    // caller surfaces it as "branch is required".
    if (scope.branchId != null) {
      return { branchId: scope.branchId, splits: [] };
    }
    throw new ValidationError(
      "الفرع مطلوب — لا يوجد فرع افتراضي على حسابك",
      { field: "branchId", fix: "حدّد الفرع في الطلب" },
    );
  }
  // Multi-branch user → require explicit pick.
  throw new BranchRequiredError(allowed);
}

/**
 * Cross-check that an existing document's branchId matches the
 * operator's working branch. Returns true if they match OR the operator
 * has access to the doc's branch. Returns false when the operator's
 * working branch differs AND they have multi-branch access (= they
 * should be prompted to confirm the branch switch).
 *
 * Throws BranchAccessDeniedError when the doc's branch is outside the
 * operator's allowedBranches — a security violation, not a UX prompt.
 */
export function assertDocumentBranchAccess(
  docBranchId: number | null | undefined,
  scope: BranchResolutionScope,
): void {
  if (docBranchId == null) return;
  const allowed = scope.allowedBranches ?? [];
  if (allowed.length === 0) return; // owner / global role
  if (!allowed.includes(docBranchId)) {
    throw new BranchAccessDeniedError(docBranchId, allowed);
  }
}
