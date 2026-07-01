// مكافآت حركات النقل — شاشة المشرف (الدفعة أ، تشغيلية بلا دفتر).
//
// المشرف يمنح مكافأة على حركة (أمر توزيع) بمبلغ مقطوع (افتراضه إعداد، قابل
// للتعديل)، باعتماد بشري منفصل قبل ترحيلها للراتب (الدفعة ب). لا قيد هنا.

import { useState, useMemo } from "react";
import { useApiQuery, asList, apiFetch, getErrorMessage } from "@/lib/api";
import { FleetTabsNav } from "@/components/shared/fleet-tabs-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { GuardedButton } from "@/components/shared/permission-gate";
import { SearchableSelect, type SelectOption } from "@/components/shared/searchable-select";
import { formatDateAr } from "@/lib/formatters";
import { toast } from "@/hooks/use-toast";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { CheckCircle, Award } from "lucide-react";

interface BonusRow {
  id: number;
  dispatchOrderId: number;
  bookingId: number | null;
  driverId: number | null;
  driverName: string | null;
  amount: string | number;
  reason: string;
  status: string;
  payrollLineId: number | null;
  createdAt: string;
}

interface EligibleMovement {
  id: number;
  status: string;
  scheduledStartAt: string | null;
  completedAt: string | null;
  driverId: number | null;
  driverName: string | null;
  vehiclePlate: string | null;
  bookingId: number | null;
  bookingNumber: string | null;
  fromLocationText: string | null;
  toLocationText: string | null;
  hasBonus: boolean;
}

const MOVE_STATUS_LABEL: Record<string, string> = {
  executing: "جارية",
  completed: "مكتملة",
  closed: "مغلقة",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "معتمد",
  void: "ملغى",
};

function fmt(v: unknown): string {
  const n = Number(v);
  return Number.isFinite(n) ? `${n.toFixed(2)} ر.س` : "—";
}

