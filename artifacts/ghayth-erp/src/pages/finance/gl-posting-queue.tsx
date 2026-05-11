/**
 * GL posting queue — operator-facing dashboard for the 5 deferred GL
 * integration helpers (#253, #256, #258, #261, #262), exposed via the
 * new `/finance/gl-helpers/*` endpoints in #263.
 *
 * Two tabs today (the simplest sources with pending-listing endpoints):
 *
 *   - Mudad salary settlements with `status='acknowledged'` and no
 *     `journalEntryId` yet → POST /gl-helpers/mudad-salary/:id
 *   - Stock lots in recalled/expired/disposed status with no
 *     `writeoffJournalEntryId` yet → POST /gl-helpers/lot-writeoff/:id
 *
 * The FX revaluation, realised FX, and cycle-count tabs land in
 * follow-ups when their listing endpoints exist (the helpers
 * themselves are already wired through the same route file).
 *
 * Each row has a "Post to GL" button that triggers the helper. The
 * outcome (`posted | draft | skipped | noop`) lands in a toast and
 * the list refetches.
 */
import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Send, AlertCircle, PackageX, Coins } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
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

export default function GLPostingQueuePage() {
  const [tab, setTab] = useState<"mudad" | "lots">("mudad");

  const mudad = useApiQuery<{ data: MudadPendingRow[] }>(
    ["gl-helpers", "mudad-salary", "pending"],
    "/finance/gl-helpers/mudad-salary/pending",
  );
  const lots = useApiQuery<{ data: LotPendingRow[] }>(
    ["gl-helpers", "lot-writeoff", "pending"],
    "/finance/gl-helpers/lot-writeoff/pending",
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

  if (mudad.isLoading || lots.isLoading) return <LoadingSpinner />;
  if (mudad.isError || lots.isError) return <ErrorState />;

  const mudadRows = mudad.data?.data ?? [];
  const lotRows = lots.data?.data ?? [];

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
      className: "font-mono text-blue-600",
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
        <Button
          size="sm"
          variant="outline"
          disabled={postMudad.isPending}
          onClick={() => postMudad.mutate({ id: r.id })}
        >
          <Send className="h-3.5 w-3.5 ml-1" />
          نشر للقيد
        </Button>
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
        <Button
          size="sm"
          variant="outline"
          disabled={postLot.isPending}
          onClick={() => postLot.mutate({ id: r.id })}
        >
          <Send className="h-3.5 w-3.5 ml-1" />
          نشر للقيد
        </Button>
      ),
    },
  ];

  return (
    <PageShell
      title="قائمة الانتظار للترحيل المحاسبي"
      subtitle="السجلات الجاهزة للترحيل إلى الأستاذ العام (Mudad / دفعات المخزون)"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "قائمة الترحيل" }]}
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Coins className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">رواتب Mudad معتمدة</p>
              <p className="text-xl font-bold">{mudadRows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg">
              <PackageX className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">دفعات مخزون للشطب</p>
              <p className="text-xl font-bold">{lotRows.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الإجمالي قيد الانتظار</p>
              <p className="text-xl font-bold">{mudadRows.length + lotRows.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "mudad" | "lots")}>
        <TabsList>
          <TabsTrigger value="mudad">
            رواتب Mudad ({mudadRows.length})
          </TabsTrigger>
          <TabsTrigger value="lots">
            شطب الدفعات ({lotRows.length})
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
      </Tabs>
    </PageShell>
  );
}
