import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Shield, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { PaginationBar } from "@/components/data-table-wrapper";

const REASON_LABELS: Record<string, string> = {
  permission_denied: "صلاحية مرفوضة",
  module_access_denied: "وحدة غير مسموحة",
  module_access_denied_no_modules: "لا توجد وحدات",
  insufficient_level: "مستوى غير كافٍ",
  role_required: "دور غير مصرح",
};

export function SecurityLogTab() {
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(pageSize));
  if (reason) params.set("reason", reason);
  if (from) params.set("from", from);

  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["security-log", reason, from, String(page)],
    `/admin/security-log?${params.toString()}`
  );
  const rows = data?.data || [];
  const total = data?.total || 0;
  const summary = data?.summary || {};

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-600" />
          سجل محاولات الوصول المرفوضة
        </h3>
        <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
      </div>

      {isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-center text-red-700">
            <AlertTriangle className="h-6 w-6 mx-auto mb-2" />
            <p className="text-sm">حدث خطأ في تحميل سجل الأمان. يرجى المحاولة مجدداً.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>إعادة المحاولة</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المحاولات", value: summary.total, color: "text-gray-700 bg-gray-50" },
          { label: "آخر 24 ساعة", value: summary.last24h, color: "text-amber-700 bg-amber-50" },
          { label: "صلاحية مرفوضة", value: summary.permissionDenied, color: "text-red-700 bg-red-50" },
          { label: "وحدة غير مسموحة", value: summary.moduleDenied, color: "text-orange-700 bg-orange-50" },
        ].map(c => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className={cn("p-3 rounded-lg", c.color.split(" ")[1])}>
              <p className="text-2xl font-bold">{c.value ?? 0}</p>
              <p className={cn("text-xs mt-0.5", c.color.split(" ")[0])}>{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-0 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[150px]">
              <Label className="text-xs mb-1 block">نوع السبب</Label>
              <select className="w-full border rounded p-2 text-sm" value={reason} onChange={e => { setReason(e.target.value); setPage(1); }}>
                <option value="">— الكل —</option>
                {Object.entries(REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[150px]">
              <Label className="text-xs mb-1 block">من تاريخ</Label>
              <Input type="date" className="text-sm" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} />
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-6">جاري التحميل...</p>
          ) : rows.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
              <Shield className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>لا توجد محاولات وصول مرفوضة</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-gray-500">
                    <th className="p-2 text-start font-medium">المستخدم</th>
                    <th className="p-2 text-start font-medium">الدور</th>
                    <th className="p-2 text-start font-medium">المسار</th>
                    <th className="p-2 text-start font-medium">الصلاحيات المطلوبة</th>
                    <th className="p-2 text-start font-medium">السبب</th>
                    <th className="p-2 text-start font-medium">الوقت</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row: any) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="p-2">
                        <div className="font-medium text-xs">{row.userName || row.userEmail || `#${row.userId}`}</div>
                        {row.userEmail && row.userName && <div className="text-gray-400 text-xs">{row.userEmail}</div>}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-xs">{row.role}</Badge>
                      </td>
                      <td className="p-2">
                        <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{row.method} {row.path}</code>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {(Array.isArray(row.requiredPerms) ? row.requiredPerms : []).map((p: string) => (
                            <Badge key={p} className="text-xs bg-red-50 text-red-700 border-red-200">{p}</Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-2">
                        <Badge className={cn("text-xs", row.reason === "permission_denied" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
                          {REASON_LABELS[row.reason] || row.reason}
                        </Badge>
                      </td>
                      <td className="p-2 text-gray-500 text-xs whitespace-nowrap">{formatDateAr(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
