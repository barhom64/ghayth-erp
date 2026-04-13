import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserPlus, CheckCircle, Clock, ClipboardCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
// Phase A — HR onboarding review on unified primitives.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";

export default function OnboardingReviewPage() {
  const { data } = useApiQuery<any>(["employees"], "/employees?limit=200");
  const { data: stepsData } = useApiQuery<any>(["onboarding-steps"], "/hr/onboarding-steps");
  const employees = data?.data || [];
  const steps: string[] = stepsData?.data || ["تسليم أجهزة تقنية المعلومات", "توقيع عقد العمل", "تعريف المدير", "دورة التعريف"];

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const recentHires = employees.filter((e: any) => {
    const hireDate = e.hireDate ? new Date(e.hireDate) : null;
    return hireDate && hireDate >= thirtyDaysAgo;
  });

  const allActive = employees.filter((e: any) => e.status === "active");

  const inProbation = employees.filter((e: any) => {
    if (e.status !== "active") return false;
    const hireDate = e.hireDate ? new Date(e.hireDate) : null;
    if (!hireDate) return false;
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return hireDate >= ninetyDaysAgo;
  });

  const pendingOnboarding = employees.filter((e: any) => e.status === "pending" || e.status === "onboarding");

  const getOnboardingStatus = (emp: any) => {
    if (emp.status === "pending" || emp.status === "onboarding") return "pending";
    const hireDate = emp.hireDate ? new Date(emp.hireDate) : null;
    if (!hireDate) return "completed";
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    if (hireDate >= ninetyDaysAgo) return "probation";
    return "completed";
  };

  const displayList = [...pendingOnboarding, ...recentHires, ...inProbation.filter((e: any) => !recentHires.some((r: any) => r.id === e.id))]
    .filter((e, i, arr) => arr.findIndex((x: any) => x.id === e.id) === i)
    .slice(0, 30);

  const kpis = [
    { label: "موظفين جدد (آخر 30 يوم)", value: recentHires.length, icon: UserPlus, color: "text-blue-600 bg-blue-50" },
    { label: "مكتمل التعيين", value: allActive.length - inProbation.length - pendingOnboarding.length, icon: CheckCircle, color: "text-green-600 bg-green-50" },
    { label: "قيد المراجعة", value: pendingOnboarding.length, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "فترة التجربة", value: inProbation.length, icon: ClipboardCheck, color: "text-purple-600 bg-purple-50" },
  ];

  const statusConfig: Record<string, { label: string; variant: string }> = {
    pending: { label: "قيد المراجعة", variant: "bg-yellow-100 text-yellow-700" },
    probation: { label: "فترة التجربة", variant: "bg-purple-100 text-purple-700" },
    completed: { label: "مكتمل", variant: "bg-green-100 text-green-700" },
  };

  return (
    <PageShell
      title="مراجعة التعيين والتأهيل"
      subtitle="متابعة إجراءات التعيين وتأهيل الموظفين الجدد"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3">خطوات التأهيل</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {steps.map((step: string, i: number) => (
              <div key={i} className="p-3 bg-gray-50 rounded-lg text-center">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto mb-2 text-sm font-bold">{i + 1}</div>
                <p className="text-sm font-medium">{step}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50">
            <th className="p-3 text-start font-medium">الموظف</th>
            <th className="p-3 text-start font-medium">الرقم الوظيفي</th>
            <th className="p-3 text-start font-medium">المنصب</th>
            <th className="p-3 text-start font-medium">تاريخ التعيين</th>
            <th className="p-3 text-start font-medium">الفرع</th>
            <th className="p-3 text-start font-medium">حالة التأهيل</th>
          </tr></thead>
          <tbody>
            {displayList.map((e: any) => {
              const status = getOnboardingStatus(e);
              const cfg = statusConfig[status] || statusConfig.completed;
              return (
                <tr key={e.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">{(e.name || "؟").charAt(0)}</div>
                      <span className="font-medium">{e.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-gray-500 font-mono">{e.empNumber || "-"}</td>
                  <td className="p-3">{e.jobTitle || "-"}</td>
                  <td className="p-3 text-gray-500">{e.hireDate ? formatDateAr(e.hireDate) : "-"}</td>
                  <td className="p-3 text-gray-500">{e.branchName || "-"}</td>
                  <td className="p-3"><Badge className={cfg.variant}>{cfg.label}</Badge></td>
                </tr>
              );
            })}
            {displayList.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا يوجد موظفين في مرحلة التأهيل</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </PageShell>
  );
}
