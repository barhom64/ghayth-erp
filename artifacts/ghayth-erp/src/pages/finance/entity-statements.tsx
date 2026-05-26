import { useState, useMemo } from "react";
import { useApiQuery } from "@/lib/api";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Building,
  GitBranch,
  Layers,
  FileText,
} from "lucide-react";
import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import {
  ClientSelect,
  SupplierSelect,
  EmployeeSelect,
  VehicleSelect,
} from "@/components/shared/entity-selects";
import { SearchableSelect } from "@/components/shared/searchable-select";
import { formatCurrency, formatDateAr } from "@/lib/formatters";

/**
 * Finance / Entity Statements & Subsidiary Ledger.
 *
 * Phase D / Finance gap. Closes 4 unused-backend report
 * endpoints by bundling them under one entry point:
 *
 *   GET /finance/reports/customer-statement/:clientId
 *     → Statement of a single client's account: invoices,
 *       receipts, advances, dunning notices, with running
 *       balance + aging buckets. Replaces the "send me the
 *       client's outstanding via WhatsApp" workflow.
 *
 *   GET /finance/reports/vendor-statement/:supplierId
 *     → Same shape for vendors: POs, GRs, invoices, payments,
 *       outstanding aging.
 *
 *   GET /finance/subsidiary-ledger/:entityType/:entityId
 *     → Per-entity subsidiary GL trace: every journal line
 *       hitting the entity's subsidiary account (employee
 *       custody, vehicle expense pot, etc.). The 6 supported
 *       entity types match createSubsidiaryAccountsForEntity:
 *       employee / client / vendor / vehicle / driver /
 *       property.
 *
 *   GET /finance/cost-center-report
 *     → Cost-center P&L aggregator: expenses + revenue +
 *       entry counts grouped by costCenter. Drill-down on
 *       a specific costCenter returns the underlying 50
 *       journal entries.
 *
 * Date range applies to all tabs through shared inputs at
 * the top — keeps muscle memory consistent with the existing
 * /finance/reports page.
 */

const defaultStart = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
};
const todayISO = () => new Date().toISOString().slice(0, 10);

const ENTITY_TYPES = [
  { value: "employee", label: "موظف" },
  { value: "client", label: "عميل" },
  { value: "vendor", label: "مورد" },
  { value: "vehicle", label: "مركبة" },
  { value: "driver", label: "سائق" },
  { value: "property", label: "عقار" },
];

export default function EntityStatementsPage() {
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(todayISO());

  return (
    <PageShell
      title="كشوف الحسابات والحركات الفرعية"
      subtitle="كشف حساب عميل/مورد، حركة الحساب الفرعي، وتقرير مراكز التكلفة"
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: "/finance/reports", label: "التقارير" },
        { label: "كشوف الجهات" },
      ]}
    >
      <FinanceTabsNav />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">الفترة</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">من تاريخ</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">إلى تاريخ</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="customer" dir="rtl" className="w-full">
        <TabsList>
          <TabsTrigger value="customer" className="gap-1.5">
            <User className="h-4 w-4" />
            كشف حساب عميل
          </TabsTrigger>
          <TabsTrigger value="vendor" className="gap-1.5">
            <Building className="h-4 w-4" />
            كشف حساب مورد
          </TabsTrigger>
          <TabsTrigger value="subsidiary" className="gap-1.5">
            <Layers className="h-4 w-4" />
            حركة حساب فرعي
          </TabsTrigger>
          <TabsTrigger value="cost-center" className="gap-1.5">
            <GitBranch className="h-4 w-4" />
            تقرير مراكز التكلفة
          </TabsTrigger>
        </TabsList>

        <TabsContent value="customer" className="space-y-3">
          <CustomerStatementTab startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="vendor" className="space-y-3">
          <VendorStatementTab startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="subsidiary" className="space-y-3">
          <SubsidiaryLedgerTab startDate={startDate} endDate={endDate} />
        </TabsContent>
        <TabsContent value="cost-center" className="space-y-3">
          <CostCenterReportTab startDate={startDate} endDate={endDate} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

