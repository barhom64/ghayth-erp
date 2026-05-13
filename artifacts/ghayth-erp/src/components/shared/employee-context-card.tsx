import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import {
  User, Building, Briefcase, UserCheck, DollarSign, Calendar,
  Banknote, AlertTriangle, CalendarDays, TrendingUp, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type EmployeeContextSection = "loans" | "leaves" | "violations" | "overtime";

export interface EmployeeContextCardProps {
  /** Person-level employee id (employees.id). Set to empty string/null when no employee selected. */
  employeeId: string | number | null | undefined;
  /** Additional section to emphasize (past loans, recent violations, etc.) */
  section?: EmployeeContextSection;
  className?: string;
}

interface EmployeeDetail {
  id: number;
  name: string;
  empNumber: string;
  status: string;
  jobTitle: string;
  branchName?: string;
  departmentName?: string;
  managerName?: string;
  salary?: number | string;
  hireDate?: string;
  loans?: Array<{
    id: number;
    loanNumber: string;
    amount: number | string;
    remainingAmount: number | string;
    installmentAmount: number | string;
    installmentCount: number;
    status: string;
  }>;
  leaves?: Array<{
    id: number;
    status: string;
    startDate: string;
    endDate: string;
    days: number;
    leaveTypeName: string;
  }>;
  violations?: Array<{
    id: number;
    type: string;
    description?: string;
    severity?: string;
    deduction?: number | string;
    period?: string;
    createdAt: string;
  }>;
  overtime?: Array<{
    id: number;
    requestNumber: string;
    overtimeDate: string;
    hours: number | string;
    totalAmount: number | string;
    status: string;
  }>;
}

/**
 * Shows rich employee context when an employee is selected in a form.
 * Replaces the "dead forms" pattern — instead of just a dropdown with
 * a name, every HR form gets empNumber, department, branch, manager,
 * salary, status, plus context-specific data (past loans, recent
 * violations, open leaves) pulled from /employees/:id.
 */
export function EmployeeContextCard({
  employeeId,
  section,
  className,
}: EmployeeContextCardProps) {
  const hasId = employeeId !== null && employeeId !== undefined && String(employeeId).trim() !== "";
  const { data, isLoading } = useApiQuery<EmployeeDetail>(
    ["employee-context", String(employeeId ?? "")],
    hasId ? `/employees/${employeeId}` : null,
    { enabled: hasId },
  );

  if (!hasId) return null;

  if (isLoading) {
    return (
      <Card className={cn("border-border bg-surface-subtle/50 animate-pulse", className)}>
        <CardContent className="p-4">
          <div className="h-4 w-32 bg-gray-200 rounded mb-3" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-16 bg-gray-200 rounded" />
                <div className="h-4 w-24 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const salary = Number(data.salary || 0);
  const activeLoans = (data.loans || []).filter((l) => l.status === "active" || l.status === "approved");
  const totalRemainingLoans = activeLoans.reduce((sum, l) => sum + Number(l.remainingAmount || 0), 0);
  const totalMonthlyInstallment = activeLoans.reduce((sum, l) => sum + Number(l.installmentAmount || 0), 0);
  const pendingLeaves = (data.leaves || []).filter((l) => l.status === "pending");
  const thisMonth = new Date().toISOString().slice(0, 7);
  const recentViolations = (data.violations || []).filter((v) => v.period === thisMonth).slice(0, 3);

  return (
    <Card className={cn("border-status-info-surface bg-status-info-surface/40", className)}>
      <CardContent className="p-4 space-y-3">
        {/* Header: name + status */}
        <div className="flex items-center justify-between pb-2 border-b border-status-info-surface">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-status-info-foreground" />
            <span className="font-semibold text-sm">{data.name}</span>
            {data.empNumber && (
              <Badge variant="outline" className="text-xs font-mono">
                #{data.empNumber}
              </Badge>
            )}
          </div>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              data.status === "active" && "bg-status-success-surface text-status-success-foreground border-status-success-surface",
              data.status === "inactive" && "bg-surface-subtle text-gray-700 border-border",
              data.status === "terminated" && "bg-status-error-surface text-status-error-foreground border-status-error-surface",
            )}
          >
            {data.status === "active" ? "نشط" : data.status === "inactive" ? "غير نشط" : data.status}
          </Badge>
        </div>

        {/* Core context grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <ContextItem icon={Briefcase} label="المسمى" value={data.jobTitle || "—"} />
          <ContextItem icon={Building} label="القسم / الفرع" value={[data.departmentName, data.branchName].filter(Boolean).join(" — ") || "—"} />
          <ContextItem icon={UserCheck} label="المدير المباشر" value={data.managerName || "—"} />
          <ContextItem icon={DollarSign} label="الراتب الأساسي" value={salary > 0 ? formatCurrency(salary) : "—"} highlight={salary > 0} />
        </div>

        {data.hireDate && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>تاريخ المباشرة: {formatDateAr(data.hireDate)}</span>
          </div>
        )}

        {/* Section-specific context */}
        {section === "loans" && (
          <LoansSection
            activeLoans={activeLoans}
            totalRemaining={totalRemainingLoans}
            totalMonthlyInstallment={totalMonthlyInstallment}
            salary={salary}
          />
        )}
        {section === "leaves" && (
          <LeavesSection pendingLeaves={pendingLeaves} allLeaves={data.leaves || []} />
        )}
        {section === "violations" && (
          <ViolationsSection recentViolations={recentViolations} allViolations={data.violations || []} />
        )}
        {section === "overtime" && (
          <OvertimeSection overtime={data.overtime || []} />
        )}
      </CardContent>
    </Card>
  );
}

function ContextItem({
  icon: Icon,
  label,
  value,
  highlight,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </div>
      <div className={cn("text-sm", highlight ? "font-semibold text-status-info-foreground" : "text-gray-800")}>
        {value}
      </div>
    </div>
  );
}

function LoansSection({
  activeLoans,
  totalRemaining,
  totalMonthlyInstallment,
  salary,
}: {
  activeLoans: NonNullable<EmployeeDetail["loans"]>;
  totalRemaining: number;
  totalMonthlyInstallment: number;
  salary: number;
}) {
  const maxLoan = salary * 3;
  const remainingCapacity = Math.max(0, maxLoan - totalRemaining);
  const installmentWarning = salary > 0 && totalMonthlyInstallment > salary * 0.3;

  return (
    <div className="pt-2 border-t border-status-info-surface space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-status-info-foreground">
        <Banknote className="h-3.5 w-3.5" />
        <span>سجل السلف</span>
      </div>
      {activeLoans.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد سلف نشطة — يمكن طلب سلفة جديدة</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded p-2 border border-border">
            <p className="text-xs text-muted-foreground">السلف النشطة</p>
            <p className="text-sm font-semibold text-gray-800">{activeLoans.length}</p>
          </div>
          <div className="bg-white rounded p-2 border border-status-error-surface">
            <p className="text-xs text-muted-foreground">المتبقي الكلي</p>
            <p className="text-sm font-semibold text-status-error-foreground">{formatCurrency(totalRemaining)}</p>
          </div>
          <div className="bg-white rounded p-2 border border-status-warning-surface">
            <p className="text-xs text-muted-foreground">خصم شهري</p>
            <p className={cn("text-sm font-semibold", installmentWarning ? "text-status-error-foreground" : "text-status-warning-foreground")}>
              {formatCurrency(totalMonthlyInstallment)}
            </p>
          </div>
        </div>
      )}
      {salary > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Info className="h-3 w-3" />
          <span>
            الحد الأقصى للسلفة: {formatCurrency(maxLoan)} (3× الراتب) — المتاح حالياً: {formatCurrency(remainingCapacity)}
          </span>
        </div>
      )}
      {installmentWarning && (
        <div className="flex items-center gap-1.5 text-xs text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded p-1.5">
          <AlertTriangle className="h-3 w-3" />
          <span>الخصم الشهري الحالي يتجاوز 30% من الراتب — يُنصح بعدم إضافة سلفة جديدة</span>
        </div>
      )}
    </div>
  );
}

