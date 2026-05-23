/**
 * GL posting queue — operator-facing dashboard for the 5 deferred GL
 * integration helpers (#253, #256, #258, #261, #262), exposed via the
 * `/finance/gl-helpers/*` endpoints (#263 + #266 + this PR).
 *
 * Four tabs:
 *   - رواتب Mudad     → acknowledged salary settlements, no journalEntryId
 *   - شطب الدفعات     → recalled/expired/disposed lots, no writeoffJournalEntryId
 *   - إعادة تقييم FX  → fx_revaluation_log rows where journalEntryId IS NULL
 *   - جرد دوري        → approved cycle counts where no line carries
 *                        adjustmentJournalEntryId yet
 *
 * Realised FX renders as a HISTORY tab (not a pending queue): the
 * realisation event is triggered from the invoice settlement
 * workflow, not from this dashboard. The history reads from the
 * `fx_realized_postings` audit table (#270), which now backs the
 * helper's idempotency — same (invoiceId, paymentDate, settlementRate)
 * triple is skipped on retry rather than silently double-booked.
 *
 * Each row has a "Post to GL" button that triggers the helper. The
 * outcome (`posted | draft | skipped | noop`) lands in a toast and
 * the list refetches.
 */
import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Send,
  AlertCircle,
  PackageX,
  Coins,
  RefreshCcw,
  ClipboardCheck,
  History,
} from "lucide-react";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
  PageStatusBadge,
} from "@workspace/ui-core";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { formatCurrency } from "@/lib/formatters";
import { toast } from "@/hooks/use-toast";

interface MudadPendingRow {
  id: number;
  employeeId: number;
  period: string | null;
  amount: string | null;
  status: string;
  submittedAt: string;
  acknowledgedAt: string | null;
}

interface LotPendingRow {
  id: number;
  productId: number;
  warehouseId: number;
  lotNumber: string;
  quantity: string;
  unitCost: string;
  status: "recalled" | "expired" | "disposed";
  recalledAt: string | null;
  expiryDate: string | null;
}

interface FxRevaluationPendingRow {
  id: number;
  periodId: number;
  asOfDate: string;
  functionalCurrency: string;
  totalGain: string;
  totalLoss: string;
  createdAt: string;
}

interface CycleCountPendingRow {
  id: number;
  warehouseId: number;
  scheduledDate: string;
  approvedAt: string | null;
  lineCount: string;
}

interface RealizedFxHistoryRow {
  id: number;
  invoiceId: number;
  paymentDate: string;
  settlementRate: string;
  journalEntryId: number;
  gainLoss: string;
  postedBy: number | null;
  postedAt: string;
}

interface PostOutcome {
  data: {
    status: "posted" | "draft" | "skipped" | "noop";
    journalEntryId: number | null;
    reason?: string;
  };
}

function describeOutcome(o: PostOutcome["data"]): string {
  if (o.status === "posted") return `تم نشر القيد (#${o.journalEntryId})`;
  if (o.status === "draft") return `تم إنشاء مسودة قيد (#${o.journalEntryId})`;
  if (o.status === "skipped") return `تم تجاوز السطر — مسجَّل سابقًا`;
  if (o.status === "noop") return `لا حركة — ${o.reason ?? "لا توجد قيمة قابلة للنشر"}`;
  return "تمت المعالجة";
}

type Tab = "mudad" | "lots" | "fx" | "cycle" | "realized";

