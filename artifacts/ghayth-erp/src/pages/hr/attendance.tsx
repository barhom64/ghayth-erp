import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// Phase A — HR attendance page on unified primitives.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Clock, Plus, CheckCircle, XCircle, AlertCircle, Users, ChevronDown, ChevronUp, AlertTriangle, DollarSign } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { cn } from "@/lib/utils";
import { formatCurrency, formatTimeAr } from "@/lib/formatters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { AvatarInitial } from "@/components/shared/avatar-initial";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { useAppContext } from "@/contexts/app-context";
import { PENALTY_LEVELS } from "@/lib/hr-type-maps";


// P02-M1 — `new Date(...).toISOString().slice(0, 10)` converts the
// local Date to UTC, so for users in positive UTC offsets (Saudi
// Arabia is UTC+3) the last day of the month is shifted back one
// day. The Excel export then silently excludes the final day's
// attendance — payroll-relevant data. Compute the end date as a
// pure string instead so it stays in the user's local calendar.
function monthEndDate(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  // `new Date(year, monthNum, 0)` returns the last day of the
  // previous month index — i.e. the last day of the selected month
  // because monthNum is 1-based and the Date constructor is 0-based.
  // We only read .getDate() so the local-time anchor is irrelevant.
  const lastDay = new Date(year, monthNum, 0).getDate();
  return `${yearStr}-${monthStr}-${String(lastDay).padStart(2, "0")}`;
}


