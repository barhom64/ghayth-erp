import { useState } from "react";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { useToast } from "@/hooks/use-toast";
import { Wrench, Ticket, CheckCircle2, AlertTriangle } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

/**
 * Maintenance → Tickets (أثر الصيانة → التذاكر).
 *
 * A vehicle under maintenance is a vehicle out of service — an operational
 * impact someone has to act on. There was no link between fleet maintenance
 * and the support-ticket system, so the impact stayed invisible to the
 * people who triage tickets. This screen surfaces maintenance records and
 * lets the operator escalate any of them into a support ticket using the
 * existing POST /support/tickets endpoint (pre-filled, editable).
 *
 * v1 has no persistent maintenance↔ticket link, so "opened" is tracked for
 * the current session only; a stored linkage is a backend follow-up.
 */

interface Maintenance {
  id: number;
  vehicleId: number | null;
  vehiclePlate?: string | null;
  plateNumber?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  maintenanceType?: string | null;
  type?: string | null;
  status: string | null;
  amount?: number | null;
  cost?: number | null;
  date?: string | null;
  scheduledDate?: string | null;
  description?: string | null;
}
interface ListResp { data: Maintenance[]; total: number; }

const ACTIVE_STATUSES = ["pending", "scheduled", "in_progress", "in-progress", "open"];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "معلّقة", cls: "bg-status-warning-surface text-status-warning-foreground" },
  scheduled: { label: "مجدولة", cls: "bg-status-info-surface text-status-info-foreground" },
  in_progress: { label: "قيد التنفيذ", cls: "bg-status-warning-surface text-status-warning-foreground" },
  completed: { label: "مكتملة", cls: "bg-status-success-surface text-status-success-foreground" },
  cancelled: { label: "ملغاة", cls: "bg-muted text-muted-foreground" },
};

const PRIORITIES = [
  { value: "low", label: "منخفضة" },
  { value: "medium", label: "متوسطة" },
  { value: "high", label: "عالية" },
  { value: "urgent", label: "عاجلة" },
  { value: "critical", label: "حرجة" },
];

const plateOf = (m: Maintenance) => m.vehiclePlate || m.plateNumber || (m.vehicleId ? `#${m.vehicleId}` : "—");
const typeOf = (m: Maintenance) => m.maintenanceType || m.type || "صيانة";
const costOf = (m: Maintenance) => Number(m.amount ?? m.cost ?? 0);
const dateOf = (m: Maintenance) => m.scheduledDate || m.date || null;

