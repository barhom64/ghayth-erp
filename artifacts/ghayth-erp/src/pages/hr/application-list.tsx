import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, Search, Users, UserCheck, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const stageMap: Record<string, { label: string; color: string }> = {
  new: { label: "جديد", color: "bg-blue-100 text-blue-700" },
  screening: { label: "فرز", color: "bg-yellow-100 text-yellow-700" },
  interview: { label: "مقابلة", color: "bg-purple-100 text-purple-700" },
  offer: { label: "عرض", color: "bg-green-100 text-green-700" },
  hired: { label: "تم التوظيف", color: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-700" },
};

export default function ApplicationListPage() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const { data } = useApiQuery<any>(["applicants"], "/recruitment/applications");
  const apps = data?.data || [];

  const filtered = apps.filter((a: any) => {
    if (stageFilter !== "all" && (a.status || a.stage) !== stageFilter) return false;
    if (search && !(a.applicantName || a.name || "").includes(search)) return false;
    return true;
  });

  const kpis = [
    { label: "إجمالي المتقدمين", value: apps.length, icon: Users, color: "text-blue-600 bg-blue-50" },
    { label: "جدد", value: apps.filter((a: any) => a.status === "new").length, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "تم توظيفهم", value: apps.filter((a: any) => a.status === "hired").length, icon: UserCheck, color: "text-green-600 bg-green-50" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">قائمة المتقدمين</h1>
        <p className="text-sm text-muted-foreground mt-0.5">متابعة طلبات التوظيف ومراحل الفرز</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-2xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute start-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input placeholder="بحث..." className="ps-9 w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="border rounded-md p-2 text-sm" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
            <option value="all">جميع المراحل</option>
            {Object.entries(stageMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <Link href="/hr/recruitment/applicants/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />إضافة متقدم</Button>
        </Link>
      </div>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b bg-gray-50">
            <th className="p-3 text-start font-medium">الاسم</th>
            <th className="p-3 text-start font-medium">المنصب</th>
            <th className="p-3 text-start font-medium">البريد</th>
            <th className="p-3 text-start font-medium">الهاتف</th>
            <th className="p-3 text-start font-medium">التقييم</th>
            <th className="p-3 text-start font-medium">المرحلة</th>
          </tr></thead>
          <tbody>
            {filtered.map((a: any) => (
              <tr key={a.id} className="border-b hover:bg-gray-50 transition-colors">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                      {(a.applicantName || a.name || "؟").charAt(0)}
                    </div>
                    <span className="font-medium">{a.applicantName || a.name}</span>
                  </div>
                </td>
                <td className="p-3 text-gray-500">{a.postingTitle || a.position || "-"}</td>
                <td className="p-3 text-gray-500">{a.email || "-"}</td>
                <td className="p-3 text-gray-500">{a.phone || "-"}</td>
                <td className="p-3">{a.rating ? `${a.rating}/5` : "-"}</td>
                <td className="p-3"><Badge className={stageMap[a.status || a.stage]?.color || ""}>{stageMap[a.status || a.stage]?.label || a.status || a.stage}</Badge></td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا يوجد متقدمين</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}
