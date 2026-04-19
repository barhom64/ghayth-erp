import { useState, useEffect } from "react";
import { Link, useSearch, useLocation } from "wouter";
import { useApiQuery, asList } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { PageStatusBadge } from "@/components/page-status-badge";
import { AdvancedFilters, useFilters, applyFilters, exportToCSV } from "@/components/shared/advanced-filters";
import { TagFilterSelect, useTagFilter, EntityTags } from "@/components/shared/entity-tags";
import { EntityComments } from "@/components/shared/entity-comments";
import {
  FileText, Plus, ChevronDown, ChevronUp, CalendarDays, Banknote,
  CheckCircle2, Clock, AlertTriangle, RefreshCw, Zap, Droplets, Wifi,
  Shield, Receipt, CreditCard, DollarSign
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { KpiGrid } from "@/components/shared/kpi-card";
import { useAppContext } from "@/contexts/app-context";
import { BulkActionsBar, BulkCheckbox, useBulkSelection } from "@/components/shared/bulk-actions";
import { PageShell } from "@/components/page-shell";

const FREQ_LABELS: Record<string, string> = {
  monthly: "شهري", quarterly: "ربع سنوي", semi_annual: "نصف سنوي", annual: "سنوي",
};
const CONTRACT_TYPE_LABELS: Record<string, string> = {
  residential: "سكني", commercial: "تجاري", industrial: "صناعي",
};
const UTILITY_LABELS: Record<string, string> = {
  tenant: "المستأجر", landlord: "المالك", shared: "مشترك",
};

function PaymentSchedulePanel({ contractId }: { contractId: number }) {
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
  const { data: schedResp, isLoading } = useApiQuery<any>(
    ["contract-schedule", String(contractId)],
    `/properties/contracts/${contractId}/schedule?x=1${scopeSuffix}`
  );
  const schedule = asList(schedResp);


  if (isLoading) return <div className="text-center text-sm text-gray-400 py-4">جاري التحميل...</div>;
  if (!schedule.length) return <div className="text-center text-sm text-gray-400 py-4">لا يوجد جدول دفعات لهذا العقد</div>;

  const totalDue = schedule.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
  const totalPaid = schedule.reduce((s: number, i: any) => s + Number(i.paidAmount || 0), 0);
  const paidCount = schedule.filter((i: any) => i.status === "paid").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 flex-wrap text-xs">
        <Badge variant="outline" className="gap-1">
          <Banknote className="h-3 w-3" /> الإجمالي: {formatCurrency(totalDue)}
        </Badge>
        <Badge className="bg-emerald-100 text-emerald-700 gap-1">
          <CheckCircle2 className="h-3 w-3" /> المدفوع: {formatCurrency(totalPaid)}
        </Badge>
        <Badge className="bg-amber-100 text-amber-700 gap-1">
          <Clock className="h-3 w-3" /> المتبقي: {formatCurrency(totalDue - totalPaid)}
        </Badge>
        <span className="text-gray-400">{paidCount} / {schedule.length} دفعة</span>
      </div>

      <DataTable
        noToolbar
        pageSize={0}
        data={schedule}
        rowKey={(inst) => inst.id}
        rowClassName={(inst) => {
          const isPaid = inst.status === "paid";
          const isOverdue = !isPaid && new Date(inst.dueDate) < new Date();
          return isPaid ? "bg-emerald-50/30" : isOverdue ? "bg-red-50/30" : undefined;
        }}
        columns={[
          { key: "installmentNumber", header: "#", className: "text-xs font-mono", render: (inst) => inst.installmentNumber },
          { key: "dueDate", header: "تاريخ الاستحقاق", className: "text-xs", render: (inst) => formatDateAr(inst.dueDate) },
          { key: "amount", header: "المبلغ", className: "text-xs font-bold", render: (inst) => formatCurrency(inst.amount) },
          { key: "paidAmount", header: "المدفوع", className: "text-xs", render: (inst) => inst.status === "paid" ? formatCurrency(inst.paidAmount) : "—" },
          { key: "paidDate", header: "تاريخ الدفع", className: "text-xs", render: (inst) => inst.paidDate ? formatDateAr(inst.paidDate) : "—" },
          { key: "method", header: "الطريقة", className: "text-xs", render: (inst) => inst.method === "cash" ? "نقدي" : inst.method === "bank_transfer" ? "تحويل" : inst.method === "cheque" ? "شيك" : inst.method || "—" },
          {
            key: "status",
            header: "الحالة",
            render: (inst) => {
              const isPaid = inst.status === "paid";
              const isOverdue = !isPaid && new Date(inst.dueDate) < new Date();
              return isPaid ? (
                <Badge className="bg-emerald-100 text-emerald-700 text-[10px] gap-1 px-1"><CheckCircle2 className="h-2.5 w-2.5" /> مدفوعة</Badge>
              ) : isOverdue ? (
                <Badge className="bg-red-100 text-red-700 text-[10px] gap-1 px-1"><AlertTriangle className="h-2.5 w-2.5" /> متأخرة</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-1 px-1"><Clock className="h-2.5 w-2.5" /> معلقة</Badge>
              );
            },
          },
          {
            key: "action",
            header: "إجراء",
            render: (inst) => {
              const isPaid = inst.status === "paid";
              if (!isPaid) {
                return (
                  <Link href={`/properties/contracts/${contractId}/pay/${inst.id}`}>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1">
                      <CreditCard className="h-3 w-3" /> تسجيل دفع
                    </Button>
                  </Link>
                );
              }
              if (inst.receiptNumber) {
                return (
                  <span className="text-[10px] text-gray-400 flex items-center gap-1"><Receipt className="h-3 w-3" />{inst.receiptNumber}</span>
                );
              }
              return null;
            },
          },
        ]}
      />

    </div>
  );
}

