import { PageShell } from "@/components/page-shell";
import { useApiQuery } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateAr } from "@/lib/formatters";
import { useState } from "react";
import {
  RefreshCw, Activity, Zap, Filter,
} from "lucide-react";

export default function AdminEventMonitor() {
  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["event-catalog"], "/admin/governance/event-catalog"
  );
  const [domainFilter, setDomainFilter] = useState<string>("all");

  const total = data?.total ?? 0;
  const byDomain = data?.byDomain ?? {};
  const catalog = data?.catalog ?? [];
  const recentEvents = data?.recentEvents ?? [];

  const domainKeys = Object.keys(byDomain).sort();
  const filteredCatalog = domainFilter === "all"
    ? catalog
    : catalog.filter((e: any) => e.domain === domainFilter);

  return (
    <PageShell
      title="كتالوج الأحداث"
      subtitle="جميع الأحداث المسجلة في النظام وآخر الأحداث الفعلية"
      loading={isLoading}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 me-1" />تحديث
        </Button>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-xs text-gray-500">حدث مسجل</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{domainKeys.length}</p>
                <p className="text-xs text-gray-500">نطاق</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{catalog.filter((e: any) => e.critical).length}</p>
                <p className="text-xs text-gray-500">حدث حرج</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <p className="text-2xl font-bold">{recentEvents.length}</p>
                <p className="text-xs text-gray-500">أحداث أخيرة</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4" />
                توزيع الأحداث حسب النطاق
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {domainKeys.map((domain) => (
                  <Badge
                    key={domain}
                    variant={domainFilter === domain ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setDomainFilter(domainFilter === domain ? "all" : domain)}
                  >
                    {domain}: {byDomain[domain]}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          {recentEvents.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  آخر 20 حدث فعلي
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[300px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 sticky top-0">
                        <th className="p-2 text-start">الحدث</th>
                        <th className="p-2 text-start">الكيان</th>
                        <th className="p-2 text-start">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentEvents.map((ev: any, i: number) => (
                        <tr key={i} className="border-b hover:bg-gray-50">
                          <td className="p-2 font-mono text-xs">{ev.action}</td>
                          <td className="p-2 text-xs">{ev.entity || "—"}</td>
                          <td className="p-2 text-xs">{formatDateAr(ev.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="w-4 h-4" />
                كتالوج الأحداث
                {domainFilter !== "all" && <Badge>{domainFilter}</Badge>}
                <span className="text-gray-400 font-normal">({filteredCatalog.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 sticky top-0">
                      <th className="p-2 text-start">الحدث</th>
                      <th className="p-2 text-start">النطاق</th>
                      <th className="p-2 text-start">الوصف</th>
                      <th className="p-2 text-start">حرج</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCatalog.map((ev: any, i: number) => (
                      <tr key={i} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-mono text-xs">{ev.action}</td>
                        <td className="p-2"><Badge variant="outline" className="text-[10px]">{ev.domain}</Badge></td>
                        <td className="p-2 text-xs">{ev.label}</td>
                        <td className="p-2">
                          {ev.critical && <Badge className="bg-red-100 text-red-800">حرج</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </PageStateWrapper>
    </PageShell>
  );
}
