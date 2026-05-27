import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatNumber, formatDateAr, todayLocal } from "@/lib/formatters";
import { Pencil, Download, ShieldAlert } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { AllocationTabsNav } from "@/components/shared/allocation-tabs-nav";

/**
 * Manual Overrides Audit Report — focused view of every line where
 * a finance user overrode the auto-resolver's account/cost-center
 * choice. Each row carries the actor, timestamp, sourceLine ref,
 * resolved account, and the justification text.
 *
 * Consumes /finance/allocation-results with status=manual_override
 * — same endpoint as #1095 but with this status filter pinned and
 * presentation tuned to forensic review (per-actor counts,
 * per-source-table breakdown, CSV export).
 */

interface OverrideRow {
  id: number;
  sourceTable: string;
  sourceLineId: number;
  documentType: string | null;
  resolvedAccountId: number | null;
  resolvedAccountCode: string | null;
  costCenterId: number | null;
  dimensionsJson: any;
  ruleId: number | null;
  resolutionStatus: string;
  warningsJson: any;
  resolvedBy: number | null;
  resolvedAt: string | null;
  manualOverrideBy: number | null;
  manualOverrideReason: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  invoice_lines: "بند فاتورة",
  purchase_order_items: "بند أمر شراء",
  purchase_request_items: "بند طلب شراء",
  goods_receipt_items: "بند GRN",
  journal_lines: "سطر قيد",
  expense_lines: "بند مصروف",
};

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(rows: OverrideRow[]) {
  const headers = [
    "التاريخ", "المصدر", "البند", "الحساب الناتج", "مركز التكلفة",
    "بواسطة (override)", "السبب", "بواسطة (resolve)",
  ];
  const csv = [
    headers,
    ...rows.map((r) => [
      csvEscape(r.resolvedAt?.slice(0, 19).replace("T", " ") ?? ""),
      csvEscape(SOURCE_LABEL[r.sourceTable] ?? r.sourceTable),
      String(r.sourceLineId),
      csvEscape(r.resolvedAccountCode ?? ""),
      r.costCenterId ? String(r.costCenterId) : "",
      r.manualOverrideBy ? String(r.manualOverrideBy) : "",
      csvEscape(r.manualOverrideReason ?? ""),
      r.resolvedBy ? String(r.resolvedBy) : "",
    ]),
  ].map((r) => r.join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `manual-overrides-${todayLocal()}.csv`;
  link.click();
}

export default function OverridesReportPage() {
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams({ status: "manual_override" });
  if (sourceFilter) params.set("sourceTable", sourceFilter);

  const { data, isLoading, isError } = useApiQuery<{ data: OverrideRow[]; total: number }>(
    ["overrides-report", sourceFilter],
    `/finance/allocation-results?${params.toString()}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const allRows = data?.data ?? [];

  const filtered = search
    ? allRows.filter((r) => {
        const s = search.toLowerCase();
        return (r.resolvedAccountCode ?? "").toLowerCase().includes(s)
          || (r.manualOverrideReason ?? "").toLowerCase().includes(s)
          || String(r.sourceLineId).includes(s);
      })
    : allRows;

  // Stats
  const byActor = new Map<number, number>();
  const bySource = new Map<string, number>();
  for (const r of allRows) {
    if (r.manualOverrideBy != null) {
      byActor.set(r.manualOverrideBy, (byActor.get(r.manualOverrideBy) ?? 0) + 1);
    }
    bySource.set(r.sourceTable, (bySource.get(r.sourceTable) ?? 0) + 1);
  }

  const cols: DataTableColumn<OverrideRow>[] = [
    { key: "resolvedAt", header: "التاريخ",
      render: (r) => <span className="text-xs">{r.resolvedAt ? formatDateAr(r.resolvedAt) : "—"}</span> },
    { key: "sourceTable", header: "المصدر",
      render: (r) => (
        <Badge variant="outline" className="text-xs">
          {SOURCE_LABEL[r.sourceTable] ?? r.sourceTable}
        </Badge>
      ),
    },
    { key: "sourceLineId", header: "البند",
      render: (r) => <span className="font-mono text-xs">#{r.sourceLineId}</span> },
    { key: "resolvedAccountCode", header: "الحساب الناتج",
      render: (r) => r.resolvedAccountCode
        ? <span className="font-mono text-xs">{r.resolvedAccountCode}</span>
        : <span className="text-muted-foreground italic text-xs">—</span> },
    { key: "costCenterId", header: "مركز التكلفة",
      render: (r) => r.costCenterId
        ? <span className="font-mono text-xs">cc:{r.costCenterId}</span>
        : <span className="text-muted-foreground italic text-xs">—</span> },
    { key: "manualOverrideBy", header: "بواسطة",
      render: (r) => r.manualOverrideBy
        ? <span className="font-mono text-xs">user:{r.manualOverrideBy}</span>
        : <span className="text-muted-foreground italic text-xs">—</span> },
    { key: "manualOverrideReason", header: "السبب",
      render: (r) => (
        <span className="text-xs italic">
          {r.manualOverrideReason || <span className="text-destructive">— مفقود —</span>}
        </span>
      ),
    },
    { key: "rule", header: "القاعدة الافتراضية",
      render: (r) => r.ruleId
        ? (
          <Link href="/finance/allocation-rules" className="text-status-info-foreground hover:underline font-mono text-xs">
            تم تجاوزها (#{r.ruleId})
          </Link>
        )
        : <span className="text-muted-foreground italic text-xs">بدون</span> },
  ];

  const topActors = Array.from(byActor.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <PageShell
      title="سجل التعديلات اليدوية (Manual Overrides)"
      subtitle="forensic audit — كل override في توجيه البنود المحاسبية مع المستخدم والسبب"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/allocation-results", label: "سجل التوجيه" },
        { label: "التعديلات اليدوية" },
      ]}
      actions={
        <GuardedButton perm="finance:export" variant="outline" size="sm"
          onClick={() => exportCSV(filtered)}>
          <Download className="h-3.5 w-3.5 me-1" /> تصدير CSV
        </GuardedButton>
      }
    >
      <FinanceTabsNav />
      <AllocationTabsNav />

      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" /> لماذا هذا التقرير؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            كل قاعدة تلقائية يمكن تجاوزها يدوياً من المستخدم عبر `LineAllocationPanel`
            بشرط ذكر سبب. هذا التقرير يجمع كل التعديلات اليدوية في مكان واحد
            للمراجعة الدورية من قبل المدير المالي أو المراجع الداخلي — للتأكد
            من أن الـ overrides مبررة وليست تحايلاً على قواعد المحاسبة.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="border-purple-300">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Pencil className="h-3 w-3" /> إجمالي التعديلات
            </p>
            <p className="text-lg font-bold font-mono text-purple-700">{formatNumber(allRows.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">مستخدمون مختلفون</p>
            <p className="text-lg font-bold font-mono">{byActor.size}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">مصادر مختلفة</p>
            <p className="text-lg font-bold font-mono">{bySource.size}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">بدون سبب</p>
            <p className="text-lg font-bold font-mono text-destructive">
              {formatNumber(allRows.filter((r) => !r.manualOverrideReason).length)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">يجب مراجعتها</p>
          </CardContent>
        </Card>
      </div>

      {topActors.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">أكثر المستخدمين تعديلاً (Top 5)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {topActors.map(([userId, count]) => (
                <Badge key={userId} className="bg-purple-100 text-purple-800 text-xs">
                  user:{userId} — {count} تعديل
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Input
          placeholder="بحث بالحساب أو السبب..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <div className="w-px h-4 bg-border mx-2" />
        <span className="text-xs text-muted-foreground">المصدر:</span>
        <Badge variant={sourceFilter === "" ? "default" : "outline"}
          className="cursor-pointer text-xs"
          onClick={() => setSourceFilter("")}>الكل</Badge>
        {Object.entries(SOURCE_LABEL).map(([k, v]) => (
          <Badge
            key={k}
            variant={sourceFilter === k ? "default" : "outline"}
            className="cursor-pointer text-xs"
            onClick={() => setSourceFilter(k)}
          >{v}</Badge>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            التعديلات اليدوية ({filtered.length}
            {search || sourceFilter ? ` من ${allRows.length}` : ""})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={filtered}
            pageSize={50}
            emptyMessage={
              search || sourceFilter
                ? "لا توجد تعديلات بهذي الفلاتر"
                : "لا توجد تعديلات يدوية بعد — كل قرارات التوجيه تلقائية"
            }
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