interface StatementRow {
  date: string;
  ref: string;
  description: string;
  debit: number | string;
  credit: number | string;
  runningBalance?: number;
  type?: string;
}

interface StatementResponse {
  entity?: {
    id: number;
    name: string;
    phone?: string;
    email?: string;
    vatNumber?: string;
    taxNumber?: string;
  };
  openingBalance?: number;
  closingBalance?: number;
  totalDebit?: number;
  totalCredit?: number;
  rows?: StatementRow[];
  data?: StatementRow[];
}

function CustomerStatementTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [clientId, setClientId] = useState("");
  const enabled = !!clientId;
  const params = `startDate=${startDate}&endDate=${endDate}`;
  const { data, isLoading, error, refetch } = useApiQuery<StatementResponse>(
    ["finance-customer-statement", clientId, params],
    `/finance/reports/customer-statement/${clientId}?${params}`,
    { enabled },
  );

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="space-y-1.5 max-w-md">
            <label className="text-sm font-medium">العميل</label>
            <ClientSelect
              value={clientId}
              onChange={setClientId}
              placeholder="اختر العميل..."
            />
          </div>
        </CardContent>
      </Card>

      {enabled && (
        <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
          <StatementBody data={data} />
        </PageStateWrapper>
      )}
    </>
  );
}

function VendorStatementTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [supplierId, setSupplierId] = useState("");
  const enabled = !!supplierId;
  const params = `startDate=${startDate}&endDate=${endDate}`;
  const { data, isLoading, error, refetch } = useApiQuery<StatementResponse>(
    ["finance-vendor-statement", supplierId, params],
    `/finance/reports/vendor-statement/${supplierId}?${params}`,
    { enabled },
  );

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="space-y-1.5 max-w-md">
            <label className="text-sm font-medium">المورد</label>
            <SupplierSelect
              value={supplierId}
              onChange={setSupplierId}
              placeholder="اختر المورد..."
            />
          </div>
        </CardContent>
      </Card>

      {enabled && (
        <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
          <StatementBody data={data} />
        </PageStateWrapper>
      )}
    </>
  );
}

