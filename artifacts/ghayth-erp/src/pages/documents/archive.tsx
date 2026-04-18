import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Archive, FileText, Calendar, Search, FolderArchive } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function DocumentsArchive() {
  const [search, setSearch] = useState("");
  const { data: docsResp, isLoading, isError } = useApiQuery<any>(["documents-archive"], "/documents");
  const docs = asList<any>(docsResp);

  const statCards = [
    { label: "مستندات مؤرشفة", value: docs.length, icon: FolderArchive, color: "text-blue-600 bg-blue-50" },
    { label: "عقود", value: docs.filter((d: any) => d.type === "contract").length, icon: FileText, color: "text-green-600 bg-green-50" },
    { label: "تقارير", value: docs.filter((d: any) => d.type === "report").length, icon: Archive, color: "text-purple-600 bg-purple-50" },
    { label: "إجمالي", value: docs.length, icon: Calendar, color: "text-orange-600 bg-orange-50" },
  ];

  const filtered = docs.filter((d: any) => !search || d.title?.includes(search) || d.type?.includes(search));

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">الأرشيف</h1>

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

      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input placeholder="بحث في الأرشيف..." value={search} onChange={(e) => setSearch(e.target.value)} className="ps-10" />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-gray-50">
              <th className="p-3 text-start">المستند</th>
              <th className="p-3 text-start">النوع</th>
              <th className="p-3 text-start">التاريخ</th>
              <th className="p-3 text-start">الحالة</th>
            </tr></thead>
            <tbody>
              {filtered.map((d: any) => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 font-medium flex items-center gap-2"><FileText className="w-4 h-4 text-gray-400" />{d.title || d.name || "-"}</td>
                  <td className="p-3"><Badge variant="outline">{d.type || "-"}</Badge></td>
                  <td className="p-3 text-gray-500">{d.createdAt ? formatDateAr(d.createdAt) : "-"}</td>
                  <td className="p-3"><Badge className="bg-green-100 text-green-700">{d.status || "مؤرشف"}</Badge></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-gray-400">لا توجد مستندات</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
