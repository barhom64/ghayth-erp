import { useParams, useLocation } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  LogOut, Calendar, DollarSign, CheckCircle, Clock,
  User, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiGrid } from "@/components/shared/kpi-card";
import { useQueryClient } from "@tanstack/react-query";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:      { label: "بانتظار الموافقة", color: "bg-amber-100 text-amber-700"  },
  approved:     { label: "تمت الموافقة",     color: "bg-blue-100 text-blue-700"    },
  in_progress:  { label: "جاري التنفيذ",     color: "bg-purple-100 text-purple-700" },
  completed:    { label: "مكتمل",            color: "bg-green-100 text-green-700"  },
  rejected:     { label: "مرفوض",            color: "bg-red-100 text-red-700"      },
};

import { EXIT_TYPES } from "@/lib/hr-type-maps";

const CLEARANCE_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: "معلق",  color: "text-amber-600 bg-amber-50" },
  cleared:  { label: "تم",    color: "text-green-600 bg-green-50" },
  rejected: { label: "مرفوض", color: "text-red-600 bg-red-50"     },
};

export default function ExitDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useApiQuery<any>(["hr-exit-detail", id], `/hr/exit/${id}`);
  const item = data?.data ?? data;

  const approveMut = useApiMutation(null as any, "PATCH", [["hr-exit"]], {
    successMessage: "تم اعتماد طلب نهاية الخدمة",
  });

  const handleApprove = async () => {
    await approveMut.mutateAsync({ __url: `/hr/exit/${id}/approve`, approved: true } as any);
    queryClient.invalidateQueries({ queryKey: ["hr-exit-detail", id] });
  };

  if (!isLoading && !item) {
    return (
      <PageShell title="الطلب غير موجود" breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { href: "/hr/exit", label: "نهاية الخدمة" }]}>
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <LogOut size={36} className="mx-auto mb-3 opacity-40" />
            <p>طلب نهاية الخدمة غير موجود</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/hr/exit")}>
              العودة
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const st = STATUS_MAP[item.status] ?? { label: item.status, color: "bg-gray-100 text-gray-600" };
  const clearance: any[] = item.clearance || [];

  const hireDate = item.hireDate ? new Date(item.hireDate) : null;
  const yearsOfService = hireDate
    ? ((new Date().getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1)
    : "—";

  return (
    <PageShell
      title={`طلب نهاية خدمة — ${item?.employeeName || ""}`}
      subtitle={item ? `${EXIT_TYPES[item.exitType] || item.exitType} — ${item.jobTitle || ""}` : undefined}
      loading={isLoading}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/exit", label: "نهاية الخدمة" },
        { label: item?.employeeName || "..." },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Badge className={cn("text-sm px-3 py-1", st.color)}>{st.label}</Badge>
          {item.status === "pending" && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={handleApprove}
              disabled={approveMut.isPending}
            >
              <CheckCircle className="h-4 w-4 ml-1" />
              اعتماد
            </Button>
          )}
        </div>
      }
    >
      {/* KPI cards */}
      <KpiGrid items={[
        { label: "الموظف", value: item.employeeName, icon: User, color: "text-blue-600 bg-blue-50", size: "sm" },
        { label: "نوع الإنهاء", value: EXIT_TYPES[item.exitType] || item.exitType, icon: LogOut, color: "text-red-600 bg-red-50", size: "sm" },
        { label: "سنوات الخدمة", value: yearsOfService, icon: Calendar, color: "text-purple-600 bg-purple-50", size: "sm" },
        { label: "المكافأة المقدّرة", value: formatCurrency(Number(item.estimatedGratuity || 0)), icon: DollarSign, color: "text-green-600 bg-green-50", size: "sm" },
      ]} />

      {/* تنبيه الفصل */}
      {item.exitType === "termination" && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>حالة فصل — يرجى التأكد من استكمال الإجراءات التأديبية</span>
        </div>
      )}

      {/* تفاصيل الطلب */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">بيانات الطلب</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500">الموظف</p>
              <p className="font-medium">{item.employeeName}</p>
              {item.empNumber && <p className="text-xs text-gray-400">#{item.empNumber}</p>}
            </div>
            <div>
              <p className="text-gray-500">المسمى الوظيفي</p>
              <p className="font-medium">{item.jobTitle || "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">الفرع</p>
              <p className="font-medium">{item.branchName || "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">الراتب</p>
              <p className="font-medium">{formatCurrency(Number(item.salary || 0))}</p>
            </div>
            <div>
              <p className="text-gray-500">تاريخ التعيين</p>
              <p className="font-medium">{hireDate ? formatDateAr(hireDate) : "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">آخر يوم عمل</p>
              <p className="font-medium">{item.lastWorkingDay ? formatDateAr(item.lastWorkingDay) : "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">تاريخ الطلب</p>
              <p className="font-medium">{item.createdAt ? formatDateAr(item.createdAt) : "—"}</p>
            </div>
            {item.approvedAt && (
              <div>
                <p className="text-gray-500">تاريخ الموافقة</p>
                <p className="font-medium">{formatDateAr(item.approvedAt)}</p>
              </div>
            )}
            {item.exitReason && (
              <div className="col-span-full">
                <p className="text-gray-500">سبب الإنهاء</p>
                <p className="font-medium">{item.exitReason}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* المستحقات */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">المستحقات المالية</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">مكافأة نهاية الخدمة</span>
              <span className="font-medium text-green-700">{formatCurrency(Number(item.estimatedGratuity || 0))}</span>
            </div>
            {item.leaveBalance != null && (
              <div className="flex justify-between">
                <span className="text-gray-600">رصيد إجازات متبقي</span>
                <span className="font-medium">{item.leaveBalance} يوم</span>
              </div>
            )}
            {item.leaveCashOut != null && (
              <div className="flex justify-between">
                <span className="text-gray-600">تعويض الإجازات</span>
                <span className="font-medium text-blue-700">{formatCurrency(Number(item.leaveCashOut))}</span>
              </div>
            )}
            {Number(item.otherDeductions) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">خصومات أخرى</span>
                <span className="font-medium text-red-600">-{formatCurrency(Number(item.otherDeductions))}</span>
              </div>
            )}
            {Number(item.loanBalance) > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-600">رصيد سلف متبقي</span>
                <span className="font-medium text-red-600">-{formatCurrency(Number(item.loanBalance))}</span>
              </div>
            )}
            {item.netSettlement != null && (
              <>
                <hr className="border-gray-200" />
                <div className="flex justify-between font-bold text-base">
                  <span>صافي التسوية</span>
                  <span className={Number(item.netSettlement) >= 0 ? "text-green-700" : "text-red-700"}>
                    {formatCurrency(Number(item.netSettlement))}
                  </span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* إخلاء الطرف */}
      {clearance.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">إخلاء الطرف</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "department", header: "القسم", sortable: true, render: (v) => <span className="font-medium">{v.department || v.section || "—"}</span> },
                { key: "responsibleName", header: "المسؤول", sortable: true, render: (v) => <span className="text-gray-600">{v.responsibleName || "—"}</span> },
                { key: "status", header: "الحالة", sortable: true, render: (v) => {
                  const cSt = CLEARANCE_STATUS[v.status] ?? { label: v.status, color: "text-gray-600 bg-gray-50" };
                  return <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs font-medium", cSt.color)}>{cSt.label}</span>;
                } },
                { key: "notes", header: "ملاحظات", render: (v) => <span className="text-gray-500 text-xs">{v.notes || "—"}</span> },
              ] as DataTableColumn<any>[]}
              data={clearance}
              noToolbar
              emptyMessage="لا توجد بيانات إخلاء طرف"
              pageSize={20}
            />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