export default function MovementBonusesPage() {
  const { data, isLoading, isError, refetch } = useApiQuery<any>(
    ["movement-bonuses"],
    "/fleet/movement-bonuses",
  );
  const rows: BonusRow[] = asList(data?.data || data);

  // منتقي الحركات المؤهَّلة (executing/completed/closed) — بدل الإدخال اليدوي.
  const { data: movesData, isLoading: movesLoading, refetch: refetchMoves } = useApiQuery<any>(
    ["movement-bonuses", "eligible"],
    "/fleet/movement-bonuses/eligible-movements",
  );
  const moves: EligibleMovement[] = asList(movesData?.data || movesData);

  const [dispatchOrderId, setDispatchOrderId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const moveOptions: SelectOption[] = useMemo(
    () =>
      moves.map((m) => {
        const route =
          m.fromLocationText || m.toLocationText
            ? `${m.fromLocationText ?? "—"} ← ${m.toLocationText ?? "—"}`
            : "بلا مسار";
        const parts = [
          formatDateAr(m.scheduledStartAt),
          MOVE_STATUS_LABEL[m.status] ?? m.status,
          m.vehiclePlate ?? null,
          m.hasBonus ? "· له مكافأة سابقة" : null,
        ].filter(Boolean);
        return {
          value: String(m.id),
          label: `#${m.id} · ${m.driverName ?? "بلا سائق"} · ${route}`,
          sublabel: parts.join(" · "),
        };
      }),
    [moves],
  );

  async function award() {
    if (!dispatchOrderId || !reason.trim()) {
      toast({ variant: "destructive", title: "اختر الحركة وأدخل السبب" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/fleet/movement-bonuses`, {
        method: "POST",
        body: JSON.stringify({
          dispatchOrderId: Number(dispatchOrderId),
          amount: amount === "" ? undefined : Number(amount),
          reason: reason.trim(),
        }),
      });
      toast({ title: "تم منح المكافأة" });
      setDispatchOrderId(""); setAmount(""); setReason("");
      refetch(); refetchMoves();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر المنح", description: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function approve(id: number) {
    try {
      await apiFetch(`/fleet/movement-bonuses/${id}/approve`, { method: "POST", body: JSON.stringify({}) });
      toast({ title: "تم اعتماد المكافأة" });
      refetch();
    } catch (e) {
      toast({ variant: "destructive", title: "تعذّر الاعتماد", description: getErrorMessage(e) });
    }
  }

  const pending = rows.filter((r) => r.status === "pending").length;

  const columns: DataTableColumn<BonusRow>[] = [
    { key: "driverName", header: "السائق", sortable: true, searchable: true,
      render: (r) => <span className="font-medium">{r.driverName ?? "—"}</span> },
    { key: "dispatchOrderId", header: "الحركة", align: "center", render: (r) => <span className="font-mono text-xs">#{r.dispatchOrderId}</span> },
    { key: "amount", header: "المبلغ", align: "center", render: (r) => <span className="font-bold">{fmt(r.amount)}</span> },
    { key: "reason", header: "السبب", searchable: true, render: (r) => <span className="text-sm">{r.reason}</span> },
    { key: "status", header: "الحالة", align: "center", sortable: true, render: (r) => (
      r.status === "approved" ? (
        <Badge variant="outline" className="gap-1">
          <CheckCircle className="w-3 h-3 text-status-success" /> {STATUS_LABEL[r.status]}
          {r.payrollLineId != null && <span className="text-[10px] text-muted-foreground">· مُرحّل</span>}
        </Badge>
      ) : <Badge variant="outline">{STATUS_LABEL[r.status] ?? r.status}</Badge>
    ) },
    { key: "actions", header: "إجراء", align: "center", render: (r) => (
      r.status === "pending"
        ? <GuardedButton perm="fleet.movement_bonus:approve" size="sm" onClick={() => approve(r.id)}>اعتماد</GuardedButton>
        : <span className="text-muted-foreground">—</span>
    ) },
  ];

  return (
    <PageShell
      title="مكافآت حركات النقل"
      subtitle="مكافأة مقطوعة يمنحها المشرف لسائق على حركة (أمر توزيع)، باعتماد بشري قبل ترحيلها للراتب"
      breadcrumbs={[{ href: "/fleet", label: "الأسطول" }, { label: "مكافآت حركات النقل" }]}
    >
      <FleetTabsNav />

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">منح مكافأة على حركة</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 min-w-[20rem]">
            <label className="text-xs text-muted-foreground">الحركة (أمر التوزيع)</label>
            <SearchableSelect
              options={moveOptions}
              value={dispatchOrderId}
              onValueChange={setDispatchOrderId}
              disabled={movesLoading}
              placeholder={movesLoading ? "جاري التحميل…" : "اختر حركة"}
              searchPlaceholder="ابحث بالسائق أو الحجز أو المسار…"
              emptyText="لا توجد حركات مؤهَّلة"
              className="h-8"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">المبلغ (ر.س)</label>
            <Input type="number" step="0.5" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="h-8 w-32" placeholder="افتراضي" />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[14rem]">
            <label className="text-xs text-muted-foreground">السبب</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="h-8" placeholder="سبب المكافأة" />
          </div>
          <GuardedButton perm="fleet.movement_bonus:update" size="sm" disabled={busy} onClick={award}>
            <Award className="w-3.5 h-3.5 me-1" /> منح
          </GuardedButton>
          <span className="ms-auto text-xs text-muted-foreground self-center">قيد المراجعة: {pending}</span>
        </CardContent>
      </Card>

      <DataTable
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={isError ? new Error("تعذّر تحميل المكافآت") : null}
        onRetry={refetch}
        emptyMessage="لا توجد مكافآت مسجّلة."
        emptyIcon={<Award className="w-10 h-10 text-gray-300" />}
      />
    </PageShell>
  );
}
