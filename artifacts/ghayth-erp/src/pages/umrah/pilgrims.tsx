import { useState, useEffect } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { UmrahAgentSelect } from "@/components/shared/entity-selects";
import { formatUmrahDate, todayLocal } from "@/lib/formatters";
import { Card, CardContent } from "@/components/ui/card";
import {
  PageStatusBadge,
  AdvancedFilters,
  useFilters,
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { Button } from "@/components/ui/button";
import { Plus, Users, AlertTriangle, Plane, UserPlus, X } from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { BulkCheckbox } from "@/components/shared/bulk-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PrintButton } from "@/components/shared/print-button";
import { usePrintRows } from "@/hooks/use-print-rows";

import { UMRAH_PILGRIM_STATUS_OPTIONS, umrahPilgrimStatusLabel } from "@/lib/umrah-pilgrim-status";

// PILGRIM_STATUSES is mirrored from the backend enum in routes/umrah.ts;
// the bulk-status dropdown should match the same option set so an
// operator picking a state can never send something the backend rejects.
// Labels live in `@/lib/umrah-pilgrim-status` so this dropdown, the
// AdvancedFilters strip below, and `pilgrim-detail.tsx`'s header badge
// all read the SAME wording — no divergence between cells.
const PILGRIM_STATUS_OPTIONS = UMRAH_PILGRIM_STATUS_OPTIONS;

export default function UmrahPilgrims() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  // useFilters tracks search/status; extraFilters (season/group) ride
  // along on the same values dict via dynamic keys.
  const [filters, setFilters] = useFilters();
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Deep-link filter pre-application — compliance dashboard tiles + the
  // visa-expiring banner navigate here with ?status=… / ?seasonId=… /
  // ?visaExpiringWithin=7 / ?agentId=…. Without this hook, the URL was
  // a no-op and the operator landed on an unfiltered list.
  //
  // Runs once on mount: the URL is the entry signal, subsequent
  // navigation within the page rewrites `filters` directly.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const known = ["status", "seasonId", "agentId", "groupId", "flight", "arrivalDate", "departureDate", "visaExpiringWithin", "search"];
    const next: Record<string, string> = {};
    let touched = false;
    for (const k of known) {
      const v = sp.get(k);
      if (v) { next[k] = v; touched = true; }
    }
    if (touched) setFilters({ ...filters, ...next } as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const seasonId = (filters as Record<string, string>).seasonId || "";
  const groupId = (filters as Record<string, string>).groupId || "";
  // Flight number rides on the same dynamic-keys pattern (no shared-
  // component change). Free text — operators paste partial numbers
  // like "PIA-310" / "SV-471" / "EK" depending on what their carrier
  // file printed.
  const flight = (filters as Record<string, string>).flight || "";
  // arrivalDate / departureDate ride the same dynamic-keys pattern.
  // YYYY-MM-DD strings in Riyadh-local time (todayLocal()) so the
  // "today" chip can't accidentally query UTC.
  const arrivalDate = (filters as Record<string, string>).arrivalDate || "";
  const departureDate = (filters as Record<string, string>).departureDate || "";
  // Visa-expiring window — the banner uses 7-day default but the
  // operator can flip the active filter (set by the banner click) on
  // and off. Empty string means "no filter".
  const visaExpiringWithin = (filters as Record<string, string>).visaExpiringWithin || "";
  const { data: resp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["umrah-pilgrims", filters.search, filters.status, seasonId, groupId, flight, arrivalDate, departureDate, visaExpiringWithin, String(page)],
    `/umrah/pilgrims?search=${encodeURIComponent(filters.search)}&status=${filters.status || ""}&seasonId=${encodeURIComponent(seasonId)}&groupId=${encodeURIComponent(groupId)}&flight=${encodeURIComponent(flight)}&arrivalDate=${encodeURIComponent(arrivalDate)}&departureDate=${encodeURIComponent(departureDate)}&visaExpiringWithin=${encodeURIComponent(visaExpiringWithin)}&page=${page}&limit=${pageSize}`,
  );

  // Independent count query — banner shows even when the operator
  // hasn't filtered. Uses limit=1 so the round-trip stays cheap; we
  // only care about `total`. Stale-while-revalidate is fine here —
  // the banner is informational, not a control input.
  const { data: visaSoonResp } = useApiQuery<{ total?: number }>(
    ["umrah-pilgrims-visa-expiring", "7"],
    `/umrah/pilgrims?visaExpiringWithin=7&limit=1`,
  );
  const visaSoonCount = Number(visaSoonResp?.total ?? 0);

  // Seasons + groups feed the extraFilters dropdowns so operators can
  // narrow the pilgrim list by the two most common scopes (this season,
  // this group). The lists are small + cached, so an unconditional fetch
  // is fine.
  const { data: seasonsResp } = useApiQuery<{ data: any[] }>(["umrah-seasons"], "/umrah/seasons");
  const seasons = asList(seasonsResp?.data || seasonsResp);
  const { data: groupsResp } = useApiQuery<{ data: any[] }>(["umrah-groups"], "/umrah/groups");
  const groups = asList(groupsResp?.data || groupsResp);
  const items = resp?.data || [];
  const { sortedRows: printRows, setSortedRows: setPrintRows } = usePrintRows<any>(items);
  const total = resp?.total || 0;

  // GET /umrah/unassigned — pilgrims without an agent. Shows up as an
  // alert banner so the operator can spot them and run the bulk-assign
  // flow below.
  const { data: unassignedResp } = useApiQuery<{ data: any[] }>(
    ["umrah-pilgrims-unassigned"],
    "/umrah/unassigned",
  );
  const unassignedCount = unassignedResp?.data?.length ?? 0;

  // UMR-BULK — POST /umrah/assign-bulk takes {pilgrimIds, agentId} and
  // sets the agent on every selected pilgrim. The endpoint had no UI;
  // wired here as a multi-select + agent picker that appears once at
  // least one row is selected.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkAgentId, setBulkAgentId] = useState<string>("");
  const bulkAssignMut = useApiMutation<unknown, { pilgrimIds: number[]; agentId: number }>(
    "/umrah/assign-bulk",
    "POST",
    [["umrah-pilgrims"]],
    {
      successMessage: "تم إسناد المعتمرين للوكيل",
      onSuccess: () => {
        setSelectedIds(new Set());
        setBulkAgentId("");
        refetch();
      },
    },
  );

  // Bulk status — the flight-landing flow. Operator selects every
  // pilgrim on the arriving flight, picks "وصل" once. Backend
  // validates each row's current status against the transition map,
  // so an already-departed row in the selection is skipped (not
  // silently regressed). Toast shows updated + skipped counts.
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const bulkStatusMut = useApiMutation<
    { updated: number; skipped: number; toStatus: string },
    { pilgrimIds: number[]; status: string }
  >(
    "/umrah/pilgrims/status-bulk",
    "POST",
    [["umrah-pilgrims"]],
    {
      onSuccess: (r) => {
        toast({
          title: "تم تحديث الحالة دفعةً",
          description: r.skipped > 0
            ? `تم تحديث ${r.updated} | تخطّي ${r.skipped} (انتقال غير مسموح من حالتهم الحالية)`
            : `تم تحديث ${r.updated} معتمر`,
        });
        setSelectedIds(new Set());
        setBulkStatus("");
        refetch();
      },
    },
  );
  const submitBulkStatus = () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    bulkStatusMut.mutate({ pilgrimIds: Array.from(selectedIds), status: bulkStatus });
  };
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    const pageIds = (items as Array<{ id: number }>).map((p) => p.id);
    if (pageIds.every((id) => selectedIds.has(id))) {
      const next = new Set(selectedIds);
      for (const id of pageIds) next.delete(id);
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      for (const id of pageIds) next.add(id);
      setSelectedIds(next);
    }
  };
  const submitBulk = () => {
    if (!bulkAgentId || selectedIds.size === 0) return;
    bulkAssignMut.mutate({ pilgrimIds: Array.from(selectedIds), agentId: Number(bulkAgentId) });
  };

  const kpiCards = [
    { label: "إجمالي المعتمرين", value: total, icon: Users, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "داخل المملكة", value: (items ?? []).filter((p: any) => ["arrived", "active"].includes(p.status)).length, icon: Plane, color: "text-status-success-foreground bg-status-success-surface" },
    { label: "متأخرين", value: (items ?? []).filter((p: any) => p.status === "overstayed").length, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
    { label: "بدون وكيل", value: (items ?? []).filter((p: any) => !p.agentId).length, icon: UserPlus, color: "text-orange-600 bg-orange-50" },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const pageIds = (items as Array<{ id: number }>).map((p) => p.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (p) => (
        <span onClick={(e) => e.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} />
        </span>
      ),
    },
    {
      key: "fullName",
      header: "الاسم",
      sortable: true,
      render: (p) => (
        <Link href={`/umrah/pilgrims/${p.id}`} className="text-primary hover:underline font-medium">{p.fullName}</Link>
      ),
    },
    { key: "passportNumber", header: "الجواز", sortable: true },
    { key: "nationality", header: "الجنسية", sortable: true },
    {
      key: "agentName",
      header: "الوكيل",
      sortable: true,
      render: (p) => p.agentName || <span className="text-orange-500">غير معيّن</span>,
    },
    {
      key: "arrivalDate",
      header: "الوصول",
      sortable: true,
      render: (p) => formatUmrahDate(p.arrivalDate),
    },
    {
      key: "departureDate",
      header: "المغادرة",
      sortable: true,
      render: (p) => formatUmrahDate(p.departureDate),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (p) => <PageStatusBadge status={p.status} />,
    },
  ];

  return (
    <PageShell
      title="المعتمرين"
      subtitle="متابعة ملفات المعتمرين وحالاتهم"
      breadcrumbs={[{ href: "/umrah", label: "إدارة العمرة" }, { label: "المعتمرين" }]}
      actions={
        <div className="flex items-center gap-2">
          <PrintButton
            entityType="report_umrah_pilgrims"
            entityId="list"
            size="icon"
            payload={() => ({
              entity: {
                title: "قائمة المعتمرين",
                total: printRows.length,
                unassigned: unassignedCount,
              },
              items: printRows.map((p: any) => ({
                "الاسم": p.fullName || p.name || "—",
                "رقم نسك": p.nuskNumber || "—",
                "الجواز": p.passportNumber || "—",
                "الجنسية": p.nationality || "—",
                "المجموعة": p.groupName || "—",
                "الوكيل الفرعي": p.subAgentName || "—",
                "الحالة": umrahPilgrimStatusLabel(p.status),
              })),
            })}
          />
          <Link href="/umrah/pilgrims/create">
            <GuardedButton perm="umrah:create" className="gap-2"><Plus className="h-4 w-4" />إضافة معتمر</GuardedButton>
          </Link>
        </div>
      }
    >
      <UmrahTabsNav />

      {unassignedCount > 0 && (
        <div className="rounded-md border border-status-warning-surface bg-status-warning-surface/30 p-3 text-sm text-status-warning-foreground">
          <strong>{unassignedCount}</strong> معتمر بدون وكيل — اختر الصفوف ثم استخدم زر "تعيين دفعة" أسفل لتعيين وكيل.
        </div>
      )}

      {/* Visa-expiring banner — the daily compliance siren. Surfaces a
          count of pilgrims with visa expiring within 7 days so the
          operator chases them BEFORE the visa expires (becomes a KSA
          overstay fine). Click "عرضهم" to apply the matching filter;
          a second click on the active filter clears it. */}
      {visaSoonCount > 0 && (
        <div
          data-testid="pilgrims-visa-expiring-banner"
          className="rounded-md border border-status-error-surface bg-status-error-surface/30 p-3 text-sm text-status-error-foreground flex items-center gap-3 justify-between flex-wrap"
        >
          <span>
            <strong>{visaSoonCount}</strong> معتمر تنتهي تأشيرتهم خلال ٧ أيام — تابعوهم قبل تحوّل الحالة إلى مخالف.
          </span>
          <Button
            size="sm"
            variant={visaExpiringWithin === "7" ? "default" : "outline"}
            className="text-xs h-7 gap-1"
            data-testid="pilgrims-visa-expiring-filter"
            onClick={() => {
              const next = visaExpiringWithin === "7" ? "" : "7";
              setFilters({ ...filters, visaExpiringWithin: next } as any);
              setPage(1);
            }}
          >
            {visaExpiringWithin === "7" ? "إلغاء التصفية" : "عرضهم"}
          </Button>
        </div>
      )}

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {kpiCards.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Flight number — free-text input alongside the AdvancedFilters
          dropdowns since extraFilters only supports option lists. Paired
          with bulk-status flip (PR #1430), this is the operator's
          flight-day landing flow: type "PIA-310" → pick all → mark
          arrived in one click. The two "today" chips next to it are
          the morning landing question: "who's coming in / who's
          leaving today?" — one click. */}
      <div className="flex items-center gap-2 -mb-3 flex-wrap">
        <label className="text-xs text-muted-foreground whitespace-nowrap" htmlFor="pilgrims-flight-filter">رقم الرحلة:</label>
        <input
          id="pilgrims-flight-filter"
          data-testid="pilgrims-flight-filter"
          type="text"
          value={flight}
          onChange={(e) => { setFilters({ ...filters, flight: e.target.value } as any); setPage(1); }}
          placeholder="مثال: PIA-310"
          className="h-8 w-40 text-xs rounded border border-input bg-background px-2"
        />
        <Button
          variant={arrivalDate === todayLocal() ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1"
          data-testid="pilgrims-today-arrivals"
          onClick={() => {
            const t = todayLocal();
            const next = arrivalDate === t ? "" : t;
            setFilters({ ...filters, arrivalDate: next, departureDate: "" } as any);
            setPage(1);
          }}
        >
          <Plane className="h-3.5 w-3.5" />
          وصول اليوم
        </Button>
        <Button
          variant={departureDate === todayLocal() ? "default" : "outline"}
          size="sm"
          className="h-8 text-xs gap-1"
          data-testid="pilgrims-today-departures"
          onClick={() => {
            const t = todayLocal();
            const next = departureDate === t ? "" : t;
            setFilters({ ...filters, departureDate: next, arrivalDate: "" } as any);
            setPage(1);
          }}
        >
          <Plane className="h-3.5 w-3.5 rotate-180" />
          مغادرة اليوم
        </Button>
        {(arrivalDate || departureDate) && (
          <span className="text-xs text-muted-foreground">
            {arrivalDate ? `وصول: ${arrivalDate}` : `مغادرة: ${departureDate}`}
          </span>
        )}
      </div>

      <AdvancedFilters
        config={{
          // Placeholder enumerates everything the search box hits so the
          // operator stops asking "can I search by NUSK?" — answer is yes.
          searchPlaceholder: "بحث بالاسم / الجواز / التأشيرة / رقم نسك...",
          statuses: [...PILGRIM_STATUS_OPTIONS],
          extraFilters: [
            {
              key: "seasonId",
              label: "الموسم",
              options: seasons.map((s: any) => ({ value: String(s.id), label: s.name })),
            },
            {
              key: "groupId",
              label: "المجموعة",
              options: groups.map((g: any) => ({ value: String(g.id), label: g.name })),
            },
          ],
        }}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        // Export hits the dedicated /pilgrims/export.csv endpoint so
        // the operator gets EVERY matching row (not just the visible
        // page). Same query string as the list refetch so what they
        // see + what they download stay in sync. The endpoint emits a
        // 21-column manifest with NUSK, visa, flights, hotel, agent —
        // exactly what MOFA / hotels / bus drivers need.
        onExportCSV={() => {
          const qs = `search=${encodeURIComponent(filters.search)}&status=${filters.status || ""}&seasonId=${encodeURIComponent(seasonId)}&groupId=${encodeURIComponent(groupId)}&flight=${encodeURIComponent(flight)}&arrivalDate=${encodeURIComponent(arrivalDate)}&departureDate=${encodeURIComponent(departureDate)}&visaExpiringWithin=${encodeURIComponent(visaExpiringWithin)}`;
          window.location.href = `/api/umrah/pilgrims/export.csv?${qs}`;
        }}
        resultCount={total}
      />

      {selectedIds.size > 0 && (
        <Card className="border-status-info-surface bg-status-info-surface/30">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">{selectedIds.size}</span>
              <span className="text-muted-foreground">معتمر محدّد للإسناد</span>
            </div>
            <UmrahAgentSelect
              label="الوكيل"
              hideLabel
              className="w-56"
              placeholder="اختر الوكيل"
              value={bulkAgentId}
              onChange={setBulkAgentId}
            />
            <GuardedButton
              perm="umrah:create"
              size="sm"
              disabled={!bulkAgentId || bulkAssignMut.isPending}
              onClick={submitBulk}
              rateLimitAware
              className="gap-1"
            >
              <UserPlus className="h-3.5 w-3.5" />
              {bulkAssignMut.isPending ? "جاري الإسناد..." : "إسناد دفعة"}
            </GuardedButton>
            {/* Bulk status flip — picks the target state once, server-side
                transition map silently skips rows whose current state
                doesn't allow it (toast surfaces the skip count). */}
            <span className="mx-1 text-muted-foreground text-xs">|</span>
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger className="w-44 h-8 text-xs" data-testid="bulk-status-select">
                <SelectValue placeholder="تغيير الحالة دفعةً" />
              </SelectTrigger>
              <SelectContent>
                {PILGRIM_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <GuardedButton
              perm="umrah:update"
              size="sm"
              disabled={!bulkStatus || bulkStatusMut.isPending}
              onClick={submitBulkStatus}
              rateLimitAware
              className="gap-1"
              data-testid="bulk-status-apply"
            >
              <Plane className="h-3.5 w-3.5" />
              {bulkStatusMut.isPending ? "جاري التحديث..." : "تطبيق الحالة"}
            </GuardedButton>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3 w-3" /> إلغاء التحديد
            </Button>
          </CardContent>
        </Card>
      )}

      {pageIds.length > 0 && (
        <div className="flex justify-start -mb-3">
          <Button variant="ghost" size="sm" className="text-xs" onClick={toggleSelectAll}>
            {allPageSelected ? "إلغاء تحديد هذه الصفحة" : "تحديد كل هذه الصفحة"}
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        onSortedDataChange={setPrintRows}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا يوجد معتمرين"
        emptyIcon={<Users className="h-6 w-6 text-slate-400" />}
        pageSize={pageSize}
        page={page}
        total={total}
        onPageChange={setPage}
        noToolbar
        onRowClick={(row) => navigate(`/umrah/pilgrims/${row.id}`)}
      />
    </PageShell>
  );
}
