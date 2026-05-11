/**
 * UmrahClientTab — surfaces the central /umrah/clients/:id/umrah-summary
 * endpoint inside the existing client-detail page. Calls the same
 * useApiQuery hook the other tabs use; nothing else has been added to
 * the client page — this tab is opt-in: it renders only when the client
 * is linked to at least one Umrah sub-agent.
 *
 * The data shape is whatever the route returns (server-side); we don't
 * re-fetch anything else here. Re-uses the same PageStatusBadge,
 * DataTable, and formatCurrency primitives every other Umrah page uses.
 */

import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageStatusBadge } from "@/components/page-status-badge";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Users, Building2, AlertTriangle, FileText, Tag, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryShape {
  client: { id: number; name: string };
  subAgents: Array<{
    id: number; name: string; nuskCode: string | null;
    paymentTerms: string; isActive: boolean;
  }>;
  stats: {
    totalMutamers: number;
    insideKingdom: number;
    overstays: number;
    absconders: number;
  };
  groups: Array<{
    id: number; nuskGroupNumber: string; name: string;
    mutamerCount: number; status: string;
    centralInvoiceId: number | null;
    nuskInvoiceNumber: string | null;
    createdAt: string;
  }>;
  invoices: Array<{
    id: number; ref: string; total: string | number;
    paidAmount: string | number; status: string;
    dueDate: string | null; createdAt: string;
  }>;
  openViolations: Array<{
    id: number; type: string; referenceNumber: string;
    penaltyAmount: string | number; status: string;
  }>;
  currentPrice: {
    pricePerMutamer: string | number;
    validFrom: string;
    validTo: string | null;
  } | null;
}

