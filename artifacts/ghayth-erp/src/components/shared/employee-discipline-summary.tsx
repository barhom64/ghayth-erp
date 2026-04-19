/**
 * EmployeeDisciplineSummary — مكوّن مشترك يعرض لقطة انضباط الموظف.
 *
 * يستخدم في:
 *   - صفحة تفاصيل الموظف (تبويب المخالفات)
 *   - نموذج تسجيل المخالفة (سياق حي بعد اختيار الموظف)
 *
 * يستهلك /hr/discipline/employee/:employeeId/summary ويعرض:
 *   - مستوى التصعيد الحالي (المرة كم خلال السنة)
 *   - إجمالي الخصومات الموقّعة هذا العام
 *   - عدد المحاضر المعلّقة
 *   - آخر ٥ محاضر مع رابط لكل محضر
 */
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageStatusBadge } from "@/components/page-status-badge";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Scale, AlertTriangle, DollarSign, Clock, ArrowLeft, Plus,
} from "lucide-react";

const INCIDENT_LABELS: Record<string, string> = {
  late: "تأخر",
  early_leave: "مغادرة مبكرة",
  absence: "غياب",
  behavior: "سلوك",
  organization: "تنظيم",
  gps_out_of_range: "خروج GPS",
  custom: "مخصّص",
};

interface SummaryResponse {
  stats: {
    totalActive?: number;
    pending?: number;
    approved?: number;
    ytdCount?: number;
    ytdDeductions?: number;
    currentEscalation?: number;
    terminations?: number;
  };
  recent: Array<{
    id: number;
    memoNumber?: string;
    incidentType: string;
    incidentDate?: string;
    status: string;
    appliedPenaltyLabel?: string;
    appliedDeductionAmount?: number;
    appliedExtraDeduction?: number;
    occurrenceCount?: number;
    createdAt?: string;
  }>;
}

function escalationLabel(level: number): { label: string; color: string } {
  if (level >= 4) return { label: "حرج — قرب الفصل", color: "bg-red-100 text-red-700 border-red-300" };
  if (level >= 3) return { label: "مرتفع", color: "bg-orange-100 text-orange-700 border-orange-300" };
  if (level >= 2) return { label: "متوسط", color: "bg-amber-100 text-amber-700 border-amber-300" };
  if (level >= 1) return { label: "أوّل مرة", color: "bg-blue-100 text-blue-700 border-blue-300" };
  return { label: "نظيف", color: "bg-green-100 text-green-700 border-green-300" };
}

interface Props {
  employeeId: number | string;
  employeeName?: string;
  /** Hide the "Create new memo" action button (e.g., when used inside the create form itself). */
  hideCreateButton?: boolean;
  /** Override the heading title — defaults to "ملف الانضباط". */
  title?: string;
  /** Compact variant for inline form usage. */
  compact?: boolean;
}

export function EmployeeDisciplineSummary({
  employeeId,
  employeeName,
  hideCreateButton,
  title = "ملف الانضباط",
  compact,
}: Props) {
  const { data, isLoading, isError } = useApiQuery<SummaryResponse>(
    ["discipline-employee-summary", String(employeeId)],
    employeeId ? `/hr/discipline/employee/${employeeId}/summary` : null,
  );

  const stats = data?.stats || {};
  const recent = data?.recent || [];
  const escalation = escalationLabel(Number(stats.currentEscalation ?? 0));
  const ytdDeductions = Number(stats.ytdDeductions ?? 0);
  const ytdCount = Number(stats.ytdCount ?? 0);
  const pending = Number(stats.pending ?? 0);
  const terminations = Number(stats.terminations ?? 0);

  if (isError) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-6 text-center text-sm text-red-600">
          تعذّر تحميل ملف الانضباط لهذا الموظف
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn(compact && "border-blue-200 bg-blue-50/30")}>
      <CardHeader className="flex-row items-center justify-between pb-2">
        <CardTitle className={cn("flex items-center gap-2", compact ? "text-sm" : "text-base")}>
          <Scale className={cn(compact ? "h-4 w-4" : "h-5 w-5", "text-purple-600")} />
          {title}
        </CardTitle>
        {!hideCreateButton && (
          <Link href={`/hr/violations/create?employeeId=${employeeId}`}>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              تسجيل مخالفة جديدة
            </Button>
          </Link>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-12 bg-gray-100 rounded animate-pulse" />
            <div className="h-20 bg-gray-100 rounded animate-pulse" />
          </div>
        ) : (
          <>
            {/* Critical alert if approaching termination */}
            {terminations > 0 && (
              <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>صدر بحقّ هذا الموظف <strong>{terminations}</strong> قرار فصل سابق</span>
              </div>
            )}

            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-lg border bg-white">
                <p className="text-xs text-gray-500 mb-0.5">مستوى التصعيد</p>
                <Badge variant="outline" className={cn("text-xs", escalation.color)}>
                  {escalation.label}
                </Badge>
              </div>
              <div className="p-2.5 rounded-lg border bg-white">
                <p className="text-xs text-gray-500 mb-0.5">محاضر هذا العام</p>
                <p className="font-bold text-blue-700">{ytdCount}</p>
              </div>
              <div className="p-2.5 rounded-lg border bg-white">
                <p className="text-xs text-gray-500 mb-0.5">معلّقة</p>
                <p className={cn("font-bold", pending > 0 ? "text-amber-600" : "text-gray-400")}>
                  {pending}
                </p>
              </div>
              <div className="p-2.5 rounded-lg border bg-white">
                <p className="text-xs text-gray-500 mb-0.5">خصومات السنة</p>
                <p className={cn("font-bold text-sm", ytdDeductions > 0 ? "text-red-600" : "text-gray-400")}>
                  {ytdDeductions > 0 ? formatCurrency(ytdDeductions) : "—"}
                </p>
              </div>
            </div>

            {/* Recent memos list */}
            {recent.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-gray-600">آخر المحاضر</p>
                  <Link href={`/hr/violations?tab=memos&employeeId=${employeeId}`}>
                    <Button variant="ghost" size="sm" className="text-xs h-6 gap-1">
                      الكل <ArrowLeft className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
                <div className="space-y-1">
                  {recent.map((m) => {
                    const total = Number(m.appliedDeductionAmount || 0) + Number(m.appliedExtraDeduction || 0);
                    return (
                      <Link key={m.id} href={`/hr/discipline/memos/${m.id}`}>
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded border bg-white hover:bg-gray-50 cursor-pointer transition-colors text-sm">
                          <span className="font-mono text-xs text-blue-700 shrink-0">
                            {m.memoNumber || `#${m.id}`}
                          </span>
                          <span className="text-gray-700 truncate flex-1">
                            {INCIDENT_LABELS[m.incidentType] || m.incidentType}
                            {m.occurrenceCount && m.occurrenceCount > 1 && (
                              <span className="text-xs text-amber-600 ms-1">(المرة {m.occurrenceCount})</span>
                            )}
                          </span>
                          {total > 0 && (
                            <span className="text-xs font-semibold text-red-600 shrink-0">
                              {formatCurrency(total)}
                            </span>
                          )}
                          <PageStatusBadge status={m.status} domain="memo" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {recent.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">
                لا يوجد سجل انضباطي{employeeName ? ` لـ ${employeeName}` : ""} حتى الآن
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