function LeavesSection({
  pendingLeaves,
  allLeaves,
}: {
  pendingLeaves: NonNullable<EmployeeDetail["leaves"]>;
  allLeaves: NonNullable<EmployeeDetail["leaves"]>;
}) {
  const thisYearLeaves = allLeaves.filter((l) => {
    const y = new Date(l.startDate).getFullYear();
    return y === new Date().getFullYear() && l.status === "approved";
  });
  const usedDays = thisYearLeaves.reduce((sum, l) => sum + Number(l.days || 0), 0);

  return (
    <div className="pt-2 border-t border-status-info-surface space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-status-info-foreground">
        <CalendarDays className="h-3.5 w-3.5" />
        <span>سجل الإجازات</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded p-2 border border-border">
          <p className="text-xs text-muted-foreground">أيام مستخدمة {new Date().getFullYear()}</p>
          <p className="text-sm font-semibold text-gray-800">{usedDays} يوم</p>
        </div>
        <div className="bg-white rounded p-2 border border-status-warning-surface">
          <p className="text-xs text-muted-foreground">طلبات معلّقة</p>
          <p className="text-sm font-semibold text-status-warning-foreground">{pendingLeaves.length}</p>
        </div>
        <div className="bg-white rounded p-2 border border-border">
          <p className="text-xs text-muted-foreground">إجمالي الطلبات</p>
          <p className="text-sm font-semibold text-gray-800">{allLeaves.length}</p>
        </div>
      </div>
      {pendingLeaves.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-status-warning-foreground bg-status-warning-surface border border-status-warning-surface rounded p-1.5">
          <AlertTriangle className="h-3 w-3" />
          <span>يوجد {pendingLeaves.length} طلب إجازة بانتظار الموافقة — راجع قبل تقديم طلب جديد</span>
        </div>
      )}
    </div>
  );
}

