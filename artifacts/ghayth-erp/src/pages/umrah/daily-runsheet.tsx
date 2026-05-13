import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PlaneTakeoff, PlaneLanding, AlertTriangle, Download, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Daily ops run-sheet — backs GET /api/umrah/reports/daily-runsheet (PR #305).
// Three lists side by side: arrivals (entryDate=today), departures
// (exitDate=today), and everyone currently overstaying. Date picker so
// ops can walk back over the season; export button streams the PDF
// variant of the same payload.

interface Pilgrim {
  nuskNumber: string;
  fullName: string;
  nationality: string | null;
  groupName: string | null;
  subAgentName: string | null;
  entryPort?: string | null;
  entryFlight?: string | null;
  exitPort?: string | null;
  exitFlight?: string | null;
  overstayDays?: number;
}

interface Payload {
  date: string;
  arrivals: Pilgrim[];
  departures: Pilgrim[];
  overstays: Pilgrim[];
}

const today = () => new Date().toISOString().slice(0, 10);

export default function UmrahDailyRunsheet() {
  const [date, setDate] = useState(today());
  const { toast } = useToast();

  const { data, isLoading, isError, refetch } = useApiQuery<Payload>(
    ["umrah-daily-runsheet", date],
    `/umrah/reports/daily-runsheet?date=${date}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const arrivals = data?.arrivals ?? [];
  const departures = data?.departures ?? [];
  const overstays = data?.overstays ?? [];

  const handleExport = async () => {
    // PDF download has to bypass `apiFetch` since the helper only parses
    // JSON responses. We still rely on the same cookie-based auth via
    // `credentials: "include"`.
    try {
      const res = await fetch(`/api/umrah/reports/daily-runsheet/pdf?date=${date}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `umrah-runsheet-${date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ variant: "destructive", title: "تعذّر تحميل PDF" });
    }
  };

  const arrivalCols: DataTableColumn<Pilgrim>[] = [
    { key: "nuskNumber", header: "رقم نسك" },
    { key: "fullName", header: "الاسم", render: (p) => <span className="font-medium">{p.fullName}</span> },
    { key: "nationality", header: "الجنسية", render: (p) => p.nationality || "—" },
    { key: "groupName", header: "المجموعة", render: (p) => p.groupName || "—" },
    { key: "subAgentName", header: "الوكيل الفرعي", render: (p) => p.subAgentName || "—" },
    { key: "entryPort", header: "ميناء", render: (p) => p.entryPort || "—" },
    { key: "entryFlight", header: "رحلة", render: (p) => p.entryFlight || "—" },
  ];

  const departureCols: DataTableColumn<Pilgrim>[] = [
    { key: "nuskNumber", header: "رقم نسك" },
    { key: "fullName", header: "الاسم", render: (p) => <span className="font-medium">{p.fullName}</span> },
    { key: "nationality", header: "الجنسية", render: (p) => p.nationality || "—" },
    { key: "groupName", header: "المجموعة", render: (p) => p.groupName || "—" },
    { key: "subAgentName", header: "الوكيل الفرعي", render: (p) => p.subAgentName || "—" },
    { key: "exitPort", header: "ميناء", render: (p) => p.exitPort || "—" },
    { key: "exitFlight", header: "رحلة", render: (p) => p.exitFlight || "—" },
  ];

  const overstayCols: DataTableColumn<Pilgrim>[] = [
    { key: "nuskNumber", header: "رقم نسك" },
    { key: "fullName", header: "الاسم", render: (p) => <span className="font-medium">{p.fullName}</span> },
    { key: "nationality", header: "الجنسية", render: (p) => p.nationality || "—" },
    { key: "groupName", header: "المجموعة", render: (p) => p.groupName || "—" },
    { key: "subAgentName", header: "الوكيل الفرعي", render: (p) => p.subAgentName || "—" },
    {
      key: "overstayDays",
      header: "أيام التجاوز",
      render: (p) => <span className="font-bold text-status-error-foreground">{p.overstayDays}</span>,
    },
  ];

  const kpis = [
    { label: "الوصول اليوم", value: arrivals.length, icon: PlaneLanding, color: "text-status-info-foreground bg-status-info-surface" },
    { label: "المغادرة اليوم", value: departures.length, icon: PlaneTakeoff, color: "text-emerald-600 bg-emerald-50" },
    { label: "المتجاوزون حالياً", value: overstays.length, icon: AlertTriangle, color: "text-status-error-foreground bg-status-error-surface" },
  ];

  return (
    <div dir="rtl" lang="ar" className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">كشف اليوم التشغيلي — عمرة</h1>
          <p className="text-sm text-muted-foreground">وصول، مغادرة، ومتجاوزون لتاريخ التشغيل المختار</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor="runsheet-date" className="text-xs">تاريخ التشغيل</Label>
            <Input
              id="runsheet-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || today())}
              className="w-44"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="h-4 w-4" /> تحديث
          </Button>
          <GuardedButton perm="umrah:export" onClick={handleExport} className="gap-1" rateLimitAware>
            <Download className="h-4 w-4" /> تصدير PDF
          </GuardedButton>
        </div>
      </header>

      <div className="grid gap-3 md:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`rounded-md p-2 ${k.color}`}>
                <k.icon className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="text-xl font-bold">{k.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">الوصول اليوم ({arrivals.length})</h2>
        <DataTable data={arrivals} columns={arrivalCols} emptyMessage="لا وصول مسجّل لهذا التاريخ" />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">المغادرة اليوم ({departures.length})</h2>
        <DataTable data={departures} columns={departureCols} emptyMessage="لا مغادرة مسجّلة لهذا التاريخ" />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">المتجاوزون حالياً ({overstays.length})</h2>
        <DataTable data={overstays} columns={overstayCols} emptyMessage="لا متجاوزون نشطون" />
      </section>
    </div>
  );
}
