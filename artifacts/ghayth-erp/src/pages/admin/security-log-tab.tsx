import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@workspace/ui-core";
import { UnifiedDateInput } from "@/components/ui/unified-date-input";

const REASON_LABELS: Record<string, string> = {
  permission_denied: "صلاحية مرفوضة",
  module_access_denied: "وحدة غير مسموحة",
  module_access_denied_no_modules: "لا توجد وحدات",
  insufficient_level: "مستوى غير كافٍ",
  role_required: "دور غير مصرح",
};

const securityLogColumns: DataTableColumn<any>[] = [
  {
    key: "userName",
    header: "المستخدم",
    sortable: true,
    searchable: true,
    render: (row) => (
      <div>
        <div className="font-medium text-xs">{row.userName || row.userEmail || `#${row.userId}`}</div>
        {row.userEmail && row.userName && <div className="text-muted-foreground text-xs">{row.userEmail}</div>}
      </div>
    ),
  },
  {
    key: "role",
    header: "الدور",
    sortable: true,
    render: (row) => <Badge variant="outline" className="text-xs">{row.role}</Badge>,
  },
  {
    key: "path",
    header: "المسار",
    searchable: true,
    render: (row) => (
      <code className="text-xs bg-surface-subtle px-1.5 py-0.5 rounded">{row.method} {row.path}</code>
    ),
  },
  {
    key: "requiredPerms",
    header: "الصلاحيات المطلوبة",
    render: (row) => (
      <div className="flex flex-wrap gap-1">
        {(Array.isArray(row.requiredPerms) ? row.requiredPerms : []).map((p: string) => (
          <Badge key={p} className="text-xs bg-status-error-surface text-status-error-foreground border-status-error-surface">{p}</Badge>
        ))}
      </div>
    ),
  },
  {
    key: "reason",
    header: "السبب",
    sortable: true,
    render: (row) => (
      <Badge className={cn("text-xs", row.reason === "permission_denied" ? "bg-status-error-surface text-status-error-foreground" : "bg-status-warning-surface text-status-warning-foreground")}>
        {REASON_LABELS[row.reason] || row.reason}
      </Badge>
    ),
  },
  {
    key: "createdAt",
    header: "الوقت",
    sortable: true,
    render: (row) => (
      <span className="text-muted-foreground text-xs whitespace-nowrap">{formatDateAr(row.createdAt)}</span>
    ),
  },
];

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
          <ShieldAlert className="h-5 w-5 text-status-error-foreground" />
          سجل محاولات الوصول المرفوضة
        </h3>
        <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
      </div>

<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المحاولات", value: summary.total, color: "text-status-neutral-foreground bg-surface-subtle" },
          { label: "آخر 24 ساعة", value: summary.last24h, color: "text-status-warning-foreground bg-status-warning-surface" },
          { label: "صلاحية مرفوضة", value: summary.permissionDenied, color: "text-status-error-foreground bg-status-error-surface" },
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

      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-[150px]">
          <Label className="text-xs mb-1 block">نوع السبب</Label>
          <Select value={reason || "_none"} onValueChange={(v) => { setReason(v === "_none" ? "" : v); setPage(1); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— الكل —</SelectItem>
              {Object.entries(REASON_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <Label className="text-xs mb-1 block">من تاريخ</Label>
          <UnifiedDateInput inputClassName="text-sm" value={from} onChange={(iso) => { setFrom(iso); setPage(1); }} placeholder="من تاريخ" />
        </div>
      </div>

      <DataTable
        columns={securityLogColumns}
        data={rows}
        isLoading={isLoading}
        isError={isError}
       
        searchPlaceholder="بحث بالمستخدم أو المسار..."
        emptyMessage="لا توجد محاولات وصول مرفوضة"
        pageSize={pageSize}
        total={total}
        page={page}
        onPageChange={setPage}
        noToolbar={false}
      />
    </div>
  );
}
