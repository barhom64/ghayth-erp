import { Link, useLocation } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, CalendarClock, Play, Pause, Trash2, Zap } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useAppContext } from "@/contexts/app-context";
import { useToast } from "@/hooks/use-toast";

const FREQUENCY_LABEL: Record<string, string> = {
  daily: "يومي",
  weekly: "أسبوعي",
  monthly: "شهري",
  quarterly: "ربع سنوي",
  yearly: "سنوي",
};

interface RecurringJournal {
  id: number;
  name: string;
  description?: string;
  frequency: string;
  startDate: string;
  nextRunDate: string;
  lastRunDate?: string;
  active: boolean;
  runsCount: number;
  createdAt: string;
}

export default function RecurringJournalsPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["recurring-journals", scopeQueryString],
    `/finance/recurring-journals${scopeSuffix}`
  );
  const items: RecurringJournal[] = (data?.data || []) as RecurringJournal[];
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) =>
      apiFetch(`/finance/recurring-journals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recurring-journals"] }),
  });
  const runMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/finance/recurring-journals/${id}/run-now`, { method: "POST", body: "{}" }),
    onSuccess: () => {
      toast({ title: "تم تنفيذ القيد الدوري" });
      qc.invalidateQueries({ queryKey: ["recurring-journals"] });
    },
    onError: (e: any) => toast({ variant: "destructive", title: e?.message || "فشل التنفيذ" }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/finance/recurring-journals/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "تم حذف القيد الدوري" });
      qc.invalidateQueries({ queryKey: ["recurring-journals"] });
    },
  });

  const columns: DataTableColumn<RecurringJournal>[] = [
    {
      key: "name",
      header: "الاسم",
      searchable: true,
      sortable: true,
      render: (r) => (
        <Link href={`/finance/recurring-journals/${r.id}`}>
          <span className="font-medium text-blue-700 hover:underline cursor-pointer">{r.name}</span>
        </Link>
      ),
    },
    {
      key: "frequency",
      header: "التكرار",
      sortable: true,
      render: (r) => <Badge variant="outline">{FREQUENCY_LABEL[r.frequency] || r.frequency}</Badge>,
    },
    {
      key: "nextRunDate",
      header: "التنفيذ القادم",
      sortable: true,
      render: (r) => (
        <span className="text-sm">{r.nextRunDate ? formatDateAr(r.nextRunDate) : "-"}</span>
      ),
    },
    {
      key: "lastRunDate",
      header: "آخر تنفيذ",
      render: (r) => (
        <span className="text-xs text-gray-500">{r.lastRunDate ? formatDateAr(r.lastRunDate) : "—"}</span>
      ),
    },
    {
      key: "runsCount",
      header: "عدد التنفيذات",
      render: (r) => <span className="tabular-nums">{r.runsCount ?? 0}</span>,
    },
    {
      key: "active",
      header: "الحالة",
      render: (r) =>
        r.active ? (
          <Badge className="bg-green-100 text-green-700">نشط</Badge>
        ) : (
          <Badge className="bg-gray-200 text-gray-700">متوقف</Badge>
        ),
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (r) => <span className="text-xs text-gray-500">{r.createdAt ? formatDateAr(r.createdAt) : "-"}</span>,
    },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="تنفيذ الآن"
            onClick={(e) => {
              e.stopPropagation();
              runMut.mutate(r.id);
            }}
          >
            <Zap className="h-4 w-4 text-amber-600" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={r.active ? "إيقاف" : "تشغيل"}
            onClick={(e) => {
              e.stopPropagation();
              patchMut.mutate({ id: r.id, body: { active: !r.active } });
            }}
          >
            {r.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="حذف"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`حذف القيد الدوري "${r.name}"؟`)) deleteMut.mutate(r.id);
            }}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">القيود الدورية</h1>
        <Link href="/finance/recurring-journals/create">
          <Button size="sm">
            <Plus className="h-4 w-4 me-1" />
            قيد دوري جديد
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CalendarClock className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">إجمالي القيود الدورية</p>
              <p className="text-xl font-bold">{items.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">نشطة</p>
            <p className="text-xl font-bold text-green-600">{items.filter((i) => i.active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">متوقفة</p>
            <p className="text-xl font-bold text-gray-500">{items.filter((i) => !i.active).length}</p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={items}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد قيود دورية"
        emptyIcon={<CalendarClock className="h-10 w-10 mx-auto opacity-30" />}
        searchPlaceholder="بحث بالاسم..."
        onRowClick={(r) => setLocation(`/finance/recurring-journals/${r.id}`)}
      />
    </div>
  );
}
