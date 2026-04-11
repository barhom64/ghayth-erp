import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Mail, Send, Inbox, FileText, Search, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, asList } from "@/lib/api";

const DIRECTION_MAP: Record<string, { label: string; color: string }> = {
  inbound: { label: "وارد", color: "bg-blue-100 text-blue-700" },
  outbound: { label: "صادر", color: "bg-green-100 text-green-700" },
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  sent: { label: "مرسل", color: "bg-green-100 text-green-700" },
  delivered: { label: "تم التسليم", color: "bg-emerald-100 text-emerald-700" },
  queued: { label: "في الانتظار", color: "bg-yellow-100 text-yellow-700" },
  received: { label: "مستلم", color: "bg-blue-100 text-blue-700" },
  failed: { label: "فشل", color: "bg-red-100 text-red-700" },
};

export default function CommunicationsLetters() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const { data: logResp } = useApiQuery<any>(["comm-log-letters"], "/communications/log?channel=email");
  const letters = asList<any>(logResp);

  const incoming = letters.filter((l: any) => l.direction === "inbound").length;
  const outgoing = letters.filter((l: any) => l.direction === "outbound").length;

  const statCards = [
    { label: "إجمالي المراسلات", value: letters.length, icon: Mail, color: "text-blue-600 bg-blue-50" },
    { label: "صادرة", value: outgoing, icon: Send, color: "text-green-600 bg-green-50" },
    { label: "واردة", value: incoming, icon: Inbox, color: "text-purple-600 bg-purple-50" },
    { label: "في الانتظار", value: letters.filter((l: any) => l.status === "queued").length, icon: FileText, color: "text-yellow-600 bg-yellow-50" },
  ];

  const filtered = letters.filter((l: any) => {
    if (filter !== "all" && l.direction !== filter) return false;
    if (search && !l.subject?.includes(search) && !l.toNumber?.includes(search)) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">المراسلات</h1>
        <Link href="/communications/letters/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> مراسلة جديدة</Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="بحث في المراسلات..." value={search} onChange={(e) => setSearch(e.target.value)} className="ps-10" />
        </div>
        <select className="border rounded-md px-3 py-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">الكل</option>
          <option value="inbound">واردة</option>
          <option value="outbound">صادرة</option>
        </select>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50">
              <th className="p-3 text-start">الموضوع</th>
              <th className="p-3 text-start">الاتجاه</th>
              <th className="p-3 text-start">المرسل/المستلم</th>
              <th className="p-3 text-start">التاريخ</th>
              <th className="p-3 text-start">الحالة</th>
            </tr></thead>
            <tbody>
              {filtered.map((l: any) => (
                <tr key={l.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium">{l.subject || "-"}</td>
                  <td className="p-3"><Badge className={DIRECTION_MAP[l.direction]?.color}>{DIRECTION_MAP[l.direction]?.label || l.direction}</Badge></td>
                  <td className="p-3 text-gray-500">{l.toNumber || l.fromNumber || "-"}</td>
                  <td className="p-3 text-gray-500">{l.createdAt ? formatDateAr(l.createdAt) : "-"}</td>
                  <td className="p-3">
                    <Badge className={STATUS_MAP[l.status]?.color || "bg-gray-100 text-gray-700"}>
                      {STATUS_MAP[l.status]?.label || l.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">لا توجد مراسلات</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