function StatementBody({ data }: { data: StatementResponse | undefined }) {
  const rows = data?.rows ?? data?.data ?? [];

  const columns: DataTableColumn<StatementRow>[] = [
    {
      key: "date",
      header: "التاريخ",
      render: (r) => (r.date ? formatDateAr(r.date) : "—"),
    },
    {
      key: "ref",
      header: "المرجع",
      className: "font-mono text-xs",
      ltr: true,
    },
    { key: "description", header: "البيان" },
    {
      key: "debit",
      header: "مدين",
      render: (r) => Number(r.debit) > 0 ? formatCurrency(Number(r.debit)) : "—",
    },
    {
      key: "credit",
      header: "دائن",
      render: (r) => Number(r.credit) > 0 ? formatCurrency(Number(r.credit)) : "—",
    },
    {
      key: "runningBalance",
      header: "الرصيد",
      render: (r) => (
        <span className="font-semibold">
          {r.runningBalance != null ? formatCurrency(r.runningBalance) : "—"}
        </span>
      ),
    },
  ];

  if (!data) return null;
  return (
    <>
      {data.entity && (
        <Card>
          <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">الجهة</div>
              <div className="font-semibold">{data.entity.name}</div>
            </div>
            {data.entity.vatNumber || data.entity.taxNumber ? (
              <div>
                <div className="text-xs text-muted-foreground">الرقم الضريبي</div>
                <div className="font-mono" dir="ltr">
                  {data.entity.vatNumber || data.entity.taxNumber}
                </div>
              </div>
            ) : null}
            {data.entity.phone && (
              <div>
                <div className="text-xs text-muted-foreground">الهاتف</div>
                <div className="font-mono" dir="ltr">
                  {data.entity.phone}
                </div>
              </div>
            )}
            {data.entity.email && (
              <div>
                <div className="text-xs text-muted-foreground">البريد</div>
                <div className="text-xs">{data.entity.email}</div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="رصيد افتتاحي" value={data.openingBalance} />
        <SummaryCard label="مجموع المدين" value={data.totalDebit} tone="info" />
        <SummaryCard label="مجموع الدائن" value={data.totalCredit} tone="info" />
        <SummaryCard label="رصيد ختامي" value={data.closingBalance} tone="warning" />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(_r, i) => `${_r.ref}-${i}`}
        emptyMessage="لا توجد حركات خلال الفترة المحددة"
      />
    </>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | undefined;
  tone?: "default" | "info" | "warning";
}) {
  const toneClass =
    tone === "warning"
      ? "text-status-warning-foreground"
      : tone === "info"
        ? "text-status-info-foreground"
        : "";
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-lg font-semibold ${toneClass}`}>
          {value != null ? formatCurrency(value) : "—"}
        </div>
      </CardContent>
    </Card>
  );
}

interface SubsidiaryLedgerRow {
  journalId: number;
  ref: string;
  description: string;
  date: string;
  accountCode: string;
  debit: number | string;
  credit: number | string;
}

function SubsidiaryLedgerTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [entityType, setEntityType] = useState<string>("employee");
  const [entityId, setEntityId] = useState("");
  const enabled = !!entityId && !!entityType;
  const params = `startDate=${startDate}&endDate=${endDate}`;
  const { data, isLoading, error, refetch } = useApiQuery<{
    data: SubsidiaryLedgerRow[];
    totalDebit?: number;
    totalCredit?: number;
  }>(
    ["finance-subsidiary-ledger", entityType, entityId, params],
    `/finance/subsidiary-ledger/${entityType}/${entityId}?${params}`,
    { enabled },
  );

  const picker = useMemo(() => {
    switch (entityType) {
      case "employee":
        return <EmployeeSelect value={entityId} onChange={setEntityId} />;
      case "client":
        return <ClientSelect value={entityId} onChange={setEntityId} />;
      case "vendor":
        return <SupplierSelect value={entityId} onChange={setEntityId} />;
      case "vehicle":
        return <VehicleSelect value={entityId} onChange={setEntityId} />;
      default:
        return (
          <input
            type="number"
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            placeholder={`رقم ${entityType}`}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        );
    }
  }, [entityType, entityId]);

  const columns: DataTableColumn<SubsidiaryLedgerRow>[] = [
    {
      key: "date",
      header: "التاريخ",
      render: (r) => (r.date ? formatDateAr(r.date) : "—"),
    },
    {
      key: "ref",
      header: "المرجع",
      className: "font-mono text-xs",
      ltr: true,
    },
    { key: "description", header: "البيان" },
    {
      key: "accountCode",
      header: "الحساب",
      className: "font-mono text-xs",
      ltr: true,
    },
    {
      key: "debit",
      header: "مدين",
      render: (r) => Number(r.debit) > 0 ? formatCurrency(Number(r.debit)) : "—",
    },
    {
      key: "credit",
      header: "دائن",
      render: (r) => Number(r.credit) > 0 ? formatCurrency(Number(r.credit)) : "—",
    },
  ];

  const ledgerRows = data?.data ?? [];

  return (
    <>
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">نوع الكيان</label>
            <SearchableSelect
              options={ENTITY_TYPES}
              value={entityType}
              onValueChange={(v) => {
                setEntityType(v);
                setEntityId("");
              }}
              placeholder="اختر النوع..."
              searchPlaceholder="—"
              emptyText="—"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">الكيان</label>
            {picker}
          </div>
        </CardContent>
      </Card>

      {enabled && (
        <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
          {data && (
            <div className="grid grid-cols-2 gap-3">
              <SummaryCard label="مجموع المدين" value={data.totalDebit ?? 0} tone="info" />
              <SummaryCard label="مجموع الدائن" value={data.totalCredit ?? 0} tone="info" />
            </div>
          )}
          <DataTable
            columns={columns}
            data={ledgerRows}
            rowKey={(r) => `${r.journalId}-${r.accountCode}`}
            emptyMessage="لا توجد حركات على الحساب الفرعي خلال الفترة"
          />
        </PageStateWrapper>
      )}
    </>
  );
}

interface CostCenterRow {
  costCenter: string;
  entryCount: number;
  totalDebit: number | string;
  totalCredit: number | string;
  totalExpenses: number | string;
  totalRevenue: number | string;
}

interface CostCenterReport {
  data: CostCenterRow[];
  details: any[];
  total: number;
}

function CostCenterReportTab({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [filterCC, setFilterCC] = useState("");
  const params = new URLSearchParams({ startDate, endDate });
  if (filterCC) params.set("costCenter", filterCC);
  const { data, isLoading, error, refetch } = useApiQuery<CostCenterReport>(
    ["finance-cost-center-report", String(params)],
    `/finance/cost-center-report?${params}`,
  );

  const rows = data?.data ?? [];

  const columns: DataTableColumn<CostCenterRow>[] = [
    {
      key: "costCenter",
      header: "مركز التكلفة",
      className: "font-medium",
      render: (r) => (
        <button
          onClick={() => setFilterCC(filterCC === r.costCenter ? "" : r.costCenter)}
          className="text-status-info-foreground hover:underline"
        >
          {r.costCenter}
        </button>
      ),
    },
    {
      key: "entryCount",
      header: "عدد القيود",
      render: (r) => <Badge variant="outline">{r.entryCount}</Badge>,
    },
    {
      key: "totalExpenses",
      header: "إجمالي المصروفات",
      render: (r) => (
        <span className="text-status-error-foreground font-semibold">
          {formatCurrency(Number(r.totalExpenses))}
        </span>
      ),
    },
    {
      key: "totalRevenue",
      header: "إجمالي الإيرادات",
      render: (r) => (
        <span className="text-status-success-foreground font-semibold">
          {formatCurrency(Number(r.totalRevenue))}
        </span>
      ),
    },
    {
      key: "net",
      header: "صافي",
      render: (r) => {
        const net = Number(r.totalRevenue) - Number(r.totalExpenses);
        return (
          <span
            className={
              net >= 0
                ? "text-status-success-foreground font-semibold"
                : "text-status-error-foreground font-semibold"
            }
          >
            {formatCurrency(net)}
          </span>
        );
      },
    },
  ];

  const detailColumns: DataTableColumn<any>[] = [
    { key: "date", header: "التاريخ", render: (r) => formatDateAr(r.date) },
    {
      key: "ref",
      header: "المرجع",
      className: "font-mono text-xs",
      ltr: true,
    },
    { key: "description", header: "البيان" },
    {
      key: "debit",
      header: "مدين",
      render: (r) => Number(r.debit) > 0 ? formatCurrency(Number(r.debit)) : "—",
    },
    {
      key: "credit",
      header: "دائن",
      render: (r) => Number(r.credit) > 0 ? formatCurrency(Number(r.credit)) : "—",
    },
  ];

  return (
    <PageStateWrapper isLoading={isLoading} error={error} onRetry={() => refetch()}>
      {filterCC && (
        <Card className="border-status-info-surface">
          <CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm">
              مفلتر حسب: <strong>{filterCC}</strong>
            </span>
            <button
              onClick={() => setFilterCC("")}
              className="text-xs text-status-info-foreground hover:underline"
            >
              إزالة الفلتر
            </button>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={rows}
        rowKey={(r) => r.costCenter}
        emptyMessage="لا توجد قيود تحمل مركز تكلفة خلال الفترة"
      />

      {filterCC && (data?.details?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              تفاصيل القيود — {filterCC}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={detailColumns}
              data={data?.details ?? []}
              rowKey={(r) => r.id}
              emptyMessage="—"
            />
          </CardContent>
        </Card>
      )}
    </PageStateWrapper>
  );
}
