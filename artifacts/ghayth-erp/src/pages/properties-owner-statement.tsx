import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { formatCurrency, formatDateAr, todayLocal } from "@/lib/formatters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import {
  Receipt, TrendingUp, TrendingDown, Wallet, AlertTriangle,
  Wrench, Crown, FileText, Calendar,
} from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

interface OwnerOption {
  id: number;
  name: string;
  phone?: string;
  unitCount?: number | string;
}

interface RentRow {
  unitId: number;
  unitNumber: string;
  buildingName: string | null;
  contractId: number;
  contractNumber: string | null;
  tenantName: string;
  totalDue: string | number;
  totalCollected: string | number;
  outstanding: string | number;
}

interface OutstandingRow {
  id: number;
  contractId: number;
  dueDate: string;
  amount: string | number;
  paidAmount: string | number;
  outstanding: string | number;
  daysPastDue: number | string;
  unitNumber: string;
  buildingName: string | null;
  tenantName: string;
}

interface MaintRow {
  id: number;
  category: string | null;
  description: string;
  actualCost: string | number | null;
  estimatedCost: string | number | null;
  completedAt: string | null;
  status: string;
  unitId: number;
  unitNumber: string;
  buildingName: string | null;
}

interface OwnerStatement {
  owner: {
    id: number;
    name: string;
    nationalId?: string;
    crNumber?: string;
    iban?: string;
    bankName?: string;
    authorizationNumber?: string;
    authorizationExpiry?: string;
  };
  period: { from: string; to: string };
  commission: { rate: number; amount: number };
  summary: {
    totalRentDue: number;
    totalRentCollected: number;
    totalRentOutstanding: number;
    totalMaintenance: number;
    commissionAmount: number;
    netDueToOwner: number;
    unitsCount: number;
    outstandingPaymentsCount: number;
    maintenanceCount: number;
  };
  rentByUnit: RentRow[];
  outstandingPayments: OutstandingRow[];
  maintenance: MaintRow[];
}

function firstOfMonth(): string {
  return `${todayLocal().slice(0, 7)}-01`;
}

