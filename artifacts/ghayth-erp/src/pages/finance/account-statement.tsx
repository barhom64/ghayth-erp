/**
 * Shared base for entity-scoped statement views. Re-exported as the
 * default by two thin wrappers in this folder:
 *
 *   customer-statement.tsx → <AccountStatementPage entityType="customer">
 *                            mounted at /clients/:id/statement
 *   vendor-statement.tsx   → <AccountStatementPage entityType="vendor">
 *                            mounted at /finance/vendors/:id/statement
 *
 * This file is NOT registered in any route file because the wrappers
 * are what bind to URLs. Conflict #2 in
 * `docs/audit/GHAITH_SYSTEM_GAP_MATRIX.md` flagged it as "dead" vs
 * "keep". Resolved here as **keep** — the wrappers depend on it.
 */
import { useState } from "react";
import { exportRowsToCsv } from "@/lib/unified-export";
import { useRoute, useLocation } from "wouter";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";
import { Download, FileSpreadsheet } from "lucide-react";

import { FinanceTabsNav } from "@/components/shared/finance-tabs-nav";
import { DateRangePresets } from "@/components/shared/date-range-presets";
interface Movement {
  id: number;
  ref: string;
  date: string;
  debit: number | string;
  credit: number | string;
  dueDate: string | null;
  status: string | null;
  movementType: string;
  description: string;
  runningBalance: number | string;
}

interface AgingBuckets {
  current: number;
  "1-30": number;
  "31-60": number;
  "61-90": number;
  "90+": number;
  total: number;
}

interface StatementResponse {
  client?: { id: number; name: string; phone?: string; email?: string; taxNumber?: string };
  supplier?: { id: number; name: string; phone?: string; email?: string; taxNumber?: string };
  period: { from: string; to: string };
  openingBalance: number;
  movements: Movement[];
  endingBalance: number;
  totals: { totalDebit: number; totalCredit: number; movementCount: number };
  aging: AgingBuckets;
}

