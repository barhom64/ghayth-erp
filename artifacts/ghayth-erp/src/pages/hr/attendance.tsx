import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Clock, Plus, CheckCircle, XCircle, AlertCircle, Users, ChevronDown, ChevronUp, AlertTriangle, DollarSign } from "lucide-react";
import { ExportButton } from "@/components/shared/export-buttons";
import { cn } from "@/lib/utils";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";
import { useAppContext } from "@/contexts/app-context";


const PENALTY_LEVELS: Record<number, { label: string; color: string; bg: string }> = {
  1: { label: "تنبيه شفهي", color: "text-yellow-700", bg: "bg-yellow-50" },
  2: { label: "إنذار كتابي أول", color: "text-orange-700", bg: "bg-orange-50" },
  3: { label: "إنذار كتابي ثاني", color: "text-red-600", bg: "bg-red-50" },
  4: { label: "خصم من الراتب", color: "text-red-700", bg: "bg-red-100" },
  5: { label: "إيقاف مؤقت", color: "text-red-800", bg: "bg-red-200" },
};

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
            <span className="font-medium text-red-600">{deduction.toFixed(2)} ر.س</span>
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
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (a) => (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
            {(a.employeeName || "؟").charAt(0)}
          </div>
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
          {a.checkIn ? new Date(a.checkIn).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "-"}
        </span>
      ),
    },
    {
      key: "checkOut",
      header: "الانصراف",
      sortable: true,
      render: (a) => (
        <span className="text-red-600 font-mono">
          {a.checkOut ? new Date(a.checkOut).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" }) : "-"}
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
      render: (a) => <StatusBadge status={a.status} />,
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الحضور والانصراف</h1>
          <p className="text-sm text-muted-foreground mt-0.5">تسجيل ومتابعة حضور وانصراف الموظفين</p>
        </div>
        <ExportButton
          endpoint="/export/excel/attendance"
          filename="attendance.xlsx"
          type="excel"
          label="تصدير Excel"
          params={{ startDate: `${month}-01`, endDate: new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0).toISOString().slice(0, 10) }}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((c) => (
          <Card key={c.label} className="border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
                {c.trend && <p className="text-xs text-green-500">{c.trend}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
    </div>
  );
}
