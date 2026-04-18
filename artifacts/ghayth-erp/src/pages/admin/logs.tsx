import { useState, Fragment } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollText, ChevronDown, ChevronUp, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { DatePicker } from "@/components/ui/date-picker";
import { PaginationBar } from "@/components/data-table-wrapper";

const ACTION_LABELS: Record<string, string> = {
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  "status.change": "تغيير حالة",
  approve: "موافقة",
  reject: "رفض",
};

const ENTITY_LABELS: Record<string, string> = {
  employees: "الموظفين", clients: "العملاء", tasks: "المهام", projects: "المشاريع",
  invoices: "الفواتير", vehicles: "المركبات", tickets: "التذاكر", users: "المستخدمين",
  role_permissions: "صلاحيات الأدوار", permissions: "صلاحيات المستخدمين",
  employee_assignments: "التعيينات", hr_leave_requests: "الإجازات",
};

export default function AdminLogsPage() {
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: entitiesData } = useApiQuery<any>(["audit-entities"], "/audit-logs/entities");
  const entityTypes: string[] = entitiesData?.data || [];

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(pageSize));
  if (entityFilter) params.set("entityType", entityFilter);
  if (actionFilter) params.set("action", actionFilter);
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data: logsData, isLoading, isError, refetch } = useApiQuery<any>(
    ["audit-logs", entityFilter, actionFilter, dateFrom, dateTo, String(page)],
    `/audit-logs?${params.toString()}`
  );
  const logs = logsData?.data || [];
  const total = logsData?.total || 0;

  const filteredLogs = userSearch
    ? logs.filter((l: any) =>
        l.userName?.includes(userSearch) || l.entity?.includes(userSearch) || l.action?.includes(userSearch) || String(l.entityId)?.includes(userSearch)
      )
    : logs;

  const renderChanges = (log: any) => {
    const beforeData = log.before || log.beforeData;
    const afterData = log.after || log.afterData;
    const changes = log.changes;

    if (changes && typeof changes === "object" && !Array.isArray(changes)) {
      return (
        <div className="space-y-1">
          {Object.entries(changes).map(([key, val]: [string, any]) => (
            <div key={key} className="flex items-start gap-2 text-xs">
              <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 flex-shrink-0">{key}</span>
              {val && typeof val === "object" && "from" in val ? (
                <>
                  <span className="text-red-500 line-through">{String(val.from ?? "-")}</span>
                  <span className="text-gray-400">←</span>
                  <span className="text-green-600 font-medium">{String(val.to ?? "-")}</span>
                </>
              ) : (
                <span className="text-gray-600">{JSON.stringify(val)}</span>
              )}
            </div>
          ))}
        </div>
      );
    }

    const safeParse = (d: any) => {
      try { return JSON.stringify(typeof d === "string" ? JSON.parse(d) : d, null, 2); } catch { return String(d); }
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {beforeData && (
          <div>
            <Label className="text-xs text-red-500 mb-1 block">قبل التغيير</Label>
            <pre className="text-[10px] bg-red-50 p-2 rounded border border-red-100 overflow-auto max-h-40 font-mono" dir="ltr">{safeParse(beforeData)}</pre>
          </div>
        )}
        {afterData && (
          <div>
            <Label className="text-xs text-green-500 mb-1 block">بعد التغيير</Label>
            <pre className="text-[10px] bg-green-50 p-2 rounded border border-green-100 overflow-auto max-h-40 font-mono" dir="ltr">{safeParse(afterData)}</pre>
          </div>
        )}
      </div>
    );
  };

  const exportCSV = () => {
    const headers = ["المستخدم", "الإجراء", "الكيان", "المعرف", "التاريخ"];
    const rows = filteredLogs.map((l: any) => [
      l.userName || "النظام",
      ACTION_LABELS[l.action] || l.action,
      ENTITY_LABELS[l.entity] || l.entity,
      `#${l.entityId}`,
      l.createdAt ? formatDateAr(l.createdAt) : "-",
    ]);
    const csvContent = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "audit-logs.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="w-8 h-8 text-amber-600" />
            سجل التدقيق
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">عرض وتصفية جميع العمليات والتغييرات في النظام</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 me-1" />تصدير جدولي
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي السجلات", value: total, color: "bg-gray-50 text-gray-700" },
          { label: "إنشاء", value: logs.filter((l: any) => l.action?.includes("create")).length, color: "bg-green-50 text-green-700" },
          { label: "تعديل", value: logs.filter((l: any) => l.action?.includes("update")).length, color: "bg-blue-50 text-blue-700" },
          { label: "حذف", value: logs.filter((l: any) => l.action?.includes("delete")).length, color: "bg-red-50 text-red-700" },
        ].map(c => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className={cn("p-3 rounded-lg", c.color)}>
              <p className="text-2xl font-bold">{c.value}</p>
              <p className="text-xs mt-0.5">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <Label className="text-xs mb-1 block">نوع الكيان</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-white" value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}>
                <option value="">الكل</option>
                {entityTypes.map(e => <option key={e} value={e}>{ENTITY_LABELS[e] || e}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">نوع الإجراء</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-white" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}>
                <option value="">الكل</option>
                <option value="create">إنشاء</option>
                <option value="update">تعديل</option>
                <option value="delete">حذف</option>
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">من تاريخ</Label>
              <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(1); }} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">إلى تاريخ</Label>
              <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setPage(1); }} />
            </div>
            <div>
              <Label className="text-xs mb-1 block">بحث بالمستخدم</Label>
              <Input className="text-sm" placeholder="اسم المستخدم..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>سجلات المراجعة</span>
            <Badge variant="outline" className="text-xs">{total} سجل</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="p-3 text-start w-8"></th>
                <th className="p-3 text-start">المستخدم</th>
                <th className="p-3 text-start">الإجراء</th>
                <th className="p-3 text-start">الكيان</th>
                <th className="p-3 text-start">المعرّف</th>
                <th className="p-3 text-start">السبب</th>
                <th className="p-3 text-start">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">جاري التحميل...</td></tr>
              ) : isError ? (
                <tr><td colSpan={7} className="p-8 text-center text-red-500">
                  حدث خطأ <Button variant="outline" size="sm" className="ms-2" onClick={() => refetch()}>إعادة المحاولة</Button>
                </td></tr>
              ) : filteredLogs.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-gray-400">
                  <ScrollText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  لا توجد سجلات
                </td></tr>
              ) : (
                filteredLogs.map((log: any) => (
                  <Fragment key={log.id}>
                    <tr
                      className={cn("border-b hover:bg-gray-50 cursor-pointer transition-colors", expandedId === log.id && "bg-amber-50/50")}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <td className="p-3">
                        {expandedId === log.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </td>
                      <td className="p-3 font-medium">{log.userName || "النظام"}</td>
                      <td className="p-3">
                        <Badge className={cn("text-[10px]",
                          log.action?.includes("create") ? "bg-green-100 text-green-700" :
                          log.action?.includes("delete") ? "bg-red-100 text-red-700" :
                          log.action?.includes("update") ? "bg-blue-100 text-blue-700" :
                          "bg-gray-100 text-gray-700"
                        )}>
                          {ACTION_LABELS[log.action] || log.action}
                        </Badge>
                      </td>
                      <td className="p-3 text-gray-500">{ENTITY_LABELS[log.entity] || log.entity}</td>
                      <td className="p-3 font-mono text-xs text-gray-400">#{log.entityId}</td>
                      <td className="p-3 text-xs text-gray-500 max-w-[150px] truncate">{log.reason || "-"}</td>
                      <td className="p-3 text-xs text-gray-400">{log.createdAt ? formatDateAr(log.createdAt) : "-"}</td>
                    </tr>
                    {expandedId === log.id && (
                      <tr>
                        <td colSpan={7} className="p-4 bg-gray-50 border-b">
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                              {log.ipAddress && <span>IP: <code className="bg-white px-1 rounded">{log.ipAddress}</code></span>}
                              {log.scope && <span>النطاق: <code className="bg-white px-1 rounded">{JSON.stringify(log.scope)}</code></span>}
                            </div>
                            {renderChanges(log)}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
          <PaginationBar page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
