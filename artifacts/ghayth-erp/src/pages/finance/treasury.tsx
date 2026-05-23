import { useState } from "react";
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import {
  Landmark, Banknote, Building2, ArrowDownCircle, ArrowUpCircle,
  TrendingUp, TrendingDown, KeyRound, Eye, Wallet,
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { useAppContext } from "@/contexts/app-context";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function TreasuryPage() {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["treasury", scopeQueryString],
    `/finance/treasury${scopeSuffix}`,
  );
  const [activeTab, setActiveTab] = useState<"accounts" | "movements" | "daily">("accounts");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const summary = data?.summary || {};
  const accounts = data?.accounts || [];
  const movements = data?.recentMovements || [];
  const dailySummary = data?.dailySummary || [];

  const accountColumns: DataTableColumn<any>[] = [
    {
      key: "code",
      header: "الكود",
      sortable: true,
      render: (a) => <span className="font-mono text-sm text-status-info-foreground">{a.code}</span>,
    },
    {
      key: "name",
      header: "اسم الحساب",
      sortable: true,
      render: (a) => <span className="font-medium">{a.name}</span>,
    },
    {
      key: "type",
      header: "النوع",
      render: (a) => {
        if (a.code?.startsWith("110")) return <Badge variant="outline" className="text-status-success-foreground border-status-success-surface">صندوق نقدي</Badge>;
        if (a.code?.startsWith("11")) return <Badge variant="outline" className="text-status-info-foreground border-status-info-surface">حساب بنكي</Badge>;
        return <Badge variant="outline" className="text-status-warning-foreground border-status-warning-surface">ذمم مدينة</Badge>;
      },
    },
    {
      key: "currentBalance",
      header: "الرصيد الحالي",
      sortable: true,
      render: (a) => {
        const bal = Number(a.currentBalance ?? 0);
        return (
          <span className={`font-bold ${bal >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}`}>
            {formatCurrency(bal)}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "",
      render: (a) => (
        <Link href={`/finance/ledger/${a.code}`}>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="دفتر الأستاذ">
            <Eye className="h-4 w-4" />
          </Button>
        </Link>
      ),
    },
  ];

  const movementColumns: DataTableColumn<any>[] = [
    {
      key: "ref",
      header: "المرجع",
      sortable: true,
      render: (m) => <span className="font-mono text-sm text-status-info-foreground">{m.ref}</span>,
    },
    {
      key: "description",
      header: "الوصف",
      sortable: true,
      render: (m) => <span className="text-sm">{m.description}</span>,
    },
    {
      key: "type",
      header: "النوع",
      render: (m) => <Badge variant="outline" className="text-xs">{m.type || "—"}</Badge>,
    },
    {
      key: "cashIn",
      header: "وارد",
      sortable: true,
      render: (m) => {
        const v = Number(m.cashIn ?? 0);
        return v > 0 ? <span className="text-status-success-foreground font-semibold">{formatCurrency(v)}</span> : <span className="text-gray-300">—</span>;
      },
    },
    {
      key: "cashOut",
      header: "صادر",
      sortable: true,
      render: (m) => {
        const v = Number(m.cashOut ?? 0);
        return v > 0 ? <span className="text-status-error-foreground font-semibold">{formatCurrency(v)}</span> : <span className="text-gray-300">—</span>;
      },
    },
    {
      key: "createdAt",
      header: "التاريخ",
      sortable: true,
      render: (m) => <span className="text-muted-foreground text-sm">{m.createdAt ? formatDateAr(m.createdAt) : "—"}</span>,
    },
  ];

  const dailyColumns: DataTableColumn<any>[] = [
    {
      key: "day",
      header: "اليوم",
      sortable: true,
      render: (d) => <span className="font-medium">{d.day ? formatDateAr(d.day) : "—"}</span>,
    },
    {
      key: "totalIn",
      header: "إجمالي الوارد",
      sortable: true,
      render: (d) => <span className="text-status-success-foreground font-semibold">{formatCurrency(Number(d.totalIn ?? 0))}</span>,
    },
    {
      key: "totalOut",
      header: "إجمالي الصادر",
      sortable: true,
      render: (d) => <span className="text-status-error-foreground font-semibold">{formatCurrency(Number(d.totalOut ?? 0))}</span>,
    },
    {
      key: "net",
      header: "الصافي",
      sortable: true,
      render: (d) => {
        const net = Number(d.totalIn ?? 0) - Number(d.totalOut ?? 0);
        return (
          <span className={`font-bold ${net >= 0 ? "text-status-success-foreground" : "text-status-error-foreground"}`}>
            {formatCurrency(net)}
          </span>
        );
      },
    },
  ];

  return (
    <PageShell
      title="الخزينة وإدارة السيولة"
      subtitle="مراقبة الأرصدة النقدية والحركات المالية والعهد"
      breadcrumbs={[{ href: "/finance", label: "المالية" }, { label: "الخزينة" }]}
      loading={isLoading}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/finance/custodies">
              <KeyRound className="h-4 w-4 me-1" />العهد
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/finance/cashflow">
              <TrendingUp className="h-4 w-4 me-1" />التدفق النقدي
            </Link>
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-status-success-surface border border-status-success-surface">
              <Landmark className="h-5 w-5 text-status-success-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي السيولة</p>
              <p className="text-lg font-bold text-status-success-foreground">{formatCurrency(summary.totalCash ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-emerald-50 border border-emerald-100">
              <Banknote className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">النقد بالصندوق</p>
              <p className="text-lg font-bold">{formatCurrency(summary.cashOnHand ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-status-info-surface border border-status-info-surface">
              <Building2 className="h-5 w-5 text-status-info-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">أرصدة بنكية</p>
              <p className="text-lg font-bold">{formatCurrency(summary.bankBalances ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-status-warning-surface border border-status-warning-surface">
              <Wallet className="h-5 w-5 text-status-warning-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ذمم مدينة</p>
              <p className="text-lg font-bold">{formatCurrency(summary.receivables ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-violet-50 border border-violet-100">
              <KeyRound className="h-5 w-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">عهد نشطة</p>
              <p className="text-lg font-bold">{summary.activeCustodies ?? 0}</p>
              <p className="text-xs text-violet-600">{formatCurrency(summary.outstandingCustodies ?? 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-surface-subtle border border-border">
              <TrendingDown className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">حسابات نقدية</p>
              <p className="text-lg font-bold">{accounts.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 mt-2">
        <Button
          variant={activeTab === "accounts" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("accounts")}
        >
          الحسابات النقدية
        </Button>
        <Button
          variant={activeTab === "movements" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("movements")}
        >
          آخر الحركات
        </Button>
        <Button
          variant={activeTab === "daily" ? "default" : "outline"}
          size="sm"
          onClick={() => setActiveTab("daily")}
        >
          ملخص يومي
        </Button>
      </div>

      {activeTab === "accounts" && (
        <DataTable
          columns={accountColumns}
          data={accounts}
          isLoading={isLoading}
          isError={isError}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyMessage="لا توجد حسابات نقدية"
          emptyIcon={<Landmark className="h-6 w-6 text-slate-400" />}
          searchPlaceholder="بحث بالكود أو الاسم..."
        />
      )}

      {activeTab === "movements" && (
        <DataTable
          columns={movementColumns}
          data={movements}
          isLoading={isLoading}
          isError={isError}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyMessage="لا توجد حركات نقدية حديثة"
          emptyIcon={<ArrowDownCircle className="h-6 w-6 text-slate-400" />}
          searchPlaceholder="بحث بالمرجع أو الوصف..."
        />
      )}

      {activeTab === "daily" && (
        <DataTable
          columns={dailyColumns}
          data={dailySummary}
          isLoading={isLoading}
          isError={isError}
          error={error as Error | null}
          onRetry={() => refetch()}
          emptyMessage="لا توجد بيانات يومية"
          emptyIcon={<TrendingUp className="h-6 w-6 text-slate-400" />}
          searchPlaceholder={null}
        />
      )}
    </PageShell>
  );
}