export default function MaintenanceTicketImpact() {
  const { toast } = useToast();
  const [onlyActive, setOnlyActive] = useState(true);
  const [dialog, setDialog] = useState<Maintenance | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("high");
  const [opened, setOpened] = useState<Set<number>>(new Set());

  const { data, isLoading, isError } = useApiQuery<ListResp>(["fleet-maintenance-impact"], "/fleet/maintenance");

  const createTicket = useApiMutation<{ id?: number }, { subject: string; description: string; priority: string; category: string }>(
    "/support/tickets",
    "POST",
    [["support-tickets"], ["support-stats"]],
  );

  const openDialog = (m: Maintenance) => {
    setSubject(`صيانة المركبة ${plateOf(m)} — ${typeOf(m)}`);
    setDescription(
      `أثر تشغيلي: المركبة ${plateOf(m)} ${[m.vehicleMake, m.vehicleModel].filter(Boolean).join(" ")}`.trim() +
        `\nنوع الصيانة: ${typeOf(m)}` +
        (dateOf(m) ? `\nالتاريخ: ${formatDateAr(dateOf(m)!)}` : "") +
        (costOf(m) ? `\nالتكلفة: ${formatCurrency(costOf(m))}` : "") +
        (m.description ? `\nملاحظات: ${m.description}` : "") +
        `\n\n(أُنشئت من شاشة أثر الصيانة — صيانة #${m.id})`,
    );
    setPriority(ACTIVE_STATUSES.includes((m.status || "").toLowerCase()) ? "high" : "medium");
    setDialog(m);
  };

  const submit = async () => {
    if (!dialog) return;
    if (!subject.trim() || !description.trim()) {
      toast({ variant: "destructive", title: "الموضوع والوصف مطلوبان" });
      return;
    }
    try {
      await createTicket.mutateAsync({ subject: subject.trim(), description: description.trim(), priority, category: "maintenance" });
      setOpened((prev) => new Set(prev).add(dialog.id));
      toast({ title: "تم فتح تذكرة من الصيانة" });
      setDialog(null);
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر فتح التذكرة", description: err?.fix ?? getErrorMessage(err) });
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const all = data?.data ?? [];
  const rows = onlyActive
    ? all.filter((m) => ACTIVE_STATUSES.includes((m.status || "").toLowerCase()))
    : all;

  const columns: DataTableColumn<Maintenance>[] = [
    { key: "vehicle", header: "المركبة", render: (m) => <span className="font-mono font-medium">{plateOf(m)}</span> },
    { key: "type", header: "نوع الصيانة", render: (m) => <span className="text-sm">{typeOf(m)}</span> },
    {
      key: "status", header: "الحالة",
      render: (m) => {
        const s = (m.status || "").toLowerCase();
        const b = STATUS_BADGE[s] ?? STATUS_BADGE[s.replace("-", "_")];
        return <Badge className={`${b?.cls ?? "bg-muted text-muted-foreground"} text-xs`}>{b?.label ?? m.status ?? "—"}</Badge>;
      },
    },
    { key: "cost", header: "التكلفة", render: (m) => <span className="tabular-nums text-muted-foreground">{costOf(m) ? formatCurrency(costOf(m)) : "—"}</span> },
    { key: "date", header: "التاريخ", render: (m) => <span className="text-xs text-muted-foreground">{dateOf(m) ? formatDateAr(dateOf(m)!) : "—"}</span> },
    {
      key: "actions", header: "",
      render: (m) =>
        opened.has(m.id) ? (
          <span className="inline-flex items-center gap-1 text-xs text-status-success-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" />تذكرة مفتوحة
          </span>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openDialog(m)} rateLimitAware>
            <Ticket className="h-3.5 w-3.5 me-1" />فتح تذكرة
          </Button>
        ),
    },
  ];

  return (
    <PageShell
      title="أثر الصيانة → التذاكر"
      subtitle="المركبة تحت الصيانة = مركبة خارج الخدمة. حوّل أثر الصيانة إلى تذكرة دعم ليتصرّف فريق التشغيل."
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "أثر الصيانة" }]}
    >
      <FleetTabsNav />
      <div className="flex items-center gap-2 mb-4">
        <Wrench className="h-5 w-5 text-status-warning-foreground" />
        <div className="flex gap-1">
          <Button size="sm" variant={onlyActive ? "default" : "outline"} className="h-8 text-xs" onClick={() => setOnlyActive(true)}>
            تحت الصيانة فقط
          </Button>
          <Button size="sm" variant={!onlyActive ? "default" : "outline"} className="h-8 text-xs" onClick={() => setOnlyActive(false)}>
            كل السجلات
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center flex flex-col items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-8 w-8" />
            <div>لا توجد سجلات صيانة في هذا التصنيف.</div>
          </CardContent>
        </Card>
      ) : (
        <DataTable columns={columns} data={rows} emptyMessage="—" pageSize={50} />
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>فتح تذكرة من الصيانة</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">الموضوع</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">الوصف</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} />
            </div>
            <div>
              <Label className="text-xs">الأولوية</Label>
              <div className="flex gap-1 flex-wrap mt-1">
                {PRIORITIES.map((p) => (
                  <Button key={p.value} type="button" size="sm" variant={priority === p.value ? "default" : "outline"} className="h-7 text-xs" onClick={() => setPriority(p.value)}>
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>إلغاء</Button>
            <Button onClick={submit} disabled={createTicket.isPending} rateLimitAware>
              {createTicket.isPending ? "جاري الفتح..." : "فتح التذكرة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