function ContractDetailPanel({ contract }: { contract: any }) {
  const c = contract;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        {c.ejarNumber && (
          <div className="bg-white border rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">رقم إيجار</p>
            <p className="font-bold font-mono text-blue-700">{c.ejarNumber}</p>
          </div>
        )}
        {c.contractType && (
          <div className="bg-white border rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">نوع العقد</p>
            <p className="font-medium">{CONTRACT_TYPE_LABELS[c.contractType] || c.contractType}</p>
          </div>
        )}
        {c.paymentFrequency && (
          <div className="bg-white border rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">دورة السداد</p>
            <p className="font-medium">{FREQ_LABELS[c.paymentFrequency] || c.paymentFrequency}</p>
          </div>
        )}
        {c.annualRent && (
          <div className="bg-white border rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">الإيجار السنوي</p>
            <p className="font-bold text-emerald-700">{formatCurrency(c.annualRent)}</p>
          </div>
        )}
        {c.deposit && Number(c.deposit) > 0 && (
          <div className="bg-white border rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">التأمين</p>
            <p className="font-medium">{formatCurrency(c.deposit)}</p>
          </div>
        )}
        {c.latePenaltyRate && Number(c.latePenaltyRate) > 0 && (
          <div className="bg-white border rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">غرامة التأخير</p>
            <p className="font-medium text-red-600">{c.latePenaltyRate}%</p>
          </div>
        )}
        {c.gracePeriodDays && Number(c.gracePeriodDays) > 0 && (
          <div className="bg-white border rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">فترة السماح</p>
            <p className="font-medium">{c.gracePeriodDays} يوم</p>
          </div>
        )}
        {c.brokerageFee && Number(c.brokerageFee) > 0 && (
          <div className="bg-white border rounded-lg p-3">
            <p className="text-[10px] text-gray-400 mb-0.5">عمولة السعي</p>
            <p className="font-medium">{formatCurrency(c.brokerageFee)}</p>
          </div>
        )}
      </div>

      {(c.electricityResponsibility || c.waterResponsibility || c.gasResponsibility) && (
        <div className="flex flex-wrap gap-3">
          {c.electricityResponsibility && (
            <Badge variant="outline" className="gap-1 text-xs"><Zap className="h-3 w-3 text-yellow-500" /> الكهرباء: {UTILITY_LABELS[c.electricityResponsibility] || c.electricityResponsibility}</Badge>
          )}
          {c.waterResponsibility && (
            <Badge variant="outline" className="gap-1 text-xs"><Droplets className="h-3 w-3 text-blue-500" /> المياه: {UTILITY_LABELS[c.waterResponsibility] || c.waterResponsibility}</Badge>
          )}
          {c.gasResponsibility && (
            <Badge variant="outline" className="gap-1 text-xs">الغاز: {UTILITY_LABELS[c.gasResponsibility] || c.gasResponsibility}</Badge>
          )}
          {c.internetResponsibility && (
            <Badge variant="outline" className="gap-1 text-xs"><Wifi className="h-3 w-3 text-purple-500" /> الإنترنت: {UTILITY_LABELS[c.internetResponsibility] || c.internetResponsibility}</Badge>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-gray-400" />
          <span className="text-xs text-gray-500">التجديد التلقائي:</span>
          <Badge className={c.autoRenewal ? "bg-emerald-100 text-emerald-700 text-[10px]" : "bg-gray-100 text-gray-500 text-[10px]"}>
            {c.autoRenewal ? "مفعّل" : "غير مفعّل"}
          </Badge>
        </div>
        {c.insuranceRequired && (
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">تأمين مطلوب</span>
          </div>
        )}
        {c.earlyTerminationPenalty && Number(c.earlyTerminationPenalty) > 0 && (
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <span className="text-xs text-gray-500">غرامة إنهاء مبكر:</span>
            <span className="text-xs font-bold text-red-600">{formatCurrency(c.earlyTerminationPenalty)}</span>
          </div>
        )}
      </div>

      {c.specialConditions && (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
          <p className="text-xs font-bold text-amber-700 mb-1">شروط خاصة</p>
          <p className="text-xs text-amber-900 whitespace-pre-wrap">{c.specialConditions}</p>
        </div>
      )}
    </div>
  );
}

export default function PropertiesContracts() {
  const [, navigate] = useLocation();
  const { scopeQueryString } = useAppContext();
  const scopeSuffix = scopeQueryString ? `?${scopeQueryString}` : "";
  const { data: contractsResp, isLoading, isError, error, refetch } = useApiQuery<any>(
    ["rental-contracts", scopeQueryString],
    `/properties/contracts${scopeSuffix}`
  );
  const contracts = asList(contractsResp);
  const [filters, setFilters] = useFilters();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { selectedIds, toggle: toggleSelect, toggleAll, clear: clearSelection } = useBulkSelection();
  const searchStr = useSearch();

  useEffect(() => {
    if (!searchStr) return;
    const params = new URLSearchParams(searchStr);
    const idParam = params.get("id");
    if (idParam) {
      const numId = Number(idParam);
      if (!isNaN(numId)) {
        setExpandedId(numId);
        setTimeout(() => {
          document.getElementById(`contract-row-${numId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }
    }
  }, [searchStr]);
  const { tagsList, selectedTag, setSelectedTag, filteredIds: tagFilteredIds } = useTagFilter("contract");

  if (isLoading) return <PageShell title="عقود الإيجار" breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "عقود الإيجار" }]}><LoadingSpinner /></PageShell>;
  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const preFiltered = applyFilters(contracts, filters, {
    searchFields: ["tenantName", "unitNumber", "ejarNumber"] as any,
    statusField: "status" as any,
    dateField: "startDate" as any,
  });
  const filtered = tagFilteredIds ? preFiltered.filter((c: any) => tagFilteredIds.has(c.id)) : preFiltered;

  const columns: DataTableColumn<any>[] = [
    {
      key: "_select",
      header: "",
      width: "32px",
      render: (v) => (
        <span onClick={(ev) => ev.stopPropagation()}>
          <BulkCheckbox checked={selectedIds.has(v.id)} onChange={() => toggleSelect(v.id)} />
        </span>
      ),
    },
    { key: "ejarNumber", header: "رقم إيجار", sortable: true, className: "font-mono text-xs text-blue-700", render: (c) => c.ejarNumber || "—" },
    { key: "unitNumber", header: "الوحدة", sortable: true, render: (c) => `${c.unitNumber}${c.buildingName ? ` - ${c.buildingName}` : ""}` },
    { key: "tenantName", header: "المستأجر", sortable: true, className: "font-medium" },
    { key: "startDate", header: "من", sortable: true, className: "text-xs", render: (c) => formatDateAr(c.startDate) },
    { key: "endDate", header: "إلى", sortable: true, className: "text-xs", render: (c) => formatDateAr(c.endDate) },
    { key: "monthlyRent", header: "الإيجار", sortable: true, className: "font-bold", render: (c) => formatCurrency(c.monthlyRent || 0) },
    { key: "paymentFrequency", header: "الدورة", sortable: true, className: "text-xs", render: (c) => FREQ_LABELS[c.paymentFrequency] || "—" },
    { key: "status", header: "الحالة", sortable: true, render: (c) => <PageStatusBadge status={c.status} /> },
    {
      key: "details",
      header: "تفاصيل",
      render: (c) => (
        <button
          className="text-gray-400 hover:text-gray-600 p-1"
          onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === c.id ? null : c.id); }}
        >
          {expandedId === c.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ),
    },
  ];

  return (
    <PageShell
      title="عقود الإيجار"
      subtitle="إدارة وتتبع جميع عقود الإيجار — متوافق مع إيجار"
      breadcrumbs={[{ href: "/properties/dashboard", label: "إدارة الأملاك" }, { label: "عقود الإيجار" }]}
      actions={
        <Link href="/properties/contracts/create">
          <Button className="gap-2"><Plus className="h-4 w-4" /> إضافة عقد</Button>
        </Link>
      }
    >
      <KpiGrid items={[
        { label: "إجمالي العقود", value: contracts.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
        { label: "نشط", value: contracts.filter((c: any) => c.status === "active").length, icon: CheckCircle2, color: "text-emerald-600 bg-emerald-50" },
        { label: "منتهي", value: contracts.filter((c: any) => c.status === "expired").length, icon: Clock, color: "text-red-600 bg-red-50" },
        { label: "إجمالي القيمة", value: formatCurrency(contracts.reduce((s: number, c: any) => s + Number(c.monthlyRent || 0), 0)), icon: DollarSign, color: "text-purple-600 bg-purple-50" },
      ]} />

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <AdvancedFilters
            config={{
              searchPlaceholder: "بحث بالمستأجر أو الوحدة أو رقم إيجار...",
              statuses: [
                { value: "active", label: "ساري" },
                { value: "expired", label: "منتهي" },
                { value: "terminated", label: "ملغي" },
              ],
              showDateRange: true,
            }}
            values={filters}
            onChange={setFilters}
            onExportCSV={() => exportToCSV(filtered || [], [
              { key: "ejarNumber", label: "رقم إيجار" },
              { key: "unitNumber", label: "الوحدة" },
              { key: "tenantName", label: "المستأجر" },
              { key: "startDate", label: "من" },
              { key: "endDate", label: "إلى" },
              { key: "monthlyRent", label: "الإيجار الشهري" },
              { key: "annualRent", label: "الإيجار السنوي" },
              { key: "paymentFrequency", label: "دورة السداد" },
              { key: "status", label: "الحالة" },
            ], "عقود_الإيجار")}
            resultCount={filtered?.length}
          />
          <TagFilterSelect tagsList={tagsList} selectedTag={selectedTag} onSelect={setSelectedTag} />
        </div>
      </div>

      <BulkActionsBar
        entityType="property_contract"
        items={filtered}
        selectedIds={selectedIds}
        onToggle={toggleSelect}
        onToggleAll={() => toggleAll(filtered.map((i: any) => i.id))}
        onClear={clearSelection}
        invalidateKeys={[["rental-contracts"]]}
        actions={["export"]}
        csvColumns={[
          { key: "ejarNumber", label: "رقم إيجار" },
          { key: "unitNumber", label: "الوحدة" },
          { key: "tenantName", label: "المستأجر" },
          { key: "monthlyRent", label: "الإيجار الشهري" },
          { key: "status", label: "الحالة" },
        ]}
        csvFileName="عقود_الإيجار"
      />

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-blue-500" /> قائمة العقود</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد عقود"
            emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}
            noToolbar
            onRowClick={(c) => navigate(`/properties/contracts/${c.id}`)}
            rowClassName={(c) => expandedId === c.id ? "bg-blue-50/40" : undefined}
            renderRowExtras={(c) =>
              expandedId === c.id ? (
                <div className="p-4 bg-gray-50/50">
                  <Tabs defaultValue="details" dir="rtl">
                    <TabsList className="mb-3">
                      <TabsTrigger value="details" className="gap-1 text-xs"><CalendarDays className="h-3 w-3" /> تفاصيل العقد</TabsTrigger>
                      <TabsTrigger value="schedule" className="gap-1 text-xs"><Banknote className="h-3 w-3" /> جدول الدفعات</TabsTrigger>
                      <TabsTrigger value="tags" className="gap-1 text-xs">الوسوم والتعليقات</TabsTrigger>
                    </TabsList>
                    <TabsContent value="details">
                      <ContractDetailPanel contract={c} />
                    </TabsContent>
                    <TabsContent value="schedule">
                      <PaymentSchedulePanel contractId={c.id} />
                    </TabsContent>
                    <TabsContent value="tags">
                      <div className="space-y-3">
                        <EntityTags entityType="contract" entityId={c.id} />
                        <EntityComments entityType="contract" entityId={c.id} />
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              ) : null
            }
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