function csvEscape(val: string) {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function exportCSV(name: string, period: { from: string; to: string }, movements: Movement[]) {
  const headers = ["التاريخ", "المرجع", "النوع", "البيان", "مدين", "دائن", "الرصيد"];
  const rows = movements.map((m) => [
    csvEscape(String(m.date).slice(0, 10)),
    csvEscape(m.ref ?? ""),
    csvEscape(m.movementType ?? ""),
    csvEscape(m.description ?? ""),
    Number(m.debit).toFixed(2),
    Number(m.credit).toFixed(2),
    Number(m.runningBalance).toFixed(2),
  ]);
  // GAP_MATRIX item #7 — was a local Blob+createObjectURL builder.
  // Routed through unified export helper for audit + letterhead.
  void exportRowsToCsv({
    entityType: "report_account_statement",
    title: String(`${name}-${period.from}-to-${period.to}.csv`).replace(/\.csv$/i, ""),
    rows: rows.map((row: any) => Object.fromEntries(headers.map((h: string, i: number) => [h, Array.isArray(row) ? row[i] : (row?.[h] ?? "")]))),
    columns: headers.map((h: string) => ({ key: h, label: h })),
  }).catch((err) => console.error("[export] failed", err));
}

interface Props {
  entityType: "customer" | "vendor";
}

export default function AccountStatementPage({ entityType }: Props) {
  // Both route patterns must be matched unconditionally — calling useRoute
  // inside a ternary is a rules-of-hooks violation (can surface as React
  // "rendered more/fewer hooks" #310/#300 under future renderers).
  const [customerMatch, customerParams] = useRoute("/clients/:id/statement");
  const [, vendorParams] = useRoute("/finance/vendors/:id/statement");
  const params = customerMatch ? customerParams : vendorParams;
  const id = params?.id;
  const [, navigate] = useLocation();

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3); // utc-ok: UI default range only; user picker is authoritative
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(todayLocal());

  const endpoint = entityType === "customer"
    ? `/finance/reports/customer-statement/${id}?startDate=${startDate}&endDate=${endDate}`
    : `/finance/reports/vendor-statement/${id}?startDate=${startDate}&endDate=${endDate}`;

  const queryKey = entityType === "customer"
    ? ["customer-statement", id ?? "", startDate, endDate]
    : ["vendor-statement", id ?? "", startDate, endDate];

  const { data, isLoading, isError, refetch } = useApiQuery<StatementResponse>(
    queryKey, id ? endpoint : null, !!id,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) return <ErrorState />;

  const entity = data.client ?? data.supplier;
  if (!entity) return <ErrorState />;

  const isVendor = entityType === "vendor";
  const backPath = isVendor ? `/finance/vendors/${id}` : `/clients/${id}`;
  const labelDebit = isVendor ? "مدفوع (مدين)" : "فاتورة (مدين)";
  const labelCredit = isVendor ? "أمر شراء (دائن)" : "تحصيل (دائن)";

  const cols: DataTableColumn<Movement>[] = [
    { key: "date", header: "التاريخ",
      render: (r) => <span className="text-xs">{r.date ? formatDateAr(r.date) : "—"}</span> },
    { key: "ref", header: "المرجع",
      render: (r) => <span className="font-mono text-xs">{r.ref || "—"}</span> },
    { key: "movementType", header: "النوع",
      render: (r) => (
        <Badge variant="outline" className="text-xs">
          {r.movementType === "purchase_order" ? "أمر شراء" :
           r.movementType === "voucher_payment" ? "دفعة" :
           r.movementType === "invoice" ? "فاتورة" :
           r.movementType === "payment" ? "تحصيل" :
           r.movementType}
        </Badge>
      ),
    },
    { key: "description", header: "البيان",
      render: (r) => <span className="text-xs">{r.description || "—"}</span> },
    { key: "debit", header: "مدين",
      render: (r) => Number(r.debit) > 0
        ? <span className="font-mono text-orange-700">{formatCurrency(Number(r.debit))}</span>
        : <span className="text-muted-foreground">—</span> },
    { key: "credit", header: "دائن",
      render: (r) => Number(r.credit) > 0
        ? <span className="font-mono text-emerald-700">{formatCurrency(Number(r.credit))}</span>
        : <span className="text-muted-foreground">—</span> },
    { key: "runningBalance", header: "الرصيد",
      render: (r) => <span className="font-mono font-bold">{formatCurrency(Number(r.runningBalance))}</span> },
  ];

  return (
    <PageShell
      title={`كشف حساب — ${entity.name}`}
      subtitle={`من ${data.period.from} إلى ${data.period.to}`}
      breadcrumbs={[
        { href: "/finance", label: "المالية" },
        { href: isVendor ? "/finance/vendors" : "/clients",
          label: isVendor ? "الموردون" : "العملاء" },
        { href: backPath, label: entity.name },
        { label: "كشف حساب" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <GuardedButton
            perm="finance:export" variant="outline" size="sm"
            onClick={() => exportCSV(entity.name, data.period, data.movements)}
          >
            <Download className="h-3.5 w-3.5 me-1" /> تصدير CSV
          </GuardedButton>
          <PrintButton
            entityType={entityType === "customer" ? "customer_statement" : "vendor_statement"}
            entityId={`${id ?? ""}:${startDate ?? ""}..${endDate ?? ""}`}
           
          />
        </div>
      }
    >
      <FinanceTabsNav />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="md:col-span-2 flex flex-col gap-2">
          <DateRangePresets
            value={{ from: startDate, to: endDate }}
            onChange={(r) => { setStartDate(r.from); setEndDate(r.to); }}
            testidPrefix="account-statement-preset"
            hideAllTime
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} dir="ltr" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} dir="ltr" />
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>تحديث</Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">رصيد افتتاحي</p>
            <p className="text-lg font-bold font-mono">{formatCurrency(data.openingBalance)}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{labelDebit}</p>
            <p className="text-lg font-bold font-mono text-orange-700">{formatCurrency(data.totals.totalDebit)}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">{labelCredit}</p>
            <p className="text-lg font-bold font-mono text-emerald-700">{formatCurrency(data.totals.totalCredit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">عدد الحركات</p>
            <p className="text-lg font-bold font-mono">{data.totals.movementCount}</p>
          </CardContent>
        </Card>
        <Card className={data.endingBalance >= 0 ? "border-orange-300" : "border-emerald-300"}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">رصيد ختامي</p>
            <p className={`text-lg font-bold font-mono ${data.endingBalance >= 0 ? "text-orange-700" : "text-emerald-700"}`}>
              {formatCurrency(data.endingBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            تقادم الأرصدة المفتوحة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
            <div className="p-2 rounded bg-emerald-50 text-emerald-800 text-center">
              <p className="opacity-70">جاري</p>
              <p className="font-mono font-bold">{formatCurrency(data.aging.current)}</p>
            </div>
            <div className="p-2 rounded bg-status-warning-surface text-yellow-800 text-center">
              <p className="opacity-70">1-30 يوم</p>
              <p className="font-mono font-bold">{formatCurrency(data.aging["1-30"])}</p>
            </div>
            <div className="p-2 rounded bg-orange-50 text-orange-800 text-center">
              <p className="opacity-70">31-60 يوم</p>
              <p className="font-mono font-bold">{formatCurrency(data.aging["31-60"])}</p>
            </div>
            <div className="p-2 rounded bg-status-error-surface text-status-error-foreground text-center">
              <p className="opacity-70">61-90 يوم</p>
              <p className="font-mono font-bold">{formatCurrency(data.aging["61-90"])}</p>
            </div>
            <div className="p-2 rounded bg-red-100 text-red-900 text-center">
              <p className="opacity-70">+90 يوم</p>
              <p className="font-mono font-bold">{formatCurrency(data.aging["90+"])}</p>
            </div>
            <div className="p-2 rounded bg-muted text-center font-bold">
              <p className="opacity-70">الإجمالي</p>
              <p className="font-mono">{formatCurrency(data.aging.total)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الحركات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols}
            data={data.movements}
            pageSize={50}
            emptyMessage="لا توجد حركات في هذه الفترة"
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
