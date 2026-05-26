import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Plus, Wallet, ArrowDownToLine } from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";

interface CustomerAdvance {
  id: number;
  ref: string;
  amount: number | string;
  appliedAmount: number | string;
  remaining: number | string;
  method: string | null;
  receivedDate: string | null;
  status: "open" | "partially_applied" | "fully_applied" | "cancelled" | string;
  journalId: number | null;
  createdAt: string | null;
  clientName: string | null;
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  open: { label: "مفتوحة", tone: "bg-status-info-surface text-status-info-foreground" },
  partially_applied: { label: "مطبقة جزئياً", tone: "bg-status-warning-surface text-status-warning-foreground" },
  fully_applied: { label: "مطبقة بالكامل", tone: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "ملغاة", tone: "bg-muted text-muted-foreground" },
};

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  check: "شيك",
  credit_card: "بطاقة ائتمان",
};

export default function CustomerAdvancesPage() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data, isLoading, isError, refetch } = useApiQuery<{ data: CustomerAdvance[] }>(
    ["customer-advances", statusFilter],
    `/finance/customer-advances${statusFilter ? `?status=${statusFilter}` : ""}`,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const rows = data?.data ?? [];

  const totalsByStatus = rows.reduce(
    (acc, r) => {
      const amt = Number(r.amount);
      const rem = Number(r.remaining);
      acc.total += amt;
      acc.remaining += rem;
      if (r.status === "open" || r.status === "partially_applied") {
        acc.openCount += 1;
        acc.openAmount += rem;
      }
      return acc;
    },
    { total: 0, remaining: 0, openCount: 0, openAmount: 0 },
  );

  const cols: DataTableColumn<CustomerAdvance>[] = [
    { key: "ref", header: "المرجع",
      render: (r) => <span className="font-mono text-xs">{r.ref}</span> },
    { key: "clientName", header: "العميل",
      render: (r) => r.clientName ?? <span className="italic text-muted-foreground">— محذوف —</span> },
    { key: "receivedDate", header: "تاريخ الاستلام",
      render: (r) => <span className="text-xs">{r.receivedDate ? formatDateAr(r.receivedDate) : "—"}</span> },
    { key: "method", header: "الطريقة",
      render: (r) => <Badge variant="outline" className="text-xs">{METHOD_LABEL[r.method ?? ""] ?? r.method ?? "—"}</Badge> },
    { key: "amount", header: "إجمالي",
      render: (r) => <span className="font-mono">{formatCurrency(Number(r.amount))}</span> },
    { key: "appliedAmount", header: "مُطبَّق",
      render: (r) => <span className="font-mono text-emerald-700">{formatCurrency(Number(r.appliedAmount))}</span> },
    { key: "remaining", header: "متبقي",
      render: (r) => <span className="font-mono font-bold text-status-warning-foreground">{formatCurrency(Number(r.remaining))}</span> },
    { key: "status", header: "الحالة",
      render: (r) => {
        const s = STATUS_LABEL[r.status] ?? { label: r.status, tone: "bg-muted" };
        return <Badge className={`text-xs ${s.tone}`}>{s.label}</Badge>;
      },
    },
    { key: "actions", header: "الإجراءات",
      render: (r) => (
        <div className="flex gap-1">
          {Number(r.remaining) > 0 && (
            <GuardedButton perm="finance:create" variant="outline" size="sm"
              onClick={() => navigate(`/finance/customer-advances/${r.id}/apply`)}>
              <ArrowDownToLine className="h-3 w-3 me-1" /> تطبيق
            </GuardedButton>
          )}
          {r.journalId && (
            <Link href={`/finance/journal/${r.journalId}`}>
              <Button variant="ghost" size="sm">القيد</Button>
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="دفعات مقدمة من العملاء"
      subtitle="customer advances — مبالغ مستلمة قبل الفاتورة، تُسجّل في حساب الالتزامات وتُطبَّق لاحقاً على فواتير العميل"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { label: "دفعات مقدمة" },
      ]}
      actions={
        <GuardedButton perm="finance:create" onClick={() => navigate("/finance/customer-advances/create")}>
          <Plus className="h-4 w-4 me-1" /> دفعة مقدمة جديدة
        </GuardedButton>
      }
    >
      <FinanceTabsNav />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">عدد الدفعات</p>
            <p className="text-lg font-bold font-mono">{rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المُستلم</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(totalsByStatus.total)}</p>
          </CardContent>
        </Card>
        <Card className="border-status-warning-surface">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Wallet className="h-3 w-3" /> الرصيد المتبقي
            </p>
            <p className="text-lg font-bold font-mono text-status-warning-foreground">{formatCurrency(totalsByStatus.remaining)}</p>
            <p className="text-[10px] text-muted-foreground">قابل للتطبيق على فواتير</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">دفعات مفتوحة</p>
            <p className="text-lg font-bold font-mono">{totalsByStatus.openCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Badge
          variant={statusFilter === "" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => { setStatusFilter(""); refetch(); }}
        >الكل</Badge>
        <Badge
          variant={statusFilter === "open" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => { setStatusFilter("open"); refetch(); }}
        >مفتوحة</Badge>
        <Badge
          variant={statusFilter === "partially_applied" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => { setStatusFilter("partially_applied"); refetch(); }}
        >مطبقة جزئياً</Badge>
        <Badge
          variant={statusFilter === "fully_applied" ? "default" : "outline"}
          className="cursor-pointer"
          onClick={() => { setStatusFilter("fully_applied"); refetch(); }}
        >مطبقة بالكامل</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={rows}
            pageSize={50}
            emptyMessage="لا توجد دفعات مقدمة"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
