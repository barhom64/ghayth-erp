import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MessageSquare, Clock, CheckCircle2, User, Search, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery } from "@/lib/api";

interface Reply {
  id: number;
  ticketId: string;
  ticketTitle: string;
  reply: string;
  agent: string;
  date: string;
  status: string;
}

interface RepliesResponse {
  data: Reply[];
  total: number;
  resolved: number;
  pending: number;
  activeAgents: number;
}

interface StatCard {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

export default function SupportReplies() {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError } = useApiQuery<RepliesResponse>(["support-replies"], "/support/replies");

  const replies: Reply[] = data?.data || [];

  const statCards: StatCard[] = [
    { label: "إجمالي الردود", value: data?.total || 0, icon: MessageSquare, color: "text-blue-600 bg-blue-50" },
    { label: "تم الحل", value: data?.resolved || 0, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
    { label: "بانتظار الرد", value: data?.pending || 0, icon: Clock, color: "text-yellow-600 bg-yellow-50" },
    { label: "وكلاء نشطون", value: data?.activeAgents || 0, icon: User, color: "text-purple-600 bg-purple-50" },
  ];

  const filtered = replies.filter(r =>
    !search || r.ticketTitle.includes(search) || r.reply.includes(search) || (r.agent || "").includes(search) || r.ticketId.includes(search)
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-20 text-red-500">حدث خطأ أثناء تحميل البيانات</div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">ردود الدعم الفني</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-0 shadow-sm">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                  <Icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
                </div>
                <div><p className="text-2xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="بحث في الردود..." value={search} onChange={(e) => setSearch(e.target.value)} className="ps-10" />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50">
              <th className="p-3 text-start">رقم التذكرة</th>
              <th className="p-3 text-start">عنوان التذكرة</th>
              <th className="p-3 text-start">الرد</th>
              <th className="p-3 text-start">الوكيل</th>
              <th className="p-3 text-start">التاريخ</th>
              <th className="p-3 text-start">الحالة</th>
            </tr></thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-mono text-xs">{r.ticketId}</td>
                  <td className="p-3 font-medium">{r.ticketTitle}</td>
                  <td className="p-3 text-gray-600 max-w-xs truncate">{r.reply}</td>
                  <td className="p-3 text-gray-500">{r.agent}</td>
                  <td className="p-3 text-gray-500 whitespace-nowrap">{r.date}</td>
                  <td className="p-3">
                    <Badge className={r.status === "resolved" || r.status === "closed" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}>
                      {r.status === "resolved" || r.status === "closed" ? "تم الحل" : "بانتظار الرد"}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">لا توجد ردود</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
