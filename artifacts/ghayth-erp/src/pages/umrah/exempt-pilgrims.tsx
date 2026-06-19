import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { DataTable, type DataTableColumn, PageShell } from "@workspace/ui-core";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Shield, Download, RefreshCw } from "lucide-react";
import { formatUmrahDate, todayLocal } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";

// Compliance rollup for the per-pilgrim exemption flag (PRs #1482-1484).
// A pilgrim's exemption is visible on their detail page, but a compliance
// officer wanting "show me everyone currently exempt + who authorised it"
// had no view. This page closes that gap. Read-only by design — the
// un-exempt action lives on the pilgrim detail page (single source of
// truth for the PATCH semantics + audit log entry).

interface ExemptRow {
  id: number;
  fullName: string;
  nuskNumber: string | null;
  nationality: string | null;
  status: string;
  reason: string | null;
  exemptedAt: string | null;
  exemptedById: number | null;
  exemptedByName: string | null;
  seasonId: number | null;
  groupId: number | null;
  agentId: number | null;
  seasonTitle: string | null;
  groupName: string | null;
  groupNuskNumber: string | null;
  agentName: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  overstayDays: number | null;
}

interface SeasonOpt { id: number; title: string }
interface AgentOpt { id: number; name: string }

const PILGRIM_STATUS_LABELS: Record<string, string> = {
  pending: "لم يصل",
  arrived: "وصل",
  active: "نشط",
  overstayed: "متأخر",
  overstay_penalized: "متأخر مع غرامة",
  departed: "غادر",
  violated: "مخالف",
  absconded: "هارب",
  deceased: "متوفى",
  visa_rejected: "تأشيرة مرفوضة",
  visa_printed: "تأشيرة مطبوعة",
  cancelled: "ملغي",
};

