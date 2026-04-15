import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";

const stageStatus: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "معلق", color: "bg-yellow-100 text-yellow-700", icon: Clock },
  approved: { label: "موافق", color: "bg-green-100 text-green-700", icon: CheckCircle },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-700", icon: XCircle },
  escalated: { label: "تصعيد", color: "bg-purple-100 text-purple-700", icon: AlertTriangle },
};

const roleMap: Record<string, string> = {
  manager: "المدير المباشر",
  hr: "الموارد البشرية",
  owner: "المالك",
};

export default function ApprovalChainsPage() {
  const { data } = useApiQuery<any>(["approval-chains"], "/hr/approval-chains");
  const items = data?.data || [];

  const kpis = [
    { label: "إجمالي المراحل", value: items.length, icon: GitBranch, color: "text-blue-600 bg-blue-50" },
    { label: "معلقة", value: items.filter((i: any) => i.status === "pending").length, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "مكتملة", value: items.filter((i: any) => i.status === "approved").length, icon: CheckCircle, color: "text-green-600 bg-green-50" },
    { label: "تصعيد", value: items.filter((i: any) => i.status === "escalated").length, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
  ];

  return (
    <PageShell
      title="سلاسل الموافقات"
      subtitle="إعداد مسارات الاعتماد ومراحل الموافقة"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "سلاسل الموافقات" }]}
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

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50">
            <th className="p-3 text-start font-medium">الطلب</th>
            <th className="p-3 text-start font-medium">الموظف</th>
            <th className="p-3 text-start font-medium">المرحلة</th>
            <th className="p-3 text-start font-medium">الدور المطلوب</th>
            <th className="p-3 text-start font-medium">القرار</th>
            <th className="p-3 text-start font-medium">الحالة</th>
          </tr></thead>
          <tbody>
            {items.map((item: any) => {
              const st = stageStatus[item.status] || stageStatus.pending;
              return (
                <tr key={item.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="p-3">
                    <span className="text-gray-500">#{item.requestId}</span>
                    <span className="block text-xs text-gray-400">{item.leaveTypeName} — {item.days} أيام</span>
                  </td>
                  <td className="p-3 font-medium">{item.employeeName}</td>
                  <td className="p-3">المرحلة {item.stage}</td>
                  <td className="p-3">{roleMap[item.requiredRole] || item.requiredRole}</td>
                  <td className="p-3">{item.decision || "-"}</td>
                  <td className="p-3"><Badge className={st.color}>{st.label}</Badge></td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد سلاسل موافقات</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </PageShell>
  );
}
