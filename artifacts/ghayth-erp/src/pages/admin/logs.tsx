import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollText, ChevronDown, ChevronUp, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { DatePicker } from "@/components/ui/date-picker";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";

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

  const logColumns: DataTableColumn<any>[] = [
    {
      key: "expand",
      header: "",
      width: "32px",
      render: (r: any) => expandedId === r.id
        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
        : <ChevronDown className="h-4 w-4 text-muted-foreground" />,
    },
    { key: "userName", header: "المستخدم", sortable: true, render: (r: any) => <span className="font-medium">{r.userName || "النظام"}</span> },
    {
      key: "action",
      header: "الإجراء",
      sortable: true,
      render: (r: any) => (
        <Badge className={cn("text-[10px]",
          r.action?.includes("create") ? "bg-status-success-surface text-status-success-foreground" :
          r.action?.includes("delete") ? "bg-status-error-surface text-status-error-foreground" :
          r.action?.includes("update") ? "bg-status-info-surface text-status-info-foreground" :
          "bg-surface-subtle text-status-neutral-foreground"
        )}>
          {ACTION_LABELS[r.action] || r.action}
        </Badge>
      ),
    },
    { key: "entity", header: "الكيان", sortable: true, render: (r: any) => <span className="text-muted-foreground">{ENTITY_LABELS[r.entity] || r.entity}</span> },
    { key: "entityId", header: "المعرّف", render: (r: any) => <span className="font-mono text-xs text-muted-foreground">#{r.entityId}</span> },
    { key: "reason", header: "السبب", render: (r: any) => <span className="text-xs text-muted-foreground max-w-[150px] truncate block">{r.reason || "-"}</span> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (r: any) => <span className="text-xs text-muted-foreground">{r.createdAt ? formatDateAr(r.createdAt) : "-"}</span> },
  ];

  const renderChanges = (log: any) => {
    const beforeData = log.before || log.beforeData;
    const afterData = log.after || log.afterData;
    const changes = log.changes;

    if (changes && typeof changes === "object" && !Array.isArray(changes)) {
      return (
        <div className="space-y-1">
          {Object.entries(changes).map(([key, val]: [string, any]) => (
            <div key={key} className="flex items-start gap-2 text-xs">
              <span className="font-mono bg-surface-subtle px-1.5 py-0.5 rounded text-muted-foreground flex-shrink-0">{key}</span>
              {val && typeof val === "object" && "from" in val ? (
                <>
                  <span className="text-status-error line-through">{String(val.from ?? "-")}</span>
                  <span className="text-muted-foreground">←</span>
                  <span className="text-status-success-foreground font-medium">{String(val.to ?? "-")}</span>
                </>
              ) : (
                <span className="text-muted-foreground">{JSON.stringify(val)}</span>
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
            <Label className="text-xs text-status-error mb-1 block">قبل التغيير</Label>
            <pre className="text-[10px] bg-status-error-surface p-2 rounded border border-status-error-surface overflow-auto max-h-40 font-mono" dir="ltr">{safeParse(beforeData)}</pre>
          </div>
        )}
        {afterData && (
          <div>
            <Label className="text-xs text-status-success mb-1 block">بعد التغيير</Label>
            <pre className="text-[10px] bg-status-success-surface p-2 rounded border border-status-success-surface overflow-auto max-h-40 font-mono" dir="ltr">{safeParse(afterData)}</pre>
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
            <ScrollText className="w-8 h-8 text-status-warning-foreground" />
            سجل التدقيق
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">عرض وتصفية جميع العمليات والتغييرات في النظام</p>
        </div>
        <div className="flex gap-2">
          <GuardedButton perm="admin:export" variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 me-1" />تصدير جدولي
          </GuardedButton>
          <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي السجلات", value: total, color: "bg-surface-subtle text-status-neutral-foreground" },
          { label: "إنشاء", value: logs.filter((l: any) => l.action?.includes("create")).length, color: "bg-status-success-surface text-status-success-foreground" },
          { label: "تعديل", value: logs.filter((l: any) => l.action?.includes("update")).length, color: "bg-status-info-surface text-status-info-foreground" },
          { label: "حذف", value: logs.filter((l: any) => l.action?.includes("delete")).length, color: "bg-status-error-surface text-status-error-foreground" },
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
              <Select value={entityFilter || "_none"} onValueChange={(v) => { setEntityFilter(v === "_none" ? "" : v); setPage(1); }}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">الكل</SelectItem>
                  {entityTypes.map(e => <SelectItem key={e} value={e}>{ENTITY_LABELS[e] || e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">نوع الإجراء</Label>
              <Select value={actionFilter || "_none"} onValueChange={(v) => { setActionFilter(v === "_none" ? "" : v); setPage(1); }}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">الكل</SelectItem>
                  <SelectItem value="create">إنشاء</SelectItem>
                  <SelectItem value="update">تعديل</SelectItem>
                  <SelectItem value="delete">حذف</SelectItem>
                </SelectContent>
              </Select>
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

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">سجلات المراجعة</span>
          <Badge variant="outline" className="text-xs">{total} سجل</Badge>
        </div>
        <DataTable
          columns={logColumns}
          data={filteredLogs}
          isLoading={isLoading}
          isError={isError}
         
          noToolbar
          emptyMessage="لا توجد سجلات"
          emptyIcon={<ScrollText className="h-8 w-8 mx-auto mb-2 text-gray-300" />}
          onRowClick={(r: any) => setExpandedId(expandedId === r.id ? null : r.id)}
          rowClassName={(r: any) => expandedId === r.id ? "bg-status-warning-surface/50" : undefined}
          renderRowExtras={(r: any) => expandedId === r.id ? (
            <div className="p-4 bg-surface-subtle border-b">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {r.ipAddress && <span>IP: <code className="bg-white px-1 rounded">{r.ipAddress}</code></span>}
                  {r.scope && <span>النطاق: <code className="bg-white px-1 rounded">{JSON.stringify(r.scope)}</code></span>}
                </div>
                {renderChanges(r)}
              </div>
            </div>
          ) : null}
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