function PenaltyChain({ record }: { record: any }) {
  const lateMin = record.lateMinutes || 0;
  const penaltyLevel = record.penaltyLevel || 0;
  const deduction = record.deductionAmount || 0;
  const overtimeMin = record.overtimeMinutes || 0;

  if (lateMin === 0 && penaltyLevel === 0 && deduction === 0) return null;

  const penalty = PENALTY_LEVELS[penaltyLevel];

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap gap-3">
        {lateMin > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-yellow-600" />
            <span className="text-gray-600">تأخير:</span>
            <span className="font-medium text-yellow-700">{lateMin} دقيقة</span>
          </div>
        )}
        {penaltyLevel > 0 && penalty && (
          <div className="flex items-center gap-1.5 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
            <span className="text-gray-600">العقوبة:</span>
            <Badge className={cn("text-[10px]", penalty.bg, penalty.color)}>{penalty.label}</Badge>
          </div>
        )}
        {deduction > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <DollarSign className="w-3.5 h-3.5 text-red-500" />
            <span className="text-gray-600">خصم:</span>
            <span className="font-medium text-red-600">{formatCurrency(deduction)}</span>
          </div>
        )}
        {overtimeMin > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <Clock className="w-3.5 h-3.5 text-green-500" />
            <span className="text-gray-600">وقت إضافي:</span>
            <span className="font-medium text-green-600">{overtimeMin} دقيقة</span>
          </div>
        )}
      </div>
      {penaltyLevel > 0 && (
        <div className="flex items-center gap-1 mt-1">
          {Object.entries(PENALTY_LEVELS).map(([lvl, info]) => (
            <div key={lvl} className="flex items-center gap-0">
              <div className={cn(
                "w-3 h-3 rounded-full border-2",
                Number(lvl) <= penaltyLevel ? "border-red-400 bg-red-400" : "border-gray-300 bg-white"
              )} title={info.label} />
              {Number(lvl) < 5 && <div className={cn("w-4 h-0.5", Number(lvl) < penaltyLevel ? "bg-red-300" : "bg-gray-200")} />}
            </div>
          ))}
          <span className="text-[10px] text-gray-400 ms-1">مستوى {penaltyLevel}/5</span>
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  const { scopeQueryString } = useAppContext();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filters, setFilters] = useFilters();
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["attendance", month, scopeQueryString], `/hr/attendance?month=${month}${scopeSuffix}`);
  const { data: stats } = useApiQuery<any>(["attendance-stats", month, scopeQueryString], `/hr/attendance-stats?month=${month}${scopeSuffix}`);
  const items = asList(data);
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();

  const filtersForApply = filters.status === "late"
    ? ({ ...filters, status: "" } as typeof filters)
    : filters;
  const filtered = applyFilters(items, filtersForApply, {
    searchFields: ["employeeName"],
    statusField: "status",
    dateField: "date",
  }).filter((item: any) => {
    if (filters.status === "late") {
      return item.lateMinutes > 0;
    }
    return true;
  });

  const kpis = [
    { label: "الحضور", value: stats?.present ?? items.filter((i: any) => i.status === "present").length, icon: CheckCircle, color: "text-green-600 bg-green-50", trend: "+٥٪" },
    { label: "الغياب", value: stats?.absent ?? items.filter((i: any) => i.status === "absent").length, icon: XCircle, color: "text-red-600 bg-red-50", trend: "-٢٪" },
    { label: "المتأخرين", value: stats?.late ?? items.filter((i: any) => i.status === "late" || (i.lateMinutes && i.lateMinutes > 0)).length, icon: AlertCircle, color: "text-yellow-600 bg-yellow-50", trend: "" },
    { label: "إجمالي الموظفين", value: stats?.totalEmployees ?? items.length, icon: Users, color: "text-blue-600 bg-blue-50", trend: "" },
  ];

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (a) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(a.id)} onChange={() => toggleSelect(a.id)} />
        </span>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (a) => (
        <div className="flex items-center gap-2">
          <AvatarInitial name={a.employeeName} color="blue" />
          <span className="font-medium">{a.employeeName}</span>
        </div>
      ),
    },
    {
      key: "date",
      header: "التاريخ",
      sortable: true,
      render: (a) => <span className="text-gray-500">{a.date}</span>,
    },
    {
      key: "checkIn",
      header: "الحضور",
      sortable: true,
      render: (a) => (
        <span className="text-green-600 font-mono">
          {formatTimeAr(a.checkIn)}
        </span>
      ),
    },
    {
      key: "checkOut",
      header: "الانصراف",
      sortable: true,
      render: (a) => (
        <span className="text-red-600 font-mono">
          {formatTimeAr(a.checkOut)}
        </span>
      ),
    },
    {
      key: "workHours",
      header: "ساعات العمل",
      sortable: true,
      className: "font-mono",
      render: (a) => a.workHours != null ? <span className="text-blue-600 font-medium">{Number(a.workHours).toFixed(1)} ساعة</span> : <span className="text-gray-400">-</span>,
    },
    {
      key: "lateMinutes",
      header: "التأخير (دقيقة)",
      sortable: true,
      render: (a) => a.lateMinutes > 0 ? <span className="text-red-500 font-medium">{a.lateMinutes} دقيقة</span> : <span className="text-gray-400">-</span>,
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (a) => <PageStatusBadge status={a.status} domain="attendance" />,
    },
    {
      key: "expand",
      header: "",
      width: "40px",
      render: (a) => {
        const hasPenalty = (a.lateMinutes > 0) || (a.penaltyLevel > 0) || (a.deductionAmount > 0) || (a.overtimeMinutes > 0);
        if (!hasPenalty) return null;
        return (
          <button
            onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === a.id ? null : a.id); }}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            {expandedId === a.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        );
      },
    },
  ];

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <PageShell
      title="الحضور والانصراف"
      subtitle="تسجيل ومتابعة حضور وانصراف الموظفين"
      breadcrumbs={[
        { href: "/hr", label: "الموارد البشرية" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Link href="/hr/excuse-requests">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Clock className="h-4 w-4" />
              الاستئذانات
            </Button>
          </Link>
          <Link href="/hr/attendance/create">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              تسجيل حضور
            </Button>
          </Link>
          <ExportButton
            endpoint="/export/excel/attendance"
            filename="attendance.xlsx"
            type="excel"
            label="تصدير Excel"
            params={{ startDate: `${month}-01`, endDate: monthEndDate(month) }}
          />
        </div>
      }
    >
      <KpiGrid items={kpis} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" />
        <Link href="/hr/attendance/create">
          <Button size="sm"><Plus className="h-4 w-4 me-1" />تسجيل حضور</Button>
        </Link>
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالاسم...",
          statuses: [
            { value: "present", label: "حاضر" },
            { value: "absent", label: "غائب" },
            { value: "late", label: "متأخر" },
            { value: "leave", label: "إجازة" },
          ],
          showDateRange: true,
        }}
        values={filters}
        onChange={setFilters}
        resultCount={filtered?.length}
      />

      <Tabs defaultValue="list" dir="rtl">
        <TabsList>
          <TabsTrigger value="list">القائمة</TabsTrigger>
          <TabsTrigger value="summary">الملخص</TabsTrigger>
        </TabsList>
        <TabsContent value="list">
          <BulkActionsBar
            entityType="attendance"
            items={filtered}
            selectedIds={selectedIds}
            onToggle={toggleSelect}
            onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
            onClear={clearSelection}
            invalidateKeys={[["attendance"], ["attendance-stats"]]}
            actions={["export"]}
            csvColumns={[
              { key: "employeeName", label: "الموظف" },
              { key: "date", label: "التاريخ" },
              { key: "checkIn", label: "وقت الدخول" },
              { key: "checkOut", label: "وقت الخروج" },
              { key: "status", label: "الحالة" },
              { key: "lateMinutes", label: "دقائق التأخير" },
            ]}
            csvFileName="سجل_الحضور"
          />
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد سجلات حضور لهذا الشهر"
            emptyIcon={<Clock className="h-6 w-6 text-slate-400" />}
            noToolbar
            rowClassName={(a) => expandedId === a.id ? "bg-gray-50" : undefined}
            renderRowExtras={(a) => {
              const hasPenalty = (a.lateMinutes > 0) || (a.penaltyLevel > 0) || (a.deductionAmount > 0) || (a.overtimeMinutes > 0);
              if (expandedId === a.id && hasPenalty) {
                return (
                  <div className="p-3">
                    <PenaltyChain record={a} />
                  </div>
                );
              }
              return null;
            }}
          />
        </TabsContent>
        <TabsContent value="summary">
          <Card>
            <CardHeader><CardTitle className="text-base">ملخص الحضور الشهري</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <p className="text-3xl font-bold text-green-600">{stats?.present ?? 0}</p>
                  <p className="text-sm text-gray-600">أيام حضور</p>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-xl">
                  <p className="text-3xl font-bold text-red-600">{stats?.absent ?? 0}</p>
                  <p className="text-sm text-gray-600">أيام غياب</p>
                </div>
                <div className="text-center p-4 bg-yellow-50 rounded-xl">
                  <p className="text-3xl font-bold text-yellow-600">{stats?.late ?? 0}</p>
                  <p className="text-sm text-gray-600">حالات تأخير</p>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-xl">
                  <p className="text-3xl font-bold text-blue-600">{stats?.totalEmployees ?? 0}</p>
                  <p className="text-sm text-gray-600">إجمالي الموظفين</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
