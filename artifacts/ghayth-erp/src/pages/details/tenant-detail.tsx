import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageStatusBadge } from "@/components/page-status-badge";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import {
  Users2, ArrowRight, Phone, Mail, CreditCard, FileText,
  Banknote, CheckCircle, AlertTriangle, Building2, Home, Clock
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/page-shell";

const TABS = [
  { key: "overview", label: "نظرة عامة", icon: Users2 },
  { key: "contracts", label: "العقود", icon: FileText },
  { key: "payments", label: "المدفوعات", icon: Banknote },
  { key: "documents", label: "المستندات", icon: CreditCard },
  { key: "timeline", label: "السجل الزمني", icon: Clock },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function TenantDetail() {
  const [, params] = useRoute("/properties/tenants/:id");
  const id = params?.id;
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const { data: tenant, isLoading, isError } = useApiQuery<any>(
    ["tenant-detail", id || ""],
    `/properties/tenants/${id}`,
    !!id
  );

  if (isLoading) return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-40" />
      <Skeleton className="h-64" />
    </div>
  );

  if (isError || !tenant) return (
    <div className="text-center py-12">
      <Users2 className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-gray-500">المستأجر غير موجود</p>
      <Link href="/properties/tenants"><Button variant="outline" className="mt-4">العودة للمستأجرين</Button></Link>
    </div>
  );

  const contracts = tenant.contracts || [];
  const payments = tenant.payments || [];
  const activeContract = contracts.find((c: any) => c.status === "active");
  const totalPaid = payments.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.paidAmount || 0), 0);
  const overduePayments = payments.filter((p: any) => p.status !== "paid" && new Date(p.dueDate) < new Date());

  const subtitleBits = [tenant.phone, tenant.email].filter(Boolean).join(" • ");

  return (
    <PageShell
      title={tenant.name || "المستأجر"}
      subtitle={subtitleBits || undefined}
      loading={isLoading}
      breadcrumbs={[{ href: "/properties", label: "العقارات" }, { href: "/properties/tenants", label: "المستأجرون" }]}
      actions={
        <div className="flex items-center gap-2">
          {activeContract && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">مستأجر نشط</Badge>
          )}
          <Link href="/properties/tenants">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 me-1" />
              العودة
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">رقم الهوية</p>
            <p className="font-bold font-mono">{tenant.nationalId || "—"}</p>
            {tenant.nationality && <p className="text-xs text-gray-400">{tenant.nationality}</p>}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">إجمالي العقود</p>
            <p className="font-bold text-lg">{contracts.length}</p>
            {activeContract && <p className="text-xs text-emerald-500">عقد ساري</p>}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">إجمالي المدفوعات</p>
            <p className="font-bold text-lg text-emerald-600">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className={cn("border-0 shadow-sm", overduePayments.length > 0 ? "bg-red-50/50" : "")}>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">المتأخرات</p>
            <p className={cn("font-bold text-lg", overduePayments.length > 0 ? "text-red-600" : "text-gray-500")}>
              {formatCurrency(overduePayments.reduce((s: number, p: any) => s + Number(p.amount || 0) - Number(p.paidAmount || 0), 0))}
            </p>
            {overduePayments.length > 0 && <p className="text-xs text-red-500">{overduePayments.length} دفعة</p>}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto pb-px">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
              activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">البيانات الشخصية</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {tenant.name && <div><p className="text-xs text-gray-500">الاسم</p><p className="font-medium">{tenant.name}</p></div>}
                {tenant.phone && <div><p className="text-xs text-gray-500">الهاتف</p><p className="font-medium">{tenant.phone}</p></div>}
                {tenant.email && <div><p className="text-xs text-gray-500">البريد الإلكتروني</p><p className="font-medium">{tenant.email}</p></div>}
                {tenant.nationalId && <div><p className="text-xs text-gray-500">رقم الهوية / الإقامة</p><p className="font-medium font-mono">{tenant.nationalId}</p></div>}
                {tenant.nationality && <div><p className="text-xs text-gray-500">الجنسية</p><p className="font-medium">{tenant.nationality}</p></div>}
              </div>
            </CardContent>
          </Card>

          {activeContract && (
            <Card className="border-0 shadow-sm bg-emerald-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-emerald-700">
                  <Home className="h-4 w-4" /> الوحدة الحالية
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-xs text-gray-500">الوحدة</p><p className="font-medium">{activeContract.unitNumber} {activeContract.buildingName ? `- ${activeContract.buildingName}` : ""}</p></div>
                  <div><p className="text-xs text-gray-500">الإيجار</p><p className="font-medium text-emerald-600">{formatCurrency(Number(activeContract.monthlyRent || 0))}</p></div>
                  <div><p className="text-xs text-gray-500">من</p><p className="font-medium">{formatDateAr(activeContract.startDate)}</p></div>
                  <div><p className="text-xs text-gray-500">إلى</p><p className="font-medium">{formatDateAr(activeContract.endDate)}</p></div>
                </div>
              </CardContent>
            </Card>
          )}

          {overduePayments.length > 0 && (
            <Card className="border-red-200 bg-red-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" /> دفعات متأخرة ({overduePayments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-red-50">
                    <th className="p-2 text-right text-xs">الوحدة</th>
                    <th className="p-2 text-right text-xs">الاستحقاق</th>
                    <th className="p-2 text-right text-xs">المبلغ</th>
                  </tr></thead>
                  <tbody>
                    {overduePayments.slice(0, 5).map((p: any) => (
                      <tr key={p.id} className="border-b">
                        <td className="p-2 text-xs">{p.unitNumber || "—"}</td>
                        <td className="p-2 text-xs text-red-600">{formatDateAr(p.dueDate)}</td>
                        <td className="p-2 text-xs font-bold">{formatCurrency(Number(p.amount || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "contracts" && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> تاريخ العقود ({contracts.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {contracts.length === 0 ? (
              <p className="text-center text-gray-400 py-8">لا توجد عقود</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50">
                  <th className="p-3 text-start">الوحدة</th>
                  <th className="p-3 text-start">من</th>
                  <th className="p-3 text-start">إلى</th>
                  <th className="p-3 text-start">الإيجار</th>
                  <th className="p-3 text-start">الحالة</th>
                </tr></thead>
                <tbody>
                  {contracts.map((c: any) => (
                    <tr key={c.id} className={cn("border-b hover:bg-gray-50", c.status === "active" && "bg-blue-50/30")}>
                      <td className="p-3">
                        <p className="font-medium">{c.unitNumber}</p>
                        {c.buildingName && <p className="text-xs text-gray-400">{c.buildingName}</p>}
                      </td>
                      <td className="p-3 text-gray-500">{formatDateAr(c.startDate)}</td>
                      <td className="p-3 text-gray-500">{formatDateAr(c.endDate)}</td>
                      <td className="p-3 font-bold">{formatCurrency(Number(c.monthlyRent || 0))}</td>
                      <td className="p-3"><PageStatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "payments" && (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Banknote className="h-4 w-4" /> سجل المدفوعات ({payments.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <p className="text-center text-gray-400 py-8">لا توجد مدفوعات</p>
            ) : (
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-gray-50">
                  <th className="p-3 text-start">الوحدة</th>
                  <th className="p-3 text-start">الاستحقاق</th>
                  <th className="p-3 text-start">المبلغ</th>
                  <th className="p-3 text-start">المدفوع</th>
                  <th className="p-3 text-start">الحالة</th>
                </tr></thead>
                <tbody>
                  {payments.map((p: any) => (
                    <tr key={p.id} className={cn("border-b hover:bg-gray-50", p.status !== "paid" && new Date(p.dueDate) < new Date() ? "bg-red-50/30" : "")}>
                      <td className="p-3">{p.unitNumber || "—"}</td>
                      <td className="p-3 text-gray-500">{formatDateAr(p.dueDate)}</td>
                      <td className="p-3 font-bold">{formatCurrency(Number(p.amount || 0))}</td>
                      <td className="p-3 text-emerald-600">{formatCurrency(Number(p.paidAmount || 0))}</td>
                      <td className="p-3"><PageStatusBadge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === "documents" && (
        !isNaN(Number(id)) && Number(id) > 0
          ? <EntityDocuments entityType="tenant" entityId={Number(id)} />
          : <div className="text-center py-8 text-gray-400 text-sm">المستندات غير متاحة لمستأجري العقود القديمة</div>
      )}

      {activeTab === "timeline" && (
        !isNaN(Number(id)) && Number(id) > 0
          ? <EntityTimeline entityType="tenant" entityId={Number(id)} />
          : <div className="text-center py-8 text-gray-400 text-sm">السجل الزمني غير متاح لمستأجري العقود القديمة</div>
      )}
    </PageShell>
  );
}
