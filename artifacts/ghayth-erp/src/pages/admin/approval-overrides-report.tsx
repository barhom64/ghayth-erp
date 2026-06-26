import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/formatters";
import { ShieldAlert, Globe, Calendar, AlertTriangle } from "lucide-react";
import { RefreshAction } from "@/components/page-actions";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

interface OverrideRecord {
  id: number;
  userId: number;
  userEmail: string | null;
  action: string;
  entity: string;
  entityId: number | null;
  before: any;
  after: any;
  changes: any;
  reason: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export default function ApprovalOverridesReportPage() {
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const qs: string[] = [];
  if (from) qs.push(`from=${encodeURIComponent(from)}`);
  if (to)   qs.push(`to=${encodeURIComponent(to)}`);
  const suffix = qs.length ? `?${qs.join("&")}` : "";

  const { data, isLoading, isError, refetch, isFetching } = useApiQuery<{ data: OverrideRecord[] }>(
    ["approval-overrides", from, to],
    `/approval-actions/overrides/report${suffix}`,
  );

  const rows = data?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);

  if (isLoading) return <LoadingSpinner />;

  if (isError) return <ErrorState />;


  const uniqueUsers = new Set(rows.map((r) => r.userId)).size;
  const uniqueEntities = new Set(rows.map((r) => `${r.entity}#${r.entityId ?? "?"}`)).size;

  const cols: DataTableColumn<OverrideRecord>[] = [
    {
      key: "createdAt",
      header: "الوقت",
      render: (r) => (
        <span className="text-xs font-mono whitespace-nowrap">
          {new Date(r.createdAt).toLocaleString("ar-SA")}
        </span>
      ),
    },
    {
      key: "userEmail",
      header: "المسؤول",
      render: (r) => (
        <span className="text-xs">{r.userEmail ?? `user#${r.userId}`}</span>
      ),
    },
    {
      key: "entity",
      header: "الكيان",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">{r.entity}</Badge>
          {r.entityId && (
            <span className="font-mono text-[10px] text-muted-foreground">#{r.entityId}</span>
          )}
        </div>
      ),
    },
    {
      key: "reason",
      header: "السبب",
      render: (r) => r.reason
        ? <span className="text-xs text-muted-foreground line-clamp-2 max-w-md">{r.reason}</span>
        : <Badge variant="outline" className="text-[10px] bg-red-50 border-red-300 text-red-700">بدون سبب</Badge>,
    },
    {
      key: "ipAddress",
      header: "IP",
      render: (r) => r.ipAddress
        ? (
          <span className="font-mono text-[10px] inline-flex items-center gap-1">
            <Globe className="h-2.5 w-2.5 text-muted-foreground" />
            {r.ipAddress}
          </span>
        )
        : <span className="text-muted-foreground italic text-xs">—</span>,
    },
    {
      key: "changes",
      header: "التغيير",
      render: (r) => {
        const c = r.changes || r.after;
        if (!c) return <span className="text-muted-foreground italic text-xs">—</span>;
        const summary = typeof c === "object" ? JSON.stringify(c).slice(0, 80) : String(c).slice(0, 80);
        return <span className="font-mono text-[10px] text-muted-foreground" title={JSON.stringify(c, null, 2)}>{summary}{summary.length >= 80 ? "…" : ""}</span>;
      },
    },
  ];

  return (
    <PageShell
      title="سجل تجاوزات الموافقات"
      subtitle="كل قرارات تجاوز سلسلة الاعتماد — متاح للمراجع الخارجي والمدير المالي"
      breadcrumbs={[
        { href: "/admin", label: "الإدارة" },
        { label: "تجاوز سير العمل" },
      ]}
      actions={
        <>
          <RefreshAction onRefresh={() => refetch()} disabled={isFetching} />
          <PrintButton
            entityType="report_admin_approval_overrides"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "سجل تجاوز Workflow", total: printRows.length },
              items: printRows.map((r) => ({
                "الوقت": r.createdAt || "—",
                "المسؤول": r.userEmail ?? `user#${r.userId}`,
                "الإجراء": r.action || "—",
                "الكيان": r.entity || "—",
                "رقم الكيان": r.entityId ?? "—",
                "السبب": r.reason || "—",
                "IP": r.ipAddress || "—",
              })),
            })}
          />
        </>
      }
    >
      <Card className="mb-4 border-red-300 bg-red-50/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2 text-red-900">
            <ShieldAlert className="h-4 w-4" /> ما هو "Workflow Override"؟
          </p>
          <p className="text-xs text-red-800 leading-relaxed">
            عندما يتجاوز مسؤول مخوّل (CFO/GM) خطوة في مسار اعتماد رسمي
            (مثلاً يعتمد فاتورة دون موافقة المدير المباشر) يُسَجَّل الحدث في
            <code className="bg-white border px-1 rounded mx-1">audit_logs.action = 'workflow_override'</code>.
            هذي الصفحة <strong>مقيدة للمراجعين</strong> (CFO + Audit + GM) وتظهر كل
            عمليات التجاوز للمراجعة الدورية.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertTriangle className="h-3 w-3" /> إجمالي التجاوزات
            </p>
            <p className="text-lg font-bold font-mono text-red-700">{formatNumber(rows.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">مسؤولون مختلفون</p>
            <p className="text-lg font-bold font-mono">{formatNumber(uniqueUsers)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">كيانات متجاوَزة</p>
            <p className="text-lg font-bold font-mono">{formatNumber(uniqueEntities)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3">
        <CardContent className="p-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> من
              </Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
            </div>
            <div>
              <Label className="text-xs flex items-center gap-1">
                <Calendar className="h-3 w-3" /> إلى
              </Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
            </div>
            {(from || to) && (
              <Button variant="ghost" size="sm" onClick={() => { setFrom(""); setTo(""); }}>
                مسح الفلتر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">السجلات ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={rows}
            onSortedDataChange={setPrintRows}
            pageSize={50}
            emptyMessage={
              from || to
                ? "لا توجد تجاوزات في هذي الفترة"
                : "ما في أي تجاوز للـ workflow بعد"
            }
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
