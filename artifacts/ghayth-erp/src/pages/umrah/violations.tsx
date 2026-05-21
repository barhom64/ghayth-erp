import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";
import { PageStateWrapper } from "@/components/shared/page-state";
import { UmrahTabsNav } from "@/components/shared/umrah-tabs-nav";
import { formatCurrency, formatDateAr, formatNumber } from "@/lib/formatters";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Eye, Plus, Pencil, Trash2, AlertTriangle, Clock, HelpCircle, UserX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

interface ViolationForm {
  type: ViolationType;
  referenceType: string;
  referenceNumber: string;
  mutamerId: string;
  agentId: string;
  subAgentId: string;
  penaltyAmount: string;
  description: string;
  status: ViolationStatus;
}

const EMPTY_FORM: ViolationForm = {
  type: "overstay",
  referenceType: "mutamer",
  referenceNumber: "",
  mutamerId: "",
  agentId: "",
  subAgentId: "",
  penaltyAmount: "0",
  description: "",
  status: "open",
};

const TYPE_LABEL: Record<ViolationType, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  overstay: { label: "تأخر مغادرة", cls: "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface", icon: Clock },
  absconded: { label: "هروب", cls: "bg-status-error-surface text-status-error-foreground border-status-error-surface", icon: UserX },
  other: { label: "أخرى", cls: "bg-slate-100 text-slate-700 border-slate-200", icon: HelpCircle },
};

