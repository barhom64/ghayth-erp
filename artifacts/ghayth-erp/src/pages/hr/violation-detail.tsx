import { useParams, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Loader2, AlertTriangle, Shield, DollarSign, Calendar, User, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";

const SEVERITY_MAP: Record<string, { label: string; color: string }> = {
  low:    { label: "بسيطة",   color: "bg-blue-100 text-blue-700"   },
  medium: { label: "متوسطة",  color: "bg-amber-100 text-amber-700" },
  high:   { label: "جسيمة",   color: "bg-red-100 text-red-700"     },
};

const VIOLATION_TYPES: Record<string, string> = {
  late:              "تأخر",
  early_leave:       "مغادرة مبكرة",
  absence:           "غياب",
  behavior:          "سلوك",
  organization:      "تنظيم",
  gps_out_of_range:  "خروج عن النطاق",
  custom:            "مخصّص",
};

export default function ViolationDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading } = useApiQuery<any>(["hr-violation-detail", id], `/hr/violations/${id}`);
  const item = data?.data ?? data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!item) {
    return (
      <PageShell title="المخالفة غير موجودة" breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { href: "/hr/violations", label: "المخالفات" }]}>
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <AlertTriangle size={36} className="mx-auto mb-3 opacity-40" />
            <p>المخالفة المطلوبة غير موجودة</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/hr/violations")}>
              العودة
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const severity = SEVERITY_MAP[item.severity] ?? { label: item.severity || "متوسطة", color: "bg-gray-100 text-gray-600" };
  const memos: any[] = item.memos || [];

  return (
    <PageShell
      title={`مخالفة — ${item.employeeName}`}
      subtitle={`${VIOLATION_TYPES[item.type] || item.type} — ${item.period}`}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/violations", label: "المخالفات" },
        { label: item.employeeName },
      ]}
      actions={
        <Badge className={cn("text-sm px-3 py-1", severity.color)}>{severity.label}</Badge>
      }
    >
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "الموظف", value: item.employeeName, icon: User, color: "text-blue-600 bg-blue-50" },
          { label: "النوع", value: VIOLATION_TYPES[item.type] || item.type, icon: AlertTriangle, color: "text-amber-600 bg-amber-50" },
          { label: "الخصم", value: formatCurrency(Number(item.deduction || 0)), icon: DollarSign, color: "text-red-600 bg-red-50" },
          { label: "الفترة", value: item.period || "—", icon: Calendar, color: "text-purple-600 bg-purple-50" },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                  <Icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
                </div>
                <div>
                  <p className="text-lg font-bold">{c.value}</p>
                  <p className="text-xs text-gray-500">{c.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* تفاصيل المخالفة */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">تفاصيل المخالفة</CardTitle>
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
              <p className="text-gray-500">نوع المخالفة</p>
              <p className="font-medium">{VIOLATION_TYPES[item.type] || item.type}</p>
            </div>
            <div>
              <p className="text-gray-500">الدرجة</p>
              <Badge variant="outline" className={cn("text-xs", severity.color)}>
                {severity.label}
              </Badge>
            </div>
            <div>
              <p className="text-gray-500">مبلغ الخصم</p>
              <p className="font-medium text-red-600">{formatCurrency(Number(item.deduction || 0))}</p>
            </div>
            <div>
              <p className="text-gray-500">الفترة</p>
              <p className="font-medium font-mono">{item.period || "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">تاريخ التسجيل</p>
              <p className="font-medium">{item.createdAt ? formatDateAr(item.createdAt) : "—"}</p>
            </div>
            {item.description && (
              <div className="col-span-full">
                <p className="text-gray-500">الوصف</p>
                <p className="font-medium">{item.description}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* محاضر التحقيق المرتبطة */}
      {memos.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              محاضر التحقيق المرتبطة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "memoNumber", header: "رقم المحضر", sortable: true, render: (v) => (
                  <Link href={`/hr/discipline/memos/${v.id}`}>
                    <span className="font-mono text-xs text-blue-700 hover:underline cursor-pointer">{v.memoNumber}</span>
                  </Link>
                ) },
                { key: "penaltyLabel", header: "الجزاء", sortable: true, render: (v) => <span className="text-gray-700">{v.penaltyLabel || "—"}</span> },
                { key: "totalDeductionAmount", header: "المبلغ", sortable: true, render: (v) => <span className="font-medium text-red-600">{formatCurrency(Number(v.totalDeductionAmount || 0))}</span> },
                { key: "status", header: "الحالة", sortable: true, render: (v) => <Badge variant="outline" className="text-xs">{v.status}</Badge> },
                { key: "createdAt", header: "التاريخ", sortable: true, render: (v) => <span className="text-gray-500">{v.createdAt ? formatDateAr(v.createdAt) : "—"}</span> },
              ] as DataTableColumn<any>[]}
              data={memos}
              noToolbar
              emptyMessage="لا توجد محاضر"
              pageSize={10}
            />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
