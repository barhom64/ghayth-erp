import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Phone, Calendar, Search, CheckCircle2, Clock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, asList } from "@/lib/api";

const TYPE_LABELS: Record<string, string> = {
  call: "مكالمة",
  email: "بريد إلكتروني",
  meeting: "اجتماع",
  note: "ملاحظة",
};

export default function CrmActivities() {
  const [search, setSearch] = useState("");
  const { data: oppsResp } = useApiQuery<any>(["crm-opportunities"], "/crm/opportunities");
  const opportunities = asList<any>(oppsResp);

  const allActivities = opportunities.flatMap((opp: any) =>
    (opp.activities || []).map((a: any) => ({
      ...a,
      client: opp.title || opp.contactName || "-",
      contact: opp.contactName || "-",
    }))
  );

  const statCards = [
    { label: "إجمالي الأنشطة", value: allActivities.length, icon: Calendar, color: "text-blue-600 bg-blue-50" },
    { label: "مكالمات", value: allActivities.filter((a: any) => a.type === "call").length, icon: Phone, color: "text-green-600 bg-green-50" },
    { label: "مجدولة", value: allActivities.filter((a: any) => !a.completedAt).length, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "مكتملة", value: allActivities.filter((a: any) => a.completedAt).length, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
  ];

  const filtered = allActivities.filter((a: any) => {
    if (search && !a.client?.includes(search) && !a.description?.includes(search) && !a.contact?.includes(search)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">أنشطة إدارة العملاء</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                  <Icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
                </div>
                <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="بحث في الأنشطة..." value={search} onChange={(e) => setSearch(e.target.value)} className="ps-10" />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50">
              <th className="p-3 text-start">الوصف</th>
              <th className="p-3 text-start">الفرصة</th>
              <th className="p-3 text-start">جهة الاتصال</th>
              <th className="p-3 text-start">النوع</th>
              <th className="p-3 text-start">التاريخ</th>
              <th className="p-3 text-start">الحالة</th>
            </tr></thead>
            <tbody>
              {filtered.map((a: any) => (
                <tr key={a.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{a.description || "-"}</td>
                  <td className="p-3 text-gray-500">{a.client}</td>
                  <td className="p-3 text-gray-500">{a.contact}</td>
                  <td className="p-3"><Badge variant="outline">{TYPE_LABELS[a.type] || a.type}</Badge></td>
                  <td className="p-3 text-gray-500">{a.scheduledAt ? formatDateAr(a.scheduledAt) : "-"}</td>
                  <td className="p-3">
                    <Badge className={a.completedAt ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}>
                      {a.completedAt ? "مكتمل" : "مجدول"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد أنشطة</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
