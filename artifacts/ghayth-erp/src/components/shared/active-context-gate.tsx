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
            <Link href="/profile/personal">
              <Button variant="ghost" size="sm">
                ضبط التفضيلات
              </Button>
            </Link>
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
