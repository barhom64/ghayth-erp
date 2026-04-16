import { useParams, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Timer, Calendar, DollarSign, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending:  { label: "بانتظار الموافقة", color: "bg-amber-100 text-amber-700" },
  approved: { label: "معتمد",            color: "bg-green-100 text-green-700" },
  paid:     { label: "مدفوع",            color: "bg-blue-100 text-blue-700"   },
  rejected: { label: "مرفوض",            color: "bg-red-100 text-red-700"     },
};

export default function OvertimeDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data, isLoading } = useApiQuery<any>(["hr-overtime-detail", id], `/hr/overtime/${id}`);
  const item = data?.data ?? data;

  if (!isLoading && !item) {
    return (
      <PageShell title="الطلب غير موجود" breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { href: "/hr/overtime", label: "الوقت الإضافي" }]}>
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Timer size={36} className="mx-auto mb-3 opacity-40" />
            <p>طلب الوقت الإضافي غير موجود</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/hr/overtime")}>
              العودة
            </Button>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const st = STATUS_MAP[item.status] ?? { label: item.status, color: "bg-gray-100 text-gray-600" };

  const kpis = [
    { label: "الموظف", value: item.employeeName, icon: User, color: "text-blue-600 bg-blue-50" },
    { label: "الساعات", value: `${Number(item.hours).toFixed(1)} ساعة`, icon: Clock, color: "text-purple-600 bg-purple-50" },
    { label: "المعامل", value: `×${Number(item.multiplier || 1.5).toFixed(2)}`, icon: Timer, color: "text-cyan-600 bg-cyan-50" },
    { label: "المبلغ", value: formatCurrency(Number(item.totalAmount || 0)), icon: DollarSign, color: "text-green-600 bg-green-50" },
  ];

  return (
    <PageShell
      title={`طلب وقت إضافي ${item?.requestNumber || ""}`}
      subtitle={item ? `${item.employeeName} — ${item.jobTitle || ""}` : undefined}
      loading={isLoading}
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
        { href: "/hr/overtime", label: "الوقت الإضافي" },
        { label: item.requestNumber },
      ]}
      actions={
        <Badge className={cn("text-sm px-3 py-1", st.color)}>{st.label}</Badge>
      }
    >
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((c) => {
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

      {/* تفاصيل الطلب */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">تفاصيل الطلب</CardTitle>
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
              <p className="text-gray-500">تاريخ العمل الإضافي</p>
              <p className="font-medium">{item.overtimeDate ? formatDateAr(item.overtimeDate) : "—"}</p>
            </div>
            <div>
              <p className="text-gray-500">الوقت</p>
              <p className="font-medium font-mono">
                {item.startTime?.slice(0, 5)} — {item.endTime?.slice(0, 5)}
              </p>
            </div>
            <div>
              <p className="text-gray-500">الراتب الأساسي</p>
              <p className="font-medium">{formatCurrency(Number(item.salary || 0))}</p>
            </div>
            <div>
              <p className="text-gray-500">فترة الرواتب</p>
              <p className="font-medium font-mono">{item.payrollPeriod || "—"}</p>
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
            {item.reason && (
              <div className="col-span-full">
                <p className="text-gray-500">السبب</p>
                <p className="font-medium">{item.reason}</p>
              </div>
            )}
            {item.rejectReason && (
              <div className="col-span-full">
                <p className="text-gray-500">سبب الرفض</p>
                <p className="font-medium text-red-600">{item.rejectReason}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* حساب المبلغ */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">حساب التعويض</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">الأجر اليومي</span>
              <span>{formatCurrency(Number(item.salary || 0) / 30)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">الأجر بالساعة</span>
              <span>{formatCurrency(Number(item.salary || 0) / 30 / 8)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">عدد الساعات</span>
              <span>{Number(item.hours).toFixed(1)} ساعة</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">معامل الضرب</span>
              <span>×{Number(item.multiplier || 1.5).toFixed(2)}</span>
            </div>
            <hr className="border-gray-200" />
            <div className="flex justify-between font-bold text-base">
              <span>إجمالي التعويض</span>
              <span className="text-green-700">{formatCurrency(Number(item.totalAmount || 0))}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