export default function GLPostingQueuePage() {
  const [tab, setTab] = useState<Tab>("mudad");

  const mudad = useApiQuery<{ data: MudadPendingRow[] }>(
    ["gl-helpers", "mudad-salary", "pending"],
    "/finance/gl-helpers/mudad-salary/pending",
  );
  const lots = useApiQuery<{ data: LotPendingRow[] }>(
    ["gl-helpers", "lot-writeoff", "pending"],
    "/finance/gl-helpers/lot-writeoff/pending",
  );
  const fx = useApiQuery<{ data: FxRevaluationPendingRow[] }>(
    ["gl-helpers", "fx-revaluation", "pending"],
    "/finance/gl-helpers/fx-revaluation/pending",
  );
  const cycle = useApiQuery<{ data: CycleCountPendingRow[] }>(
    ["gl-helpers", "cycle-count", "pending"],
    "/finance/gl-helpers/cycle-count/pending",
  );
  const realized = useApiQuery<{ data: RealizedFxHistoryRow[] }>(
    ["gl-helpers", "realized-fx", "history"],
    "/finance/gl-helpers/realized-fx/history",
  );

  const postMudad = useApiMutation<PostOutcome, { id: number }>(
    (body) => `/finance/gl-helpers/mudad-salary/${body.id}`,
    "POST",
    [["gl-helpers", "mudad-salary", "pending"]],
    {
      successMessage: false,
      onSuccess: (r) => toast({ title: describeOutcome(r.data) }),
    },
  );

  const postLot = useApiMutation<PostOutcome, { id: number }>(
    (body) => `/finance/gl-helpers/lot-writeoff/${body.id}`,
    "POST",
    [["gl-helpers", "lot-writeoff", "pending"]],
    {
      successMessage: false,
      onSuccess: (r) => toast({ title: describeOutcome(r.data) }),
    },
  );

  const postFx = useApiMutation<PostOutcome, { id: number }>(
    (body) => `/finance/gl-helpers/fx-revaluation/${body.id}`,
    "POST",
    [["gl-helpers", "fx-revaluation", "pending"]],
    {
      successMessage: false,
      onSuccess: (r) => toast({ title: describeOutcome(r.data) }),
    },
  );

  const postCycle = useApiMutation<PostOutcome, { id: number }>(
    (body) => `/finance/gl-helpers/cycle-count/${body.id}`,
    "POST",
    [["gl-helpers", "cycle-count", "pending"]],
    {
      successMessage: false,
      onSuccess: (r) => toast({ title: describeOutcome(r.data) }),
    },
  );

  if (
    mudad.isLoading || lots.isLoading || fx.isLoading ||
    cycle.isLoading || realized.isLoading
  ) {
    return <LoadingSpinner />;
  }
  if (
    mudad.isError || lots.isError || fx.isError ||
    cycle.isError || realized.isError
  ) {
    return <ErrorState />;
  }

  const mudadRows = mudad.data?.data ?? [];
  const lotRows = lots.data?.data ?? [];
  const fxRows = fx.data?.data ?? [];
  const cycleRows = cycle.data?.data ?? [];
  const realizedRows = realized.data?.data ?? [];

  const mudadColumns: DataTableColumn<MudadPendingRow>[] = [
    {
      key: "id",
      header: "#",
      sortable: true,
      className: "font-mono text-muted-foreground",
      render: (r) => r.id,
    },
    {
      key: "employeeId",
      header: "الموظف",
      sortable: true,
      className: "font-medium",
      render: (r) => `#${r.employeeId}`,
    },
    {
      key: "period",
      header: "الفترة",
      sortable: true,
      className: "font-mono text-status-info-foreground",
      render: (r) => r.period ?? "—",
    },
    {
      key: "amount",
      header: "الصافي",
      sortable: true,
      className: "font-semibold",
      render: (r) => formatCurrency(Number(r.amount ?? 0)),
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => <PageStatusBadge status={r.status} domain="shared" />,
    },
    {
      key: "acknowledgedAt",
      header: "تاريخ التأكيد",
      sortable: true,
      render: (r) => (r.acknowledgedAt ?? "").slice(0, 10) || "—",
    },
    {
      key: "actions" as keyof MudadPendingRow,
      header: "",
      render: (r) => (
        <GuardedButton
          perm="finance:approve"
          size="sm"
          variant="outline"
          disabled={postMudad.isPending}
          onClick={() => postMudad.mutate({ id: r.id })}
        >
          <Send className="h-3.5 w-3.5 ml-1" />
          نشر للقيد
        </GuardedButton>
      ),
    },
  ];

  const lotColumns: DataTableColumn<LotPendingRow>[] = [
    {
      key: "id",
      header: "#",
      sortable: true,
      className: "font-mono text-muted-foreground",
      render: (r) => r.id,
    },
    {
      key: "lotNumber",
      header: "رقم الدفعة",
      sortable: true,
      className: "font-mono",
      render: (r) => r.lotNumber,
    },
    {
      key: "productId",
      header: "المنتج",
      sortable: true,
      render: (r) => `#${r.productId}`,
    },
    {
      key: "quantity",
      header: "الكمية",
      sortable: true,
      className: "font-mono",
      render: (r) => Number(r.quantity).toFixed(2),
    },
    {
      key: "unitCost",
      header: "تكلفة الوحدة",
      sortable: true,
      render: (r) => formatCurrency(Number(r.unitCost)),
    },
    {
      key: "status",
      header: "الحالة",
      render: (r) => <PageStatusBadge status={r.status} domain="shared" />,
    },
    {
      key: "actions" as keyof LotPendingRow,
      header: "",
      render: (r) => (
        <GuardedButton
          perm="finance:approve"
          size="sm"
          variant="outline"
          disabled={postLot.isPending}
          onClick={() => postLot.mutate({ id: r.id })}
        >
          <Send className="h-3.5 w-3.5 ml-1" />
          نشر للقيد
        </GuardedButton>
      ),
    },
  ];

  const fxColumns: DataTableColumn<FxRevaluationPendingRow>[] = [
    {
      key: "id",
      header: "#",
      sortable: true,
      className: "font-mono text-muted-foreground",
      render: (r) => r.id,
    },
    {
      key: "asOfDate",
      header: "بتاريخ",
      sortable: true,
      className: "font-mono text-status-info-foreground",
      render: (r) => r.asOfDate,
    },
    {
      key: "functionalCurrency",
      header: "العملة الوظيفية",
      render: (r) => r.functionalCurrency,
    },
    {
      key: "totalGain",
      header: "إجمالي الربح",
      sortable: true,
      className: "font-semibold text-emerald-600",
      render: (r) => formatCurrency(Number(r.totalGain)),
    },
    {
      key: "totalLoss",
      header: "إجمالي الخسارة",
      sortable: true,
      className: "font-semibold text-status-error-foreground",
      render: (r) => formatCurrency(Number(r.totalLoss)),
    },
    {
      key: "actions" as keyof FxRevaluationPendingRow,
      header: "",
      render: (r) => (
        <GuardedButton
          perm="finance:approve"
          size="sm"
          variant="outline"
          disabled={postFx.isPending}
          onClick={() => postFx.mutate({ id: r.id })}
        >
          <Send className="h-3.5 w-3.5 ml-1" />
          نشر للقيد
        </GuardedButton>
      ),
    },
  ];

  const cycleColumns: DataTableColumn<CycleCountPendingRow>[] = [
    {
      key: "id",
      header: "#",
      sortable: true,
      className: "font-mono text-muted-foreground",
      render: (r) => r.id,
    },
    {
      key: "warehouseId",
      header: "المستودع",
      sortable: true,
      render: (r) => `#${r.warehouseId}`,
    },
    {
      key: "scheduledDate",
      header: "تاريخ الجرد",
      sortable: true,
      className: "font-mono",
      render: (r) => r.scheduledDate,
    },
    {
      key: "lineCount",
      header: "عدد الأصناف",
      sortable: true,
      render: (r) => r.lineCount,
    },
    {
      key: "approvedAt",
      header: "تاريخ الاعتماد",
      sortable: true,
      render: (r) => (r.approvedAt ?? "").slice(0, 10) || "—",
    },
    {
      key: "actions" as keyof CycleCountPendingRow,
      header: "",
      render: (r) => (
        <GuardedButton
          perm="finance:approve"
          size="sm"
          variant="outline"
          disabled={postCycle.isPending}
          onClick={() => postCycle.mutate({ id: r.id })}
        >
          <Send className="h-3.5 w-3.5 ml-1" />
          نشر للقيد
        </GuardedButton>
      ),
    },
  ];

  const realizedColumns: DataTableColumn<RealizedFxHistoryRow>[] = [
    {
      key: "id",
      header: "#",
      sortable: true,
      className: "font-mono text-muted-foreground",
      render: (r) => r.id,
    },
    {
      key: "invoiceId",
      header: "الفاتورة",
      sortable: true,
      className: "font-medium",
      render: (r) => `#${r.invoiceId}`,
    },
    {
      key: "paymentDate",
      header: "تاريخ الدفع",
      sortable: true,
      className: "font-mono",
      render: (r) => r.paymentDate,
    },
    {
      key: "settlementRate",
      header: "سعر التسوية",
      render: (r) => Number(r.settlementRate).toFixed(6),
    },
    {
      key: "gainLoss",
      header: "ربح/خسارة",
      sortable: true,
      className: "font-semibold",
      render: (r) => {
        const v = Number(r.gainLoss);
        return (
          <span className={v >= 0 ? "text-emerald-600" : "text-status-error-foreground"}>
            {formatCurrency(v)}
          </span>
        );
      },
    },
    {
      key: "journalEntryId",
      header: "قيد المحاسبة",
      sortable: true,
      className: "font-mono text-status-info-foreground",
      render: (r) => `#${r.journalEntryId}`,
    },
    {
      key: "postedAt",
      header: "تاريخ الترحيل",
      sortable: true,
      render: (r) => (r.postedAt ?? "").slice(0, 10),
    },
  ];

  return (
    <PageShell
      title="قائمة الانتظار للترحيل المحاسبي"
      subtitle="السجلات الجاهزة للترحيل إلى الأستاذ العام — Mudad، شطب الدفعات، إعادة تقييم FX، الجرد الدوري"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "قائمة الترحيل" }]}
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-status-info-surface rounded-lg">
              <Coins className="h-5 w-5 text-status-info-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">رواتب Mudad</p>
              <p className="text-xl font-bold">{mudadRows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-status-warning-surface rounded-lg">
              <PackageX className="h-5 w-5 text-status-warning-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">شطب دفعات</p>
              <p className="text-xl font-bold">{lotRows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-violet-50 rounded-lg">
              <RefreshCcw className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إعادة تقييم FX</p>
              <p className="text-xl font-bold">{fxRows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-teal-50 rounded-lg">
              <ClipboardCheck className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">جرد دوري معتمد</p>
              <p className="text-xl font-bold">{cycleRows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-rose-50 rounded-lg">
              <History className="h-5 w-5 text-rose-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">FX مُحقَّق (سجل)</p>
              <p className="text-xl font-bold">{realizedRows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الإجمالي</p>
              <p className="text-xl font-bold">
                {mudadRows.length + lotRows.length + fxRows.length + cycleRows.length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="mudad">
            رواتب Mudad ({mudadRows.length})
          </TabsTrigger>
          <TabsTrigger value="lots">
            شطب الدفعات ({lotRows.length})
          </TabsTrigger>
          <TabsTrigger value="fx">
            إعادة تقييم FX ({fxRows.length})
          </TabsTrigger>
          <TabsTrigger value="cycle">
            جرد دوري ({cycleRows.length})
          </TabsTrigger>
          <TabsTrigger value="realized">
            FX مُحقَّق ({realizedRows.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mudad" className="mt-3">
          <DataTable
            columns={mudadColumns}
            data={mudadRows}
            rowKey={(r) => `mudad-${r.id}`}
            emptyMessage="لا توجد رواتب معتمدة بانتظار الترحيل"
            emptyIcon={<Coins className="h-10 w-10 opacity-30" />}
            pageSize={20}
            noToolbar
          />
        </TabsContent>

        <TabsContent value="lots" className="mt-3">
          <DataTable
            columns={lotColumns}
            data={lotRows}
            rowKey={(r) => `lot-${r.id}`}
            emptyMessage="لا توجد دفعات مخزون بانتظار الشطب المحاسبي"
            emptyIcon={<PackageX className="h-10 w-10 opacity-30" />}
            pageSize={20}
            noToolbar
          />
        </TabsContent>

        <TabsContent value="fx" className="mt-3">
          <DataTable
            columns={fxColumns}
            data={fxRows}
            rowKey={(r) => `fx-${r.id}`}
            emptyMessage="لا توجد عمليات إعادة تقييم FX بانتظار الترحيل"
            emptyIcon={<RefreshCcw className="h-10 w-10 opacity-30" />}
            pageSize={20}
            noToolbar
          />
        </TabsContent>

        <TabsContent value="cycle" className="mt-3">
          <DataTable
            columns={cycleColumns}
            data={cycleRows}
            rowKey={(r) => `cycle-${r.id}`}
            emptyMessage="لا توجد عمليات جرد دوري معتمدة بانتظار الترحيل"
            emptyIcon={<ClipboardCheck className="h-10 w-10 opacity-30" />}
            pageSize={20}
            noToolbar
          />
        </TabsContent>

        <TabsContent value="realized" className="mt-3">
          <div className="mb-2 text-xs text-muted-foreground">
            سجل آخر 200 عملية تحقيق FX. لا يوجد طابور "قيد الانتظار" هنا — يُرحَّل التحقيق من شاشة تسوية الفاتورة مباشرةً.
          </div>
          <DataTable
            columns={realizedColumns}
            data={realizedRows}
            rowKey={(r) => `realized-${r.id}`}
            emptyMessage="لم تُرحَّل أي عملية تحقيق FX بعد"
            emptyIcon={<History className="h-10 w-10 opacity-30" />}
            pageSize={20}
            noToolbar
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
