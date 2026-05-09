/**
 * /hr/violations — الصفحة الأم لمنظومة الانضباط والمخالفات.
 *
 * صفحة موحّدة تعرض كل ما يحتاجه HR والمدير العام في مكان واحد:
 *   - نظرة عامة (KPIs + توزيع حسب المرحلة + المحاضر العاجلة)
 *   - قائمة المحاضر التأديبية (هي السجل الرسمي)
 *   - الرصد التلقائي (تحويل التأخر/الغياب إلى محاضر)
 *   - لائحة الانضباط المرجعية
 *
 * كل تبويب يقبل deep-link عبر ?tab=... فيمكن للسايدبار / الإشعارات أن
 * تفتح المستخدم على المكان الصحيح بدون التنقل اليدوي.
 */
import { useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { PageShell } from "@/components/page-shell";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PageStatusBadge } from "@/components/page-status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { VIOLATION_STATUS } from "@/lib/hr-type-maps";
import { cn } from "@/lib/utils";
import {
  Plus, AlertTriangle, Scale, DollarSign, Shield, Clock, Ban, Gavel,
  ScrollText, MapPin, PenLine, DoorOpen, FileText, Radar, ArrowLeft,
  ListChecks, BookOpen, TrendingUp,
} from "lucide-react";

const STATUS_OPTIONS = Object.entries(VIOLATION_STATUS).map(([value, { label }]) => ({ value, label }));

const INCIDENT_LABELS: Record<string, { label: string; Icon: typeof Clock; color: string }> = {
  late:             { label: "تأخر",         Icon: Clock,      color: "text-amber-600 bg-amber-50"   },
  early_leave:      { label: "مغادرة مبكرة", Icon: DoorOpen,   color: "text-orange-600 bg-orange-50" },
  absence:          { label: "غياب",         Icon: Ban,        color: "text-red-600 bg-red-50"       },
  behavior:         { label: "سلوك",         Icon: Gavel,      color: "text-purple-600 bg-purple-50" },
  organization:     { label: "تنظيم",        Icon: ScrollText, color: "text-blue-600 bg-blue-50"     },
  gps_out_of_range: { label: "خروج GPS",     Icon: MapPin,     color: "text-emerald-600 bg-emerald-50" },
  custom:           { label: "مخصّص",        Icon: PenLine,    color: "text-slate-600 bg-slate-50"   },
};

const VALID_TABS = ["overview", "memos", "auto", "regulation"] as const;
type TabKey = (typeof VALID_TABS)[number];

function getTabFromQuery(qs: string): TabKey {
  const params = new URLSearchParams(qs);
  const tab = params.get("tab");
  if (tab && (VALID_TABS as readonly string[]).includes(tab)) return tab as TabKey;
  return "overview";
}

export default function ViolationsPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const activeTab = getTabFromQuery(search);

  const { data: memosResp, isLoading, isError } = useApiQuery<{ data: any[]; total: number }>(
    ["discipline-memos"],
    "/hr/discipline/memos",
  );
  const memos = memosResp?.data || [];

  const { data: stats } = useApiQuery<any>(
    ["discipline-memos-stats"],
    "/hr/discipline/stats",
  );

  const setTab = (next: string) => {
    const params = new URLSearchParams(search);
    if (next === "overview") params.delete("tab");
    else params.set("tab", next);
    const qs = params.toString();
    navigate(`/hr/violations${qs ? `?${qs}` : ""}`);
  };

  const kpis = useMemo(() => {
    const total = Number(stats?.total ?? memos.length);
    const pending =
      Number(stats?.pendingEmployee ?? 0) +
      Number(stats?.pendingManager ?? 0) +
      Number(stats?.pendingGm ?? 0);
    const approved = Number(stats?.approved ?? memos.filter((m: any) => m.status === "approved").length);
    const totalDeductions = Number(stats?.totalDeductions ?? memos.reduce(
      (s: number, m: any) => s + Number(m.appliedDeductionAmount || 0) + Number(m.appliedExtraDeduction || 0),
      0,
    ));
    return [
      { label: "إجمالي المحاضر", value: total, icon: FileText, color: "text-blue-600 bg-blue-50" },
      { label: "بانتظار الإجراء", value: pending, icon: AlertTriangle, color: "text-amber-600 bg-amber-50" },
      { label: "إجمالي الخصومات", value: formatCurrency(totalDeductions), icon: DollarSign, color: "text-red-600 bg-red-50" },
      { label: "محاضر منفذة", value: approved, icon: Shield, color: "text-green-600 bg-green-50" },
    ];
  }, [stats, memos]);

  if (isLoading) {
    return (
      <PageShell
        title="المخالفات والجزاءات"
        subtitle="الصفحة الأم لمنظومة الانضباط"
        loading
        breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "المخالفات والجزاءات" }]}
      >
        <Card><CardContent className="py-12"><LoadingSpinner /></CardContent></Card>
      </PageShell>
    );
  }
  if (isError) {
    return (
      <PageShell
        title="المخالفات والجزاءات"
        breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "المخالفات والجزاءات" }]}
      >
        <ErrorState />
      </PageShell>
    );
  }

  return (
    <PageShell
      title="المخالفات والجزاءات"
      subtitle="الصفحة الأم — كل المحاضر، الرصد التلقائي، واللائحة في مكان واحد"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }, { label: "المخالفات والجزاءات" }]}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/hr/violations/auto-detection">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Radar className="h-4 w-4" /> تشغيل الرصد
            </Button>
          </Link>
          <Link href="/hr/violations/create">
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> تسجيل مخالفة
            </Button>
          </Link>
        </div>
      }
    >
      <HrTabsNav />
      <KpiGrid items={kpis} />

      <Tabs value={activeTab} onValueChange={setTab} dir="rtl" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 max-w-3xl">
          <TabsTrigger value="overview" className="gap-1.5">
            <ListChecks className="h-4 w-4" /> نظرة عامة
          </TabsTrigger>
          <TabsTrigger value="memos" className="gap-1.5">
            <FileText className="h-4 w-4" /> المحاضر
          </TabsTrigger>
          <TabsTrigger value="auto" className="gap-1.5">
            <Radar className="h-4 w-4" /> الرصد التلقائي
          </TabsTrigger>
          <TabsTrigger value="regulation" className="gap-1.5">
            <BookOpen className="h-4 w-4" /> لائحة الانضباط
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab memos={memos} stats={stats} /></TabsContent>
        <TabsContent value="memos"><MemosTab memos={memos} /></TabsContent>
        <TabsContent value="auto"><AutoDetectionLink /></TabsContent>
        <TabsContent value="regulation"><RegulationLink /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