function buildQuery(seasonId: string, agentId: string): string {
  const parts: string[] = [];
  if (seasonId && seasonId !== "all") parts.push(`seasonId=${seasonId}`);
  if (agentId && agentId !== "all") parts.push(`agentId=${agentId}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export default function UmrahExemptPilgrims() {
  // Hydrate the season + agent filters from the URL query string on
  // mount so deep-links from the compliance dashboard (e.g.
  // /umrah/exempt-pilgrims?seasonId=5) actually apply the filter
  // instead of silently dropping it. Matches the pattern that
  // `pilgrims.tsx` and `penalties.tsx` already use; was the only
  // remaining compliance deep-link target without it.
  const initialFromUrl = (() => {
    if (typeof window === "undefined") return { seasonId: "all", agentId: "all" };
    const sp = new URLSearchParams(window.location.search);
    return {
      seasonId: sp.get("seasonId") ?? "all",
      agentId: sp.get("agentId") ?? "all",
    };
  })();
  const [seasonFilter, setSeasonFilter] = useState(initialFromUrl.seasonId);
  const [agentFilter, setAgentFilter] = useState(initialFromUrl.agentId);
  const { toast } = useToast();

  const qs = useMemo(() => buildQuery(seasonFilter, agentFilter), [seasonFilter, agentFilter]);

  const { data, isLoading, isError, refetch } = useApiQuery<{ data: ExemptRow[]; total: number }>(
    ["umrah-exempt-pilgrims", seasonFilter, agentFilter],
    `/umrah/reports/exempt-pilgrims${qs}`,
  );

  const { data: seasonsResp } = useApiQuery<{ data: SeasonOpt[] }>(
    ["umrah-seasons-select"],
    "/umrah/seasons",
  );
  const { data: agentsResp } = useApiQuery<{ data: AgentOpt[] }>(
    ["umrah-agents-select"],
    "/umrah/agents",
  );

  const qc = useQueryClient();
  const [unexemptingId, setUnexemptingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; failed: number } | null>(null);

  // Body mirrors the pilgrim-detail toggle path — the server clears
  // the overstayExempt{Reason,By,At} metadata when the flag flips
  // false (single PATCH semantic across both UIs).
  const unExempt = async (id: number) => {
    setUnexemptingId(id);
    try {
      await apiFetch(`/umrah/pilgrims/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ overstayExempt: false }),
      });
      toast({ title: "تم إلغاء الاستثناء" });
      qc.invalidateQueries({ queryKey: ["umrah-exempt-pilgrims"] });
    } catch (e: any) {
      toast({ variant: "destructive", title: "تعذّر إلغاء الاستثناء", description: e?.message });
    } finally {
      setUnexemptingId(null);
    }
  };

  // Bulk un-exempt — sequential PATCH (no batch endpoint exists; the
  // per-row PATCH path already audits + emits the event each time, so
  // sequencing keeps the audit log readable in chronological order
  // and avoids a thundering-herd against the server). The result
  // tally lets the operator see partial failures explicitly rather
  // than a single toast.
  const runBulkUnExempt = async () => {
    setBulkRunning(true);
    setBulkResult(null);
    let ok = 0;
    let failed = 0;
    for (const id of Array.from(selectedIds)) {
      try {
        await apiFetch(`/umrah/pilgrims/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ overstayExempt: false }),
        });
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkResult({ ok, failed });
    setBulkRunning(false);
    qc.invalidateQueries({ queryKey: ["umrah-exempt-pilgrims"] });
    setSelectedIds(new Set());
    if (failed === 0) {
      toast({ title: `تم إلغاء استثناء ${ok} معتمر` });
    } else {
      toast({
        variant: "destructive",
        title: `إلغاء جزئي: ${ok} نجحت، ${failed} فشلت`,
        description: "افتح كل صف فاشل من قائمة المعتمرين لمعرفة السبب",
      });
    }
  };

  const toggleSelectAll = (visibleIds: number[]) => {
    const allSelected = visibleIds.every((i) => selectedIds.has(i));
    const next = new Set(selectedIds);
    if (allSelected) {
      visibleIds.forEach((i) => next.delete(i));
    } else {
      visibleIds.forEach((i) => next.add(i));
    }
    setSelectedIds(next);
  };

  const toggleSelectOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={refetch} />;

  const rows = data?.data ?? [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(rows);
  const seasons = seasonsResp?.data ?? [];
  const agents = agentsResp?.data ?? [];

  const visibleIds = rows.map((r) => r.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((i) => selectedIds.has(i));

  const cols: DataTableColumn<ExemptRow>[] = [
    {
      key: "select" as any,
      header: (
        <Checkbox
          checked={allVisibleSelected}
          onCheckedChange={() => toggleSelectAll(visibleIds)}
          data-testid="exempt-select-all"
        />
      ) as any,
      render: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={selectedIds.has(p.id)}
            onCheckedChange={() => toggleSelectOne(p.id)}
            data-testid={`exempt-select-${p.id}`}
          />
        </div>
      ),
    },
    {
      key: "fullName",
      header: "الاسم",
      render: (p) => (
        <Link
          href={`/umrah/pilgrims/${p.id}`}
          className="font-medium text-blue-600 hover:underline"
          data-testid={`exempt-pilgrim-link-${p.id}`}
        >
          {p.fullName}
        </Link>
      ),
    },
    {
      key: "nuskNumber",
      header: "رقم نسك",
      render: (p) => p.nuskNumber ? <span className="font-mono text-xs">{p.nuskNumber}</span> : "—",
    },
    { key: "nationality", header: "الجنسية", render: (p) => p.nationality || "—" },
    {
      key: "status",
      header: "الحالة",
      render: (p) => (
        <Badge variant="outline" className="text-xs">
          {PILGRIM_STATUS_LABELS[p.status] || p.status}
        </Badge>
      ),
    },
    {
      key: "groupName",
      header: "المجموعة",
      render: (p) =>
        p.groupId ? (
          <Link href={`/umrah/groups/${p.groupId}`} className="text-xs text-blue-600 hover:underline">
            {p.groupName || `#${p.groupId}`}
          </Link>
        ) : "—",
    },
    {
      key: "agentName",
      header: "الوكيل",
      render: (p) =>
        p.agentId ? (
          <Link href={`/umrah/agents/${p.agentId}`} className="text-xs text-blue-600 hover:underline">
            {p.agentName || `#${p.agentId}`}
          </Link>
        ) : "—",
    },
    {
      key: "reason",
      header: "السبب",
      render: (p) => (
        <span className="text-xs max-w-[200px] inline-block truncate" title={p.reason || ""}>
          {p.reason || "—"}
        </span>
      ),
    },
    {
      key: "exemptedByName",
      header: "بواسطة",
      render: (p) => <span className="text-xs">{p.exemptedByName || "—"}</span>,
    },
    {
      key: "exemptedAt",
      header: "تاريخ الاستثناء",
      render: (p) => p.exemptedAt ? <span className="text-xs">{formatUmrahDate(p.exemptedAt)}</span> : "—",
    },
    {
      key: "actions" as any,
      header: "إجراء",
      render: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          <GuardedButton
            perm="umrah:update"
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => unExempt(p.id)}
            disabled={unexemptingId === p.id}
            data-testid={`unexempt-${p.id}`}
            rateLimitAware
          >
            إلغاء الاستثناء
          </GuardedButton>
        </div>
      ),
    },
  ];

  // GAP_MATRIX item #7 — uses the unified export helper so the
  // download appears in /reports/print-log with audit + letterhead.
  // Same filtered rows the operator sees on screen.
  const exportCsv = () => {
    void exportRowsToCsv({
      entityType: "report_umrah_exempt_pilgrims",
      title: `قائمة المعتمرين المعفيين — ${todayLocal()}`,
      rows: rows as unknown as Record<string, unknown>[],
      columns: [
        { key: "id",              label: "id" },
        { key: "fullName",        label: "fullName" },
        { key: "nuskNumber",      label: "nuskNumber" },
        { key: "nationality",     label: "nationality" },
        { key: "status",          label: "status" },
        { key: "groupName",       label: "groupName" },
        { key: "agentName",       label: "agentName" },
        { key: "seasonTitle",     label: "seasonTitle" },
        { key: "reason",          label: "reason" },
        { key: "exemptedByName",  label: "exemptedByName" },
        { key: "exemptedAt",      label: "exemptedAt" },
      ],
    }).catch((err) => console.error("[export] failed", err));
  };

  return (
    <PageShell
      title="المعتمرون المعفون من مسح التأخّر"
      subtitle="تقرير امتثال — يعرض من تم استثناؤه ومن أصدر الاستثناء ومتى"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "استثناءات التأخّر" }]}
      actions={
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <GuardedButton
              perm="umrah:update"
              variant="destructive"
              size="sm"
              onClick={() => setBulkConfirmOpen(true)}
              className="gap-1"
              data-testid="exempt-bulk-unexempt-button"
              rateLimitAware
            >
              إلغاء استثناء {selectedIds.size}
            </GuardedButton>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="h-3 w-3" /> تحديث
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="gap-1"
            data-testid="exempt-export-csv"
          >
            <Download className="h-3 w-3" /> تصدير CSV
          </Button>
          <PrintButton
            entityType="report_umrah_exempt_pilgrims"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: { title: "المعتمرون المستثنون", total: printRows.length },
              items: printRows.map((p: any) => ({
                "الاسم": p.pilgrimName || p.name || "—",
                "رقم الجواز": p.passportNumber || "—",
                "الجنسية": p.nationality || "—",
                "السبب": p.exemptionReason || p.reason || "—",
                "التاريخ": p.exemptedAt || p.createdAt || "—",
              })),
            })}
          />
        </div>
      }
    >
      <UmrahTabsNav />

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الموسم</label>
            <Select value={seasonFilter} onValueChange={setSeasonFilter}>
              <SelectTrigger className="w-[180px]" data-testid="exempt-filter-season">
                <SelectValue placeholder="كل المواسم" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المواسم</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">الوكيل</label>
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[180px]" data-testid="exempt-filter-agent">
                <SelectValue placeholder="كل الوكلاء" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الوكلاء</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mr-auto flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-status-warning-foreground" />
            <span className="text-muted-foreground">إجمالي المستثنون:</span>
            <span className="font-bold text-lg" data-testid="exempt-total-count">{rows.length}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm" data-testid="exempt-empty-state">
              لا يوجد معتمرون مستثنون حالياً ضمن هذا الفلتر.
            </div>
          ) : (
            <DataTable<ExemptRow>
              onSortedDataChange={setPrintRows}
        data={rows}
              columns={cols}
              data-testid="exempt-pilgrims-table"
            />
          )}
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={bulkConfirmOpen}
        onOpenChange={(o) => { if (!o && !bulkRunning) setBulkConfirmOpen(false); }}
        variant="destructive"
        title="تأكيد إلغاء الاستثناء الجماعي"
        description={
          <>
            سيتم إلغاء استثناء {selectedIds.size} معتمر من مسح التأخّر اليومي. كل سطر سيتم تسجيله في سجل التدقيق.
            {bulkResult && (
              <span className="block mt-2 text-xs">
                آخر تشغيل: نجحت {bulkResult.ok} — فشلت {bulkResult.failed}
              </span>
            )}
          </>
        }
        confirmLabel={bulkRunning ? "جاري المعالجة…" : "تأكيد"}
        pending={bulkRunning}
        onConfirm={async () => { await runBulkUnExempt(); setBulkConfirmOpen(false); }}
        contentTestId="exempt-bulk-confirm-dialog"
        confirmButtonTestId="exempt-bulk-confirm-button"
      />
    </PageShell>
  );
}
