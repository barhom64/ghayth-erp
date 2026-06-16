/**
 * HR-Wave-0 / step 0.1 — Active Context Gate.
 *
 * Wraps `CreatePageLayout` so no HR (or any other) create form ever
 * renders without a fully-resolved active context:
 *   - active company (scope.companyId)
 *   - active branch  (scope.branchId)
 *   - active role    (scope.role / selectedRoleKey)
 *
 * When the inputter has multiple assignments and hasn't narrowed them
 * down, the gate stops rendering the form and shows a short, calm
 * instruction to pick one (company + branch + role). This matches the
 * IGOC governing principle — every action runs under exactly ONE
 * active context, never under "all of my assignments at once".
 *
 * Important distinction (مدخِل vs موضوع):
 *   - active context belongs to the USER FILLING THE FORM (المدخِل).
 *   - subject data (the new employee's department/job-title/role) is
 *     captured by the form's own fields — never inherited from the
 *     inputter's active context.
 * The gate guards the FORMER only.
 *
 * Reuse, don't invent: the gate consumes existing `useAuth()` +
 * `useAppContext()` selectors; it does not introduce a new context
 * concept. The auth + RBAC plumbing already established by IGOC-001
 * carries the resolved scope to the backend via JWT + `x-selected-role`.
 */
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useAppContext } from "@/contexts/app-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ShieldCheck, Building2, GitBranch } from "lucide-react";

interface ActiveContextGateProps {
  children: React.ReactNode;
  /**
   * Optional override: when a create page wants to allow rendering
   * without an active branch (e.g. a tenant-level admin form that
   * doesn't write to a branch), it can opt out. Default = strict.
   */
  requireBranch?: boolean;
}

export function ActiveContextGate({
  children,
  requireBranch = true,
}: ActiveContextGateProps) {
  const [, setLocation] = useLocation();
  const { assignments } = useAuth();
  const {
    selectedRole,
    selectedCompanyIds,
    selectedBranchIds,
    companies,
    branches,
  } = useAppContext();

  const hasRole = !!selectedRole?.roleKey;
  const hasCompany = selectedCompanyIds.length > 0;
  const hasBranch = selectedBranchIds.length > 0;
  const multipleAssignments = assignments.length > 1;

  if (hasRole && hasCompany && (!requireBranch || hasBranch)) {
    return <>{children}</>;
  }

  const missing: string[] = [];
  if (!hasCompany) missing.push("شركة");
  if (requireBranch && !hasBranch) missing.push("فرع");
  if (!hasRole) missing.push("دور");

  const activeCompany = companies.find((c) => selectedCompanyIds.includes(c.id));
  const activeBranch = branches.find((b) => selectedBranchIds.includes(b.id));

  return (
    <div className="max-w-2xl mx-auto py-12">
      <Card data-testid="active-context-gate-block">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="w-5 h-5" />
            يحتاج النظام إلى سياق نشط قبل الإدخال
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            كل عملية في غيث تُنفَّذ تحت <strong>سياق واحد فعّال</strong>: شركة
            واحدة + فرع واحد + دور واحد. هذا يضمن أن السجل يُكتب في المكان
            الصحيح، وأن الصلاحيات تُطبَّق على المعنى الصحيح.
            {multipleAssignments && (
              <>
                {" "}لديك <strong>{assignments.length} تعيين</strong> — اختر
                واحداً من أعلى الصفحة قبل المتابعة.
              </>
            )}
          </p>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
            <ContextRow
              icon={<Building2 className="w-4 h-4" />}
              label="الشركة"
              value={activeCompany?.name ?? null}
              missing={!hasCompany}
            />
            {requireBranch && (
              <ContextRow
                icon={<GitBranch className="w-4 h-4" />}
                label="الفرع"
                value={activeBranch?.name ?? null}
                missing={!hasBranch}
              />
            )}
            <ContextRow
              icon={<ShieldCheck className="w-4 h-4" />}
              label="الدور"
              value={selectedRole?.label ?? null}
              missing={!hasRole}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            ينقصك: <strong>{missing.join("، ")}</strong>. اختر القيم من أعلى
            الصفحة (مبدّل الشركة / الفرع / الدور)، ثم عُد إلى هذه الشاشة.
          </p>

          <div className="flex gap-2 pt-2">
            <Button variant="default" size="sm" onClick={() => setLocation("/")}>
              العودة إلى الرئيسية
            </Button>
            <Button asChild variant="ghost" size="sm"><Link href="/profile/personal">
                ضبط التفضيلات
              </Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ContextRow({
  icon,
  label,
  value,
  missing,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  missing: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2"
      data-context-row={label}
      data-context-missing={missing}
    >
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span
        className={
          missing
            ? "text-amber-700 font-semibold"
            : "text-foreground font-medium"
        }
      >
        {value ?? "— غير محدّد —"}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Finance-specific inline notice (kept alongside the generic gate
// above so callers can import either flavour from one path). Pre-dates
// the Wave-0.1 generic gate and is consumed by finance create forms
// (customer-receipt, expenses-create, invoices-create, vouchers-create,
// purchase-orders-create, allocation-rule-create, customer-advances-
// create, journal-quick-templates).
//
// Doctrine line: both APIs serve the SAME doctrine — «لا إدخال بلا
// سياق نشط واحد». The gate is the strict version that blocks the
// whole form; the notice is the soft inline variant that pairs with
// `!ready` to disable the save button without unmounting the form.
// ────────────────────────────────────────────────────────────────────

export interface ActiveFinanceContext {
  /** True when exactly one active branch is in scope — entry is allowed. */
  ready: boolean;
  /** The active branch's company (derived), when resolvable. */
  companyId: number | null;
  /** The single active branch, or null when none/multiple are selected. */
  branchId: number | null;
  /** Arabic notice to show when not ready. */
  message: string | null;
}

/**
 * Resolve the entering user's active finance context. Entry is "ready" only
 * when a single active branch is chosen (selectedBranchId). A single branch
 * implies a single company, so the record lands in one unambiguous scope.
 */
export function useActiveFinanceContext(): ActiveFinanceContext {
  const { selectedBranchId, selectedCompanyIds, filteredBranches } = useAppContext();
  const branchId = selectedBranchId ?? null;
  if (branchId == null) {
    return {
      ready: false,
      companyId: selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : null,
      branchId: null,
      message: "اختر فرعًا واحدًا نشطًا قبل الإدخال المالي — سياق المدخِل (الفرع/الشركة) يحدّد مكان السجل وصلاحيته.",
    };
  }
  const branch = filteredBranches.find((b) => b.id === branchId);
  const companyId = branch?.companyId ?? (selectedCompanyIds.length === 1 ? selectedCompanyIds[0] : null);
  return { ready: true, companyId, branchId, message: null };
}

/**
 * Inline notice rendered at the top of a finance create form when the entering
 * user's active context isn't a single branch. Pair it with disabling «حفظ»
 * via `useActiveFinanceContext().ready` so nothing is saved into an ambiguous
 * scope.
 */
export function ActiveContextNotice({ ctx }: { ctx?: ActiveFinanceContext }) {
  const fallback = useActiveFinanceContext();
  const c = ctx ?? fallback;
  if (c.ready) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-status-warning-surface bg-status-warning-surface px-4 py-3 text-sm text-status-warning-foreground">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <span>{c.message}</span>
    </div>
  );
}