export function UmrahClientTab({ clientId }: { clientId: number }) {
  const { data, isLoading, isError } = useApiQuery<SummaryShape>(
    ["umrah-client-summary", String(clientId)],
    `/umrah/clients/${clientId}/umrah-summary`
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError || !data) {
    return (
      <div className="text-center text-muted-foreground py-12 text-sm">
        تعذّر تحميل بيانات العمرة لهذا العميل
      </div>
    );
  }
  if (data.subAgents.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Building2 className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="font-medium text-base mb-1">لا توجد وكلاء عمرة مربوطون</h3>
          <p className="text-sm text-muted-foreground mb-4">
            هذا العميل غير مربوط بأي وكيل فرعي في نظام العمرة بعد. اربطه من صفحة الوكلاء الفرعيين.
          </p>
          <Link href="/umrah/sub-agents">
            <a className="text-primary text-sm hover:underline">→ الذهاب إلى الوكلاء الفرعيين</a>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const totalRevenue = data.invoices.reduce((s, i) => s + Number(i.total ?? 0), 0);
  const totalPaid = data.invoices.reduce((s, i) => s + Number(i.paidAmount ?? 0), 0);
  const outstanding = totalRevenue - totalPaid;
  const openPenalty = data.openViolations.reduce((s, v) => s + Number(v.penaltyAmount ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <KpiCard
          icon={Users} color="text-blue-600 bg-blue-50"
          label="إجمالي المعتمرين" value={data.stats.totalMutamers}
        />
        <KpiCard
          icon={Users} color="text-green-600 bg-green-50"
          label="داخل المملكة" value={data.stats.insideKingdom}
        />
        <KpiCard
          icon={AlertTriangle} color="text-orange-600 bg-orange-50"
          label="متجاوزون" value={data.stats.overstays}
        />
        <KpiCard
          icon={ShieldAlert} color="text-red-600 bg-red-50"
          label="متغيّبون" value={data.stats.absconders}
        />
      </div>

      {/* Financial summary */}
      <div className="grid gap-3 grid-cols-1 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">إجمالي المفوتر</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">المسدّد</p>
            <p className="text-xl font-bold mt-1 text-green-600">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">الرصيد المتبقي</p>
            <p className={cn("text-xl font-bold mt-1", outstanding > 0 ? "text-orange-600" : "text-muted-foreground")}>
              {formatCurrency(outstanding)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Current price */}
      {data.currentPrice && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
            <Tag className="w-4 h-4" />السعر الساري حاليًا
          </CardTitle></CardHeader>
          <CardContent className="text-sm">
            <div className="flex items-center justify-between">
              <span className="font-bold text-primary text-lg">
                {formatCurrency(Number(data.currentPrice.pricePerMutamer))} <span className="text-xs text-muted-foreground">/ معتمر</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateAr(data.currentPrice.validFrom)} → {data.currentPrice.validTo ? formatDateAr(data.currentPrice.validTo) : "مفتوح"}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sub-agents */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">الوكلاء الفرعيون المرتبطون</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.subAgents.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b pb-2 last:border-0">
                <div>
                  <p className="font-medium text-sm">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.nuskCode ? `كود ${s.nuskCode}` : "—"} • {s.paymentTerms}
                  </p>
                </div>
                <PageStatusBadge status={s.isActive ? "active" : "inactive"} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent groups */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">المجموعات الأخيرة ({data.groups.length})</CardTitle></CardHeader>
        <CardContent>
          {data.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">لا توجد مجموعات بعد</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-right py-1">رقم المجموعة</th>
                  <th className="text-right py-1">المعتمرين</th>
                  <th className="text-right py-1">فاتورة نسك</th>
                  <th className="text-right py-1">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.groups.slice(0, 10).map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="py-1 font-mono">{g.nuskGroupNumber}</td>
                    <td className="py-1">{g.mutamerCount}</td>
                    <td className="py-1 font-mono">{g.nuskInvoiceNumber ?? "—"}</td>
                    <td className="py-1"><PageStatusBadge status={g.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Recent invoices */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" />فواتير المبيعات
        </CardTitle></CardHeader>
        <CardContent>
          {data.invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">لا توجد فواتير بعد</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-right py-1">المرجع</th>
                  <th className="text-right py-1">الإجمالي</th>
                  <th className="text-right py-1">المسدّد</th>
                  <th className="text-right py-1">الاستحقاق</th>
                  <th className="text-right py-1">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.slice(0, 10).map((inv) => (
                  <tr key={inv.id} className="border-t">
                    <td className="py-1 font-mono">{inv.ref}</td>
                    <td className="py-1">{formatCurrency(Number(inv.total))}</td>
                    <td className="py-1 text-green-700">{formatCurrency(Number(inv.paidAmount))}</td>
                    <td className="py-1">{inv.dueDate ? formatDateAr(inv.dueDate) : "—"}</td>
                    <td className="py-1"><PageStatusBadge status={inv.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Open violations */}
      {data.openViolations.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">
            <span className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="w-4 h-4" />مخالفات مفتوحة
            </span>
            <span className="text-xs font-normal">إجمالي الغرامات: {formatCurrency(openPenalty)}</span>
          </CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="text-right py-1">النوع</th>
                  <th className="text-right py-1">المرجع</th>
                  <th className="text-right py-1">الغرامة</th>
                  <th className="text-right py-1">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.openViolations.map((v) => (
                  <tr key={v.id} className="border-t">
                    <td className="py-1">
                      {v.type === "overstay" ? "تجاوز مدة" : v.type === "absconded" ? "متغيّب" : "أخرى"}
                    </td>
                    <td className="py-1 font-mono">{v.referenceNumber}</td>
                    <td className="py-1 font-bold">{formatCurrency(Number(v.penaltyAmount))}</td>
                    <td className="py-1"><PageStatusBadge status={v.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end pt-2 text-xs">
        <Link href={`/umrah/statements/${data.subAgents[0]?.id ?? ""}`}>
          <a className="text-primary hover:underline">→ عرض كشف الحساب الكامل</a>
        </Link>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, color, label, value }: {
  icon: typeof Users; color: string; label: string; value: number;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-3 flex items-center gap-2">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color.split(" ")[1])}>
          <Icon className={cn("w-5 h-5", color.split(" ")[0])} />
        </div>
        <div>
          <p className="text-lg font-bold leading-tight">{value.toLocaleString("ar-SA")}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
