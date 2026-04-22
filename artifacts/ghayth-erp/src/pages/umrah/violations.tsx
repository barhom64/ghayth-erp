import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";
import { PageStateWrapper } from "@/components/shared/page-state";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { Eye, AlertTriangle, Clock, HelpCircle, UserX } from "lucide-react";

type ViolationType = "overstay" | "absconded" | "other";
type ViolationStatus = "detected" | "open" | "invoiced" | "paid" | "disputed" | "closed";

interface Violation {
  id: number;
  type: ViolationType;
  referenceType?: "group" | "passport" | "border" | "mutamer";
  referenceNumber?: string;
  passportNumber?: string;
  mutamerId?: number;
  mutamerName?: string;
  agentId?: number;
  agentName?: string;
  subAgentId?: number;
  subAgentName?: string;
  seasonId?: number;
  penaltyAmount: number;
  description?: string;
  status: ViolationStatus;
  detectedAt: string;
}

const TYPE_LABEL: Record<ViolationType, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  overstay: { label: "تأخر مغادرة", cls: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock },
  absconded: { label: "هروب", cls: "bg-red-100 text-red-700 border-red-200", icon: UserX },
  other: { label: "أخرى", cls: "bg-slate-100 text-slate-700 border-slate-200", icon: HelpCircle },
};