export default function PropertiesOwnerStatement() {
  const [ownerId, setOwnerId] = useState<string>("");
  const [from, setFrom] = useState<string>(firstOfMonth());
  const [to, setTo] = useState<string>(todayLocal());
  const [commissionOverride, setCommissionOverride] = useState<string>("");

  const { data: ownersResp } = useApiQuery<{ data: OwnerOption[] } | OwnerOption[]>(
    ["property-owners-picker"],
    "/properties/owners?limit=500",
  );
  const owners: OwnerOption[] = Array.isArray(ownersResp)
    ? ownersResp
    : (ownersResp?.data ?? []);

  const queryUrl = ownerId
    ? `/properties/owners/${ownerId}/statement?from=${from}&to=${to}${commissionOverride ? `&commissionRate=${commissionOverride}` : ""}`
    : null;

  const { data, isLoading, isError, error, refetch } = useApiQuery<OwnerStatement>(
    ["owner-statement", ownerId, from, to, commissionOverride],
    queryUrl,
  );

  const rentColumns: DataTableColumn<RentRow>[] = [
    { key: "unitNumber", header: "الوحدة", sortable: true,
      render: (r) => (
        <span>
          <span className="font-medium">{r.unitNumber}</span>
          {r.buildingName && <span className="text-muted-foreground"> — {r.buildingName}</span>}
        </span>
      ) },
    { key: "tenantName", header: "المستأجر", render: (r) => r.tenantName },
    { key: "contractNumber", header: "رقم العقد", render: (r) => r.contractNumber || "-" },
    { key: "totalDue", header: "المستحق", sortable: true,
      render: (r) => formatCurrency(Number(r.totalDue)) },
    { key: "totalCollected", header: "المُحصَّل", sortable: true,
      render: (r) => <span className="text-green-700 font-medium">{formatCurrency(Number(r.totalCollected))}</span> },
    { key: "outstanding", header: "المتبقي", sortable: true,
      render: (r) => {
        const v = Number(r.outstanding);
        return v > 0 ? <span className="text-red-700 font-medium">{formatCurrency(v)}</span> : <span className="text-muted-foreground">—</span>;
      } },
  ];

  const outstandingColumns: DataTableColumn<OutstandingRow>[] = [
    { key: "unitNumber", header: "الوحدة",
      render: (r) => <span className="font-medium">{r.unitNumber}</span> },
    { key: "tenantName", header: "المستأجر" },
    { key: "dueDate", header: "تاريخ الاستحقاق", render: (r) => formatDateAr(r.dueDate) },
    { key: "daysPastDue", header: "أيام التأخر", sortable: true,
      render: (r) => {
        const d = Number(r.daysPastDue);
        if (d <= 0) return <span className="text-muted-foreground">-</span>;
        const cls = d > 30 ? "text-red-700 font-bold" : d > 14 ? "text-orange-700 font-medium" : "text-amber-700";
        return <span className={cls}>{d} يوم</span>;
      } },
    { key: "outstanding", header: "المتبقي", sortable: true,
      render: (r) => <span className="text-red-700 font-medium">{formatCurrency(Number(r.outstanding))}</span> },
  ];

  const maintColumns: DataTableColumn<MaintRow>[] = [
    { key: "unitNumber", header: "الوحدة",
      render: (r) => <span className="font-medium">{r.unitNumber}</span> },
    { key: "category", header: "النوع", render: (r) => r.category || "-" },
    { key: "description", header: "الوصف",
      render: (r) => <span className="line-clamp-1">{r.description}</span> },
    { key: "completedAt", header: "تاريخ الإنجاز",
      render: (r) => r.completedAt ? formatDateAr(r.completedAt) : "-" },
    { key: "actualCost", header: "التكلفة",
      render: (r) => formatCurrency(Number(r.actualCost || 0)) },
  ];

  const summary = data?.summary;

  return (
    <PageShell
      title="كشف حساب المالك"
      subtitle="إيرادات + مصاريف + عمولة الإدارة + الصافي المستحق للمالك"
      breadcrumbs={[
        { label: "الرئيسية", href: "/" },
        { label: "العقارات", href: "/properties/dashboard" },
        { label: "كشف حساب المالك" },
      ]}
    >
      <Card className="mb-6">
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <Label>المالك</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر مالكاً" />
                </SelectTrigger>
                <SelectContent>
                  {owners.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">لا يوجد ملاك</div>
                  ) : owners.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}{o.unitCount ? ` (${o.unitCount} وحدة)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>من</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>إلى</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div>
              <Label>نسبة العمولة % (اختياري)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="افتراضي من الإعدادات"
                value={commissionOverride}
                onChange={(e) => setCommissionOverride(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {!ownerId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            اختر مالكاً لعرض كشف الحساب
          </CardContent>
        </Card>
      )}

      {ownerId && isLoading && <LoadingSpinner />}
      {ownerId && isError && <ErrorState error={error} onRetry={refetch} />}

      {ownerId && data && summary && (
        <>
          <Card className="mb-4 border-2 border-green-200 bg-green-50">
            <CardContent className="py-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Crown className="h-4 w-4" /> {data.owner.name}
                  </div>
                  {data.owner.iban && (
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      IBAN: {data.owner.iban}
                      {data.owner.bankName && <span> — {data.owner.bankName}</span>}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground mt-1">
                    <Calendar className="inline h-3 w-3 ml-1" />
                    {formatDateAr(data.period.from)} → {formatDateAr(data.period.to)}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-sm text-muted-foreground">الصافي المستحق للمالك</div>
                  <div className={`text-5xl font-bold ${summary.netDueToOwner >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {formatCurrency(summary.netDueToOwner)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
                  <TrendingUp className="h-3 w-3" /> المستحق
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{formatCurrency(summary.totalRentDue)}</div>
                <div className="text-xs text-muted-foreground">{summary.unitsCount} وحدة</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
                  <Wallet className="h-3 w-3 text-green-600" /> المُحصَّل
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-green-700">{formatCurrency(summary.totalRentCollected)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-amber-600" /> المتأخرات
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-amber-700">{formatCurrency(summary.totalRentOutstanding)}</div>
                <div className="text-xs text-muted-foreground">{summary.outstandingPaymentsCount} دفعة</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs flex items-center gap-1 text-muted-foreground">
                  <Wrench className="h-3 w-3 text-orange-600" /> الصيانة
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-orange-700">{formatCurrency(summary.totalMaintenance)}</div>
                <div className="text-xs text-muted-foreground">{summary.maintenanceCount} عملية</div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-4">
            <CardContent className="py-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">إجمالي التحصيل</span>
                  <span className="font-medium">{formatCurrency(summary.totalRentCollected)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">- مصاريف صيانة</span>
                  <span className="font-medium text-orange-700">{formatCurrency(summary.totalMaintenance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">- عمولة إدارة ({data.commission.rate}%)</span>
                  <span className="font-medium text-blue-700">{formatCurrency(data.commission.amount)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Receipt className="h-4 w-4" /> الإيجارات حسب الوحدة ({data.rentByUnit.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable data={data.rentByUnit} columns={rentColumns} emptyMessage="لا توجد إيجارات في الفترة" />
            </CardContent>
          </Card>

          {data.outstandingPayments.length > 0 && (
            <Card className="mb-4 border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-red-800">
                  <AlertTriangle className="h-4 w-4" /> دفعات متأخرة ({data.outstandingPayments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable data={data.outstandingPayments} columns={outstandingColumns} />
              </CardContent>
            </Card>
          )}

          {data.maintenance.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wrench className="h-4 w-4" /> مصاريف الصيانة ({data.maintenance.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable data={data.maintenance} columns={maintColumns} />
              </CardContent>
            </Card>
          )}

          <div className="mt-6 text-xs text-muted-foreground bg-muted/30 p-4 rounded-md flex items-start gap-2">
            <FileText className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold mb-1">طريقة الحساب</div>
              <ul className="list-disc pr-4 space-y-0.5">
                <li>التحصيل = مجموع <code>paidAmount</code> من <code>rent_payments</code> ضمن الفترة على وحدات المالك.</li>
                <li>الصيانة = مجموع <code>actualCost</code> من طلبات الصيانة المُنجزة في الفترة على وحدات المالك.</li>
                <li>العمولة = نسبة من إجمالي المُحصَّل (أولوية: query &gt; إعدادات الشركة &gt; 5%).</li>
                <li>الصافي = التحصيل - الصيانة - العمولة.</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </PageShell>
  );
}