function ViolationsSection({
  recentViolations,
  allViolations,
}: {
  recentViolations: NonNullable<EmployeeDetail["violations"]>;
  allViolations: NonNullable<EmployeeDetail["violations"]>;
}) {
  const totalDeduction = allViolations.reduce((sum, v) => sum + Number(v.deduction || 0), 0);
  const pendingCount = allViolations.filter((v) => !v.deduction).length;

  return (
    <div className="pt-2 border-t border-status-info-surface space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-status-info-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>سجل المخالفات</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded p-2 border border-border">
          <p className="text-xs text-muted-foreground">هذا الشهر</p>
          <p className="text-sm font-semibold text-gray-800">{recentViolations.length}</p>
        </div>
        <div className="bg-white rounded p-2 border border-status-error-surface">
          <p className="text-xs text-muted-foreground">إجمالي الخصومات</p>
          <p className="text-sm font-semibold text-status-error-foreground">{formatCurrency(totalDeduction)}</p>
        </div>
        <div className="bg-white rounded p-2 border border-status-warning-surface">
          <p className="text-xs text-muted-foreground">بدون جزاء محدد</p>
          <p className="text-sm font-semibold text-status-warning-foreground">{pendingCount}</p>
        </div>
      </div>
      {recentViolations.length >= 3 && (
        <div className="flex items-center gap-1.5 text-xs text-status-error-foreground bg-status-error-surface border border-status-error-surface rounded p-1.5">
          <AlertTriangle className="h-3 w-3" />
          <span>تكرار المخالفات هذا الشهر — سيُطبَّق سلم العقوبات تلقائياً عند إضافة مخالفة جديدة</span>
        </div>
      )}
    </div>
  );
}

function OvertimeSection({
  overtime,
}: {
  overtime: NonNullable<EmployeeDetail["overtime"]>;
}) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const thisMonthOT = overtime.filter((o) => o.overtimeDate?.slice(0, 7) === thisMonth);
  const totalHoursThisMonth = thisMonthOT.reduce((sum, o) => sum + Number(o.hours || 0), 0);
  const totalAmountThisMonth = thisMonthOT.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);

  return (
    <div className="pt-2 border-t border-status-info-surface space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-status-info-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        <span>ساعات إضافية — {thisMonth}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded p-2 border border-border">
          <p className="text-xs text-muted-foreground">الطلبات هذا الشهر</p>
          <p className="text-sm font-semibold text-gray-800">{thisMonthOT.length}</p>
        </div>
        <div className="bg-white rounded p-2 border border-border">
          <p className="text-xs text-muted-foreground">الساعات</p>
          <p className="text-sm font-semibold text-gray-800">{totalHoursThisMonth.toFixed(1)} ساعة</p>
        </div>
        <div className="bg-white rounded p-2 border border-status-success-surface">
          <p className="text-xs text-muted-foreground">المبلغ التقديري</p>
          <p className="text-sm font-semibold text-status-success-foreground">{formatCurrency(totalAmountThisMonth)}</p>
        </div>
      </div>
      {totalHoursThisMonth > 40 && (
        <div className="flex items-center gap-1.5 text-xs text-status-warning-foreground bg-status-warning-surface border border-status-warning-surface rounded p-1.5">
          <AlertTriangle className="h-3 w-3" />
          <span>تجاوزت الساعات الإضافية 40 ساعة هذا الشهر — قد يتطلب موافقة إضافية</span>
        </div>
      )}
    </div>
  );
}