const STATUS_LABEL: Record<ViolationStatus, { label: string; cls: string }> = {
  detected: { label: "مكتشفة", cls: "bg-purple-100 text-purple-700 border-purple-200" },
  open: { label: "مفتوحة", cls: "bg-red-100 text-red-700 border-red-200" },
  invoiced: { label: "بفاتورة", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  paid: { label: "مسددة", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  disputed: { label: "متنازع عليها", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  closed: { label: "مغلقة", cls: "bg-slate-100 text-slate-700 border-slate-200" },
};

export default function UmrahViolations() {
  // TODO: endpoint not yet implemented — placeholder response
  const violationsQ = useApiQuery<{ data: Violation[] }>(["umrah-violations"], "/umrah/violations");
  const agentsQ = useApiQuery<{ data: any[] }>(["umrah-agents"], "/umrah/agents");
  // TODO: endpoint not yet implemented — placeholder response
  const subAgentsQ = useApiQuery<{ data: any[] }>(["umrah-sub-agents"], "/umrah/sub-agents");
  const seasonsQ = useApiQuery<{ data: any[] }>(["umrah-seasons"], "/umrah/seasons");

  const violations = violationsQ.data?.data ?? [];
  const agents = agentsQ.data?.data ?? [];
  const subAgents = subAgentsQ.data?.data ?? [];
  const seasons = seasonsQ.data?.data ?? [];

  const [tab, setTab] = useState<"all" | ViolationStatus>("all");
  const [agentFilter, setAgentFilter] = useState("");
  const [subAgentFilter, setSubAgentFilter] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("");

  const filtered = useMemo(() => {
    return violations.filter((v) => {
      if (tab !== "all" && v.status !== tab) return false;
      if (agentFilter && String(v.agentId) !== agentFilter) return false;
      if (subAgentFilter && String(v.subAgentId) !== subAgentFilter) return false;
      if (seasonFilter && String(v.seasonId) !== seasonFilter) return false;
      return true;
    });
  }, [violations, tab, agentFilter, subAgentFilter, seasonFilter]);

  const summary = useMemo(() => {
    const openItems = violations.filter((v) => v.status === "open");
    const totalOpen = openItems.reduce((sum, v) => sum + Number(v.penaltyAmount || 0), 0);
    const byType: Record<ViolationType, number> = { overstay: 0, absconded: 0, other: 0 };
    violations.forEach((v) => { byType[v.type] = (byType[v.type] ?? 0) + 1; });
    return { totalOpen, byType, countByStatus: {
      detected: violations.filter((v) => v.status === "detected").length,
      open: violations.filter((v) => v.status === "open").length,
      invoiced: violations.filter((v) => v.status === "invoiced").length,
      paid: violations.filter((v) => v.status === "paid").length,
      disputed: violations.filter((v) => v.status === "disputed").length,
      closed: violations.filter((v) => v.status === "closed").length,
    } };
  }, [violations]);

  const columns: DataTableColumn<Violation>[] = [
    {
      key: "type",
      header: "النوع",
      render: (v) => {
        const t = TYPE_LABEL[v.type] ?? TYPE_LABEL.other;
        const Icon = t.icon;
        return (
          <Badge variant="outline" className={`gap-1 ${t.cls}`}>
            <Icon className="h-3 w-3" />
            {t.label}
          </Badge>
        );
      },
    },
    {
      key: "reference",
      header: "المرجع",
      render: (v) => {
        if (!v.referenceNumber) return <span className="text-muted-foreground">—</span>;
        const typeLabel: Record<string, string> = { group: "مجموعة", passport: "جواز", border: "حدود", mutamer: "معتمر" };
        return (
          <div className="text-xs font-mono" dir="ltr">
            <span className="text-muted-foreground">{typeLabel[v.referenceType ?? ""] ?? ""}:</span> {v.referenceNumber}
          </div>
        );
      },
    },
    {
      key: "mutamer",
      header: "المعتمر",
      render: (v) => (
        <div className="text-sm">
          <div className="font-medium">{v.mutamerName ?? "—"}</div>
          {v.passportNumber && (
            <div className="text-xs text-muted-foreground font-mono" dir="ltr">{v.passportNumber}</div>
          )}
        </div>
      ),
    },
    {
      key: "agent",
      header: "الوكيل / الفرعي",
      render: (v) => (
        <div className="text-sm">
          <div>{v.agentName ?? "—"}</div>
          {v.subAgentName && (
            <div className="text-xs text-muted-foreground">{v.subAgentName}</div>
          )}
        </div>
      ),
    },
    {
      key: "amount",
      header: "المبلغ",
      render: (v) => <span className="font-semibold">{formatCurrency(Number(v.penaltyAmount))}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      render: (v) => {
        const s = STATUS_LABEL[v.status] ?? STATUS_LABEL.open;
        return <Badge variant="outline" className={s.cls}>{s.label}</Badge>;
      },
    },
    {
      key: "detectedAt",
      header: "تاريخ الرصد",
      render: (v) => formatDateAr(v.detectedAt),
    },
    {
      key: "__actions",
      header: "",
      render: (v) => (
        <Button asChild size="sm" variant="ghost">
          <Link href={`/details/umrah-violation/${v.id}`}>
            <Eye className="h-3.5 w-3.5" />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      title="المخالفات"
      subtitle="رصد المخالفات: تأخر المغادرة، الهروب، وأخرى"
      breadcrumbs={[{ label: "العمرة" }, { label: "المخالفات" }]}
    >
      <UmrahTabsNav />

      {/* Summary strip */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-700">{formatCurrency(summary.totalOpen)}</p>
              <p className="text-xs text-muted-foreground">إجمالي المخالفات المفتوحة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-amber-50 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatNumber(summary.byType.overstay)}</p>
              <p className="text-xs text-muted-foreground">تأخر مغادرة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-red-50 flex items-center justify-center">
              <UserX className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatNumber(summary.byType.absconded)}</p>
              <p className="text-xs text-muted-foreground">هروب</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatNumber(summary.byType.other)}</p>
              <p className="text-xs text-muted-foreground">أخرى</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="all">الكل ({formatNumber(violations.length)})</TabsTrigger>
          <TabsTrigger value="open">مفتوحة ({formatNumber(summary.countByStatus.open)})</TabsTrigger>
          <TabsTrigger value="invoiced">بفاتورة ({formatNumber(summary.countByStatus.invoiced)})</TabsTrigger>
          <TabsTrigger value="paid">مسددة ({formatNumber(summary.countByStatus.paid)})</TabsTrigger>
          <TabsTrigger value="disputed">متنازع عليها ({formatNumber(summary.countByStatus.disputed)})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="min-w-[200px]">
          <Label className="text-xs">الوكيل</Label>
          <Select value={agentFilter || "all"} onValueChange={(v) => setAgentFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="كل الوكلاء" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الوكلاء</SelectItem>
              {agents.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px]">
          <Label className="text-xs">الوكيل الفرعي</Label>
          <Select value={subAgentFilter || "all"} onValueChange={(v) => setSubAgentFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="كل الوكلاء الفرعيين" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الوكلاء الفرعيين</SelectItem>
              {subAgents.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[200px]">
          <Label className="text-xs">الموسم</Label>
          <Select value={seasonFilter || "all"} onValueChange={(v) => setSeasonFilter(v === "all" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="كل المواسم" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المواسم</SelectItem>
              {seasons.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <PageStateWrapper
        isLoading={violationsQ.isLoading}
        error={violationsQ.error}
        onRetry={() => violationsQ.refetch()}
      >
        <DataTable
          columns={columns}
          data={filtered}
          emptyMessage="لا توجد مخالفات مطابقة"
          pageSize={20}
          noToolbar
        />
      </PageStateWrapper>
    </PageShell>
  );
}
