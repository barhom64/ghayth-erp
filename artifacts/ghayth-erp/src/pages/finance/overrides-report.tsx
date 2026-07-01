import { useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
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
import { PrintButton } from "@/components/shared/print-button";
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
  // Before/after diff — populated by the resolver (migration 225) so
  // the report shows what the rule WOULD have picked vs what the
  // operator pinned. NULL on legacy rows written before #1327.
  proposedAccountId: number | null;
  proposedAccountCode: string | null;
  proposedCostCenterId: number | null;
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
    "التاريخ", "المصدر", "البند",
    "اقترح الحساب (Before)", "اقترح مركز التكلفة (Before)",
    "الحساب الفعلي (After)", "مركز التكلفة الفعلي (After)",
    "تغيير؟",
    "بواسطة (override)", "السبب", "بواسطة (resolve)",
  ];
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through the unified export helper for audit + letterhead.
  const items = rows.map((r) => {
    const acctChanged = r.proposedAccountCode !== r.resolvedAccountCode;
    const ccChanged = (r.proposedCostCenterId ?? null) !== (r.costCenterId ?? null);
    return {
      [headers[0]]: r.resolvedAt?.slice(0, 19).replace("T", " ") ?? "",
      [headers[1]]: SOURCE_LABEL[r.sourceTable] ?? r.sourceTable,
      [headers[2]]: String(r.sourceLineId),
      [headers[3]]: r.proposedAccountCode ?? "",
      [headers[4]]: r.proposedCostCenterId ? String(r.proposedCostCenterId) : "",
      [headers[5]]: r.resolvedAccountCode ?? "",
      [headers[6]]: r.costCenterId ? String(r.costCenterId) : "",
      [headers[7]]: acctChanged || ccChanged ? "نعم" : "لا",
      [headers[8]]: r.manualOverrideBy ? String(r.manualOverrideBy) : "",
      [headers[9]]: r.manualOverrideReason ?? "",
      [headers[10]]: r.resolvedBy ? String(r.resolvedBy) : "",
    };
  });
  void exportRowsToCsv({
    entityType: "report_overrides",
    title: `سجل تعديلات التوجيه — ${todayLocal()}`,
    rows: items,
    columns: headers.map((h) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
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
    // ─── Before/after diff (migration 225) ──────────────────────────
    // proposedAccountCode = what the rule WOULD have picked
    // resolvedAccountCode = what the operator actually pinned
    // If they're equal, no real override happened (likely a legacy row
    // written before #1327 where proposed* is NULL). When NULL, render
    // a faded em-dash so the column stays visually aligned.
    { key: "proposedAccountCode", header: "اقترح (Before)",
      render: (r) => r.proposedAccountCode
        ? <span className="font-mono text-xs text-muted-foreground">{r.proposedAccountCode}</span>
        : <span className="text-muted-foreground italic text-xs">—</span> },
    { key: "resolvedAccountCode", header: "اختار (After)",
      render: (r) => {
        if (!r.resolvedAccountCode) return <span className="text-muted-foreground italic text-xs">—</span>;
        const changed = r.proposedAccountCode != null && r.proposedAccountCode !== r.resolvedAccountCode;
        return (
          <span className={`font-mono text-xs ${changed ? "font-bold text-status-warning-foreground" : ""}`}>
            {r.resolvedAccountCode}
          </span>
        );
      },
    },
    { key: "proposedCostCenterId", header: "مركز التكلفة المقترح",
      render: (r) => r.proposedCostCenterId
        ? <span className="font-mono text-xs text-muted-foreground">cc:{r.proposedCostCenterId}</span>
        : <span className="text-muted-foreground italic text-xs">—</span> },
    { key: "costCenterId", header: "مركز التكلفة المختار",
      render: (r) => {
        if (!r.costCenterId) return <span className="text-muted-foreground italic text-xs">—</span>;
        const changed = (r.proposedCostCenterId ?? null) !== (r.costCenterId ?? null);
        return (
          <span className={`font-mono text-xs ${changed ? "font-bold text-status-warning-foreground" : ""}`}>
            cc:{r.costCenterId}
          </span>
        );
      },
    },
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
      title="سجل التعديلات اليدوية"
      subtitle="مراجعة تدقيقية — كل تجاوز يدوي في توجيه البنود المحاسبية مع المستخدم والسبب"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/allocation-results", label: "سجل التوجيه" },
        { label: "التعديلات اليدوية" },
      ]}
      actions={
        <>
          <GuardedButton perm="finance:export" variant="outline" size="sm"
            onClick={() => exportCSV(filtered)}>
            <Download className="h-3.5 w-3.5 me-1" /> تصدير CSV
          </GuardedButton>
          <PrintButton
            entityType="report_overrides"
            entityId="all"
            payload={{
              entity: { title: "تقرير التعديلات اليدوية", count: filtered.length },
              items: filtered,
            }}
          />
        </>
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
            <CardTitle className="text-sm">أكثر المستخدمين تعديلاً (أعلى ٥)</CardTitle>
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