// ───────────────────────── Overview Tab ─────────────────────────

function OverviewTab({ memos, stats }: { memos: any[]; stats: any }) {
  const pendingMemos = memos.filter((m: any) =>
    m.status?.startsWith("pending") || m.status === "draft"
  ).slice(0, 8);
  const terminationCount = memos.filter((m: any) => m.terminationDecided).length;

  const byStage = [
    { label: "مسوّدات", value: Number(memos.filter((m: any) => m.status === "draft").length), color: "bg-gray-200 text-gray-700" },
    { label: "بانتظار الموظف", value: Number(stats?.pendingEmployee ?? 0), color: "bg-blue-100 text-blue-700" },
    { label: "بانتظار المدير", value: Number(stats?.pendingManager ?? 0), color: "bg-amber-100 text-amber-700" },
    { label: "بانتظار المدير العام", value: Number(stats?.pendingGm ?? 0), color: "bg-purple-100 text-purple-700" },
    { label: "معتمد", value: Number(stats?.approved ?? 0), color: "bg-green-100 text-green-700" },
    { label: "مرفوض", value: Number(stats?.rejected ?? 0), color: "bg-red-100 text-red-700" },
  ];

  return (
    <div className="space-y-4">
      {terminationCount > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            يوجد <strong>{terminationCount}</strong> محضر يتضمن قرار فصل — يرجى المراجعة
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              توزيع المحاضر حسب المرحلة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {byStage.map((s) => (
                <div key={s.label} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-600">{s.label}</span>
                  <Badge variant="secondary" className={cn("font-bold text-sm px-3", s.color)}>
                    {s.value}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              محاضر تحتاج إجراءً عاجلًا
            </CardTitle>
            <Link href="/hr/violations?tab=memos">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                عرض الكل <ArrowLeft className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {pendingMemos.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">لا توجد محاضر معلقة</p>
            ) : (
              <div className="space-y-2">
                {pendingMemos.map((m: any) => (
                  <Link key={m.id} href={`/hr/discipline/memos/${m.id}`}>
                    <div className="flex items-center gap-2 p-2 rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors">
                      <AvatarInitial name={m.employeeName} color="red" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{m.employeeName}</p>
                        <p className="text-xs text-gray-500">
                          {INCIDENT_LABELS[m.incidentType]?.label || m.incidentType} • {formatDateAr(m.incidentDate)}
                        </p>
                      </div>
                      <PageStatusBadge status={m.status} domain="memo" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4 text-purple-500" />
            روابط سريعة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <QuickLink href="/hr/violations/create" icon={Plus} label="تسجيل مخالفة جديدة" color="text-red-600 bg-red-50" />
            <QuickLink href="/hr/violations/auto-detection" icon={Radar} label="إعدادات الرصد التلقائي" color="text-emerald-600 bg-emerald-50" />
            <QuickLink href="/hr/violations/penalty-escalation" icon={TrendingUp} label="سلم تصعيد العقوبات" color="text-amber-600 bg-amber-50" />
            <QuickLink href="/hr/discipline/regulation" icon={BookOpen} label="لائحة الانضباط الكاملة" color="text-blue-600 bg-blue-50" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function QuickLink({ href, icon: Icon, label, color }: { href: string; icon: any; label: string; color: string }) {
  return (
    <Link href={href}>
      <div className="flex items-center gap-3 p-3 rounded-lg border hover:border-blue-300 hover:shadow-sm cursor-pointer transition-all">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color.split(" ")[1])}>
          <Icon className={cn("w-5 h-5", color.split(" ")[0])} />
        </div>
        <span className="text-sm font-medium">{label}</span>
      </div>
    </Link>
  );
}

// ───────────────────────── Memos List Tab ─────────────────────────

function MemosTab({ memos }: { memos: any[] }) {
  const [, navigate] = useLocation();
  const [filters, setFilters] = useFilters();
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  const filtered = applyFilters(memos, filters, {
    searchFields: ["employeeName", "memoNumber"],
    statusField: "status",
    dateField: "createdAt",
  });

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    {
      key: "memoNumber",
      header: "رقم المحضر",
      sortable: true,
      render: (v) => (
        <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded">
          {v.memoNumber || `#${v.id}`}
        </span>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (v) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={v.employeeName} color="red" />
          <div>
            <span className="font-medium text-sm block">{v.employeeName}</span>
            {v.empNumber && <span className="text-xs text-gray-400">#{v.empNumber}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "incidentType",
      header: "نوع الواقعة",
      sortable: true,
      render: (v) => {
        const inc = INCIDENT_LABELS[v.incidentType];
        if (!inc) return <span className="text-gray-400">{v.incidentType || "-"}</span>;
        return (
          <div className="flex items-center gap-1.5">
            <div className={cn("w-6 h-6 rounded flex items-center justify-center", inc.color.split(" ")[1])}>
              <inc.Icon className={cn("h-3.5 w-3.5", inc.color.split(" ")[0])} />
            </div>
            <span className="text-sm">{inc.label}</span>
          </div>
        );
      },
    },
    {
      key: "incidentDate",
      header: "تاريخ الواقعة",
      sortable: true,
      render: (v) => <span className="text-sm text-gray-600">{formatDateAr(v.incidentDate)}</span>,
    },
    {
      key: "occurrenceCount",
      header: "التكرار",
      sortable: true,
      render: (v) => {
        const count = v.occurrenceCount || 0;
        return (
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              count >= 4 ? "border-red-300 text-red-700 bg-red-50" :
              count >= 3 ? "border-orange-300 text-orange-700 bg-orange-50" :
              count >= 2 ? "border-amber-300 text-amber-700 bg-amber-50" :
              "border-gray-200",
            )}
          >
            المرة {count}
          </Badge>
        );
      },
    },
    {
      key: "appliedPenaltyLabel",
      header: "الجزاء",
      sortable: true,
      render: (v) => {
        if (v.terminationDecided) {
          return <Badge className="bg-red-600 text-white text-xs">فصل</Badge>;
        }
        return <span className="text-sm">{v.appliedPenaltyLabel || "-"}</span>;
      },
    },
    {
      key: "appliedDeductionAmount",
      header: "الخصم",
      sortable: true,
      render: (v) => {
        const total = Number(v.appliedDeductionAmount || 0) + Number(v.appliedExtraDeduction || 0);
        if (!total) return <span className="text-gray-400">-</span>;
        return <span className="text-sm font-semibold text-red-600">{formatCurrency(total)}</span>;
      },
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (v) => <PageStatusBadge status={v.status} domain="memo" />,
    },
  ];

  return (
    <div className="space-y-4">
      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم أو رقم المحضر...",
          statuses: STATUS_OPTIONS,
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

      <BulkActionsBar
        entityType="discipline-memo"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["discipline-memos"]]}
        actions={["approve", "reject", "export"]}
        csvColumns={[
          { key: "memoNumber", label: "رقم المحضر" },
          { key: "employeeName", label: "الموظف" },
          { key: "incidentType", label: "نوع الواقعة" },
          { key: "incidentDate", label: "التاريخ" },
          { key: "appliedPenaltyLabel", label: "الجزاء" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="المخالفات_والجزاءات"
      />

      <DataTable
        columns={columns}
        data={filtered}
        noToolbar
        emptyMessage="لا توجد محاضر مخالفات — سجّل مخالفة جديدة للبدء"
        pageSize={20}
        onRowClick={(item) => navigate(`/hr/discipline/memos/${item.id}`)}
      />
    </div>
  );
}

// ───────────────────────── Auto Detection Tab ─────────────────────────

function AutoDetectionLink() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <Radar className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
        <p className="font-medium mb-1">إعدادات الرصد التلقائي</p>
        <p className="text-sm text-gray-500 mb-4">
          تشغيل/إيقاف الرصد، ضبط حدود التأخر، عرض سجل عمليات الرصد
        </p>
        <Link href="/hr/violations/auto-detection">
          <Button>
            <Radar className="h-4 w-4 me-1.5" />
            فتح صفحة الرصد التلقائي
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function RegulationLink() {
  return (
    <Card>
      <CardContent className="py-12 text-center">
        <BookOpen className="w-10 h-10 text-blue-500 mx-auto mb-3" />
        <p className="font-medium mb-1">لائحة الانضباط الكاملة</p>
        <p className="text-sm text-gray-500 mb-4">
          ٤٩ مادة موزعة على ثلاثة أبواب: مواعيد العمل، تنظيم العمل، السلوك العام
        </p>
        <Link href="/hr/discipline/regulation">
          <Button>
            <BookOpen className="h-4 w-4 me-1.5" />
            فتح لائحة الانضباط
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