const STATUS_LABEL: Record<ViolationStatus, { label: string; cls: string }> = {
  detected: { label: "مكتشفة", cls: "bg-purple-100 text-purple-700 border-purple-200" },
  open: { label: "مفتوحة", cls: "bg-status-error-surface text-status-error-foreground border-status-error-surface" },
  invoiced: { label: "بفاتورة", cls: "bg-status-info-surface text-status-info-foreground border-status-info-surface" },
  paid: { label: "مسددة", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  disputed: { label: "متنازع عليها", cls: "bg-status-warning-surface text-status-warning-foreground border-status-warning-surface" },
  closed: { label: "مغلقة", cls: "bg-slate-100 text-slate-700 border-slate-200" },
};

export default function UmrahViolations() {
  const { toast } = useToast();
  const violationsQ = useApiQuery<{ data: Violation[] }>(["umrah-violations"], "/umrah/violations");
  const agentsQ = useApiQuery<{ data: any[] }>(["umrah-agents"], "/umrah/agents");
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

  const [editing, setEditing] = useState<(ViolationForm & { id?: number }) | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const createMut = useApiMutation<any, any>(
    "/umrah/violations", "POST", [["umrah-violations"]],
    { onSuccess: () => { violationsQ.refetch(); setEditing(null); toast({ title: "تم إنشاء المخالفة بنجاح" }); } }
  );
  const updateMut = useApiMutation<any, any>(
    () => `/umrah/violations/${editing?.id}`, "PATCH", [["umrah-violations"]],
    { onSuccess: () => { violationsQ.refetch(); setEditing(null); toast({ title: "تم تحديث المخالفة" }); } }
  );
  const deleteMut = useApiMutation<any, any>(
    () => `/umrah/violations/${deleteId}`, "DELETE", [["umrah-violations"]],
    { onSuccess: () => { violationsQ.refetch(); setDeleteId(null); toast({ title: "تم حذف المخالفة" }); } }
  );

  function openCreate() {
    setEditing({ ...EMPTY_FORM });
  }

  function openEdit(v: Violation) {
    setEditing({
      id: v.id,
      type: v.type,
      referenceType: v.referenceType || "mutamer",
      referenceNumber: v.referenceNumber || "",
      mutamerId: v.mutamerId ? String(v.mutamerId) : "",
      agentId: v.agentId ? String(v.agentId) : "",
      subAgentId: v.subAgentId ? String(v.subAgentId) : "",
      penaltyAmount: String(v.penaltyAmount || 0),
      description: v.description || "",
      status: v.status,
    });
  }

  function handleSave() {
    if (!editing) return;
    const payload = {
      type: editing.type,
      referenceType: editing.referenceType || null,
      referenceNumber: editing.referenceNumber || null,
      mutamerId: editing.mutamerId ? Number(editing.mutamerId) : null,
      agentId: editing.agentId ? Number(editing.agentId) : null,
      subAgentId: editing.subAgentId ? Number(editing.subAgentId) : null,
      penaltyAmount: Number(editing.penaltyAmount) || 0,
      description: editing.description || null,
      status: editing.status,
    };
    if (editing.id) {
      updateMut.mutate(payload);
    } else {
      createMut.mutate(payload);
    }
  }

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
    const openItems = violations.filter((v) => v.status === "open" || v.status === "detected");
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
        <div className="flex gap-1">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/umrah/violations/${v.id}`}>
              <Eye className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <GuardedButton perm="umrah:create" size="sm" variant="ghost" onClick={() => openEdit(v)}>
            <Pencil className="h-3.5 w-3.5" />
          </GuardedButton>
          {(v.status === "open" || v.status === "detected") && (
            <GuardedButton perm="umrah:create" size="sm" variant="ghost" className="text-status-error-foreground" onClick={() => setDeleteId(v.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </GuardedButton>
          )}
        </div>
      ),
    },
  ];

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <PageShell
      title="المخالفات"
      subtitle="رصد المخالفات: تأخر المغادرة، الهروب، وأخرى"
      breadcrumbs={[{ label: "العمرة" }, { label: "المخالفات" }]}
      actions={
        <GuardedButton perm="umrah:create" asChild className="gap-2">
          <Link href="/umrah/violations/create">
            <Plus className="h-4 w-4" />
            مخالفة جديدة
          </Link>
        </GuardedButton>
      }
    >
      <UmrahTabsNav />

      <div className="grid gap-3 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-status-error-surface flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-status-error-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-status-error-foreground">{formatCurrency(summary.totalOpen)}</p>
              <p className="text-xs text-muted-foreground">إجمالي المخالفات المفتوحة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-status-warning-surface flex items-center justify-center">
              <Clock className="w-5 h-5 text-status-warning-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold">{formatNumber(summary.byType.overstay)}</p>
              <p className="text-xs text-muted-foreground">تأخر مغادرة</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-status-error-surface flex items-center justify-center">
              <UserX className="w-5 h-5 text-status-error-foreground" />
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
          <TabsTrigger value="detected">مكتشفة ({formatNumber(summary.countByStatus.detected)})</TabsTrigger>
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

      {/* Create / Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "تعديل مخالفة" : "مخالفة جديدة"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">نوع المخالفة *</Label>
                  <Select value={editing.type} onValueChange={(v) => setEditing({ ...editing, type: v as ViolationType })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="overstay">تأخر مغادرة</SelectItem>
                      <SelectItem value="absconded">هروب</SelectItem>
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">الحالة</Label>
                  <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as ViolationStatus })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="detected">مكتشفة</SelectItem>
                      <SelectItem value="open">مفتوحة</SelectItem>
                      <SelectItem value="invoiced">بفاتورة</SelectItem>
                      <SelectItem value="disputed">متنازع عليها</SelectItem>
                      <SelectItem value="closed">مغلقة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">نوع المرجع</Label>
                  <Select value={editing.referenceType} onValueChange={(v) => setEditing({ ...editing, referenceType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mutamer">معتمر</SelectItem>
                      <SelectItem value="group">مجموعة</SelectItem>
                      <SelectItem value="passport">جواز سفر</SelectItem>
                      <SelectItem value="border">حدود</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">رقم المرجع</Label>
                  <Input
                    value={editing.referenceNumber}
                    onChange={(e) => setEditing({ ...editing, referenceNumber: e.target.value })}
                    placeholder="رقم المرجع"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">الوكيل</Label>
                  <Select value={editing.agentId || "none"} onValueChange={(v) => setEditing({ ...editing, agentId: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="اختر الوكيل" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون وكيل</SelectItem>
                      {agents.map((a: any) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">الوكيل الفرعي</Label>
                  <Select value={editing.subAgentId || "none"} onValueChange={(v) => setEditing({ ...editing, subAgentId: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="اختر الوكيل الفرعي" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">بدون وكيل فرعي</SelectItem>
                      {subAgents.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">مبلغ الغرامة (ريال)</Label>
                <Input
                  type="number"
                  min="0"
                  value={editing.penaltyAmount}
                  onChange={(e) => setEditing({ ...editing, penaltyAmount: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">الوصف</Label>
                <Textarea
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="تفاصيل المخالفة..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            <GuardedButton perm="umrah:create" onClick={handleSave} disabled={isSaving || !editing?.type} rateLimitAware>
              {isSaving ? "جاري الحفظ..." : editing?.id ? "حفظ التعديلات" : "إنشاء المخالفة"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذه المخالفة؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <GuardedButton perm="umrah:create" variant="destructive" onClick={() => deleteMut.mutate({})} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? "جاري الحذف..." : "حذف"}
            </GuardedButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
