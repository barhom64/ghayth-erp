import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import {
  DetailPageLayout,
  type ExtraTab,
  EntityComments,
} from "@workspace/entity-kit";
import { EntityObligations } from "@/components/shared/entity-obligations";
import { FinancialTab } from "@/components/shared/financial-tab";
import { EntityFinancialProfile } from "@/components/shared/entity-financial-profile";
import { EntitySubsidiaryAccounts } from "@/components/shared/entity-subsidiary-accounts";
import { ClientPortalLinkCard } from "@/components/shared/client-portal-link-card";
import {
  Users2, Phone, Mail, CreditCard, FileText,
  Banknote, AlertTriangle, Home, Clock, BookOpen
} from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { EntityTags } from "@/components/shared/entity-tags";
import { LoadingSpinner } from "@/components/shared/loading-error-states";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { PrintButton } from "@/components/shared/print-button";

export default function TenantDetail() {
  const [, params] = useRoute("/properties/tenants/:id");
  const id = params?.id;
  // Destructure BOTH extraTabs (Financial Profile) and hideTabs so the
  // per-tenant GL drilldown tab actually renders. Pre-fix only hideTabs
  // was read; the Financial Profile tab was silently dropped even
  // though the tenant entry now declares financialEntityType: "client".
  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("tenant", id ?? "");

  const { data: tenant, isLoading, isError, refetch } = useApiQuery<any>(
    ["tenant-detail", id || ""],
    `/properties/tenants/${id}`,
    !!id
  );

  const contracts = tenant?.contracts || [];
  const payments = tenant?.payments || [];
  const activeContract = contracts.find((c: any) => c.status === "active");
  const totalPaid = payments.filter((p: any) => p.status === "paid").reduce((s: number, p: any) => s + Number(p.paidAmount || 0), 0);
  const overduePayments = payments.filter((p: any) => p.status !== "paid" && new Date(p.dueDate) < new Date());

  const subtitleBits = tenant ? [tenant.phone, tenant.email].filter(Boolean).join(" • ") : "";

  const editDelete = useDetailEditDelete({
    entityLabel: "المستأجر",
    patchPath: `/properties/tenants/${id}`,
    deletePath: `/properties/tenants/${id}`,
    listPath: "/properties/tenants",
    initialValues: tenant,
    fields: [
      { key: "name", label: "الاسم" },
      { key: "phone", label: "الهاتف" },
      { key: "email", label: "البريد الإلكتروني" },
      { key: "nationalId", label: "رقم الهوية" },
      { key: "address", label: "العنوان" },
    ],
    invalidateKeys: [["tenant-detail", id || ""], ["tenants"]],
    onSaved: () => refetch(),
  });

  const overview = tenant ? (
    <div className="space-y-4">
      <InlineEditCard hook={editDelete} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">رقم الهوية</p>
            <p className="font-bold font-mono">{tenant.nationalId || "—"}</p>
            {tenant.nationality && <p className="text-xs text-muted-foreground">{tenant.nationality}</p>}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي العقود</p>
            <p className="font-bold text-lg">{contracts.length}</p>
            {activeContract && <p className="text-xs text-emerald-500">عقد ساري</p>}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي المدفوعات</p>
            <p className="font-bold text-lg text-emerald-600">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className={cn("border-0 shadow-sm", overduePayments.length > 0 ? "bg-status-error-surface" : "")}>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">المتأخرات</p>
            <p className={cn("font-bold text-lg", overduePayments.length > 0 ? "text-status-error-foreground" : "text-muted-foreground")}>
              {formatCurrency(overduePayments.reduce((s: number, p: any) => s + Number(p.amount || 0) - Number(p.paidAmount || 0), 0))}
            </p>
            {overduePayments.length > 0 && <p className="text-xs text-status-error">{overduePayments.length} دفعة</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">البيانات الشخصية</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {tenant.name && <div><p className="text-xs text-muted-foreground">الاسم</p><p className="font-medium">{tenant.name}</p></div>}
            {tenant.phone && <div><p className="text-xs text-muted-foreground">الهاتف</p><p className="font-medium">{tenant.phone}</p></div>}
            {tenant.email && <div><p className="text-xs text-muted-foreground">البريد الإلكتروني</p><p className="font-medium">{tenant.email}</p></div>}
            {tenant.nationalId && <div><p className="text-xs text-muted-foreground">رقم الهوية / الإقامة</p><p className="font-medium font-mono">{tenant.nationalId}</p></div>}
            {tenant.nationality && <div><p className="text-xs text-muted-foreground">الجنسية</p><p className="font-medium">{tenant.nationality}</p></div>}
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
              <div><p className="text-xs text-muted-foreground">الوحدة</p><p className="font-medium">{activeContract.unitNumber} {activeContract.buildingName ? `- ${activeContract.buildingName}` : ""}</p></div>
              <div><p className="text-xs text-muted-foreground">الإيجار</p><p className="font-medium text-emerald-600">{formatCurrency(Number(activeContract.monthlyRent || 0))}</p></div>
              <div><p className="text-xs text-muted-foreground">من</p><p className="font-medium">{formatDateAr(activeContract.startDate)}</p></div>
              <div><p className="text-xs text-muted-foreground">إلى</p><p className="font-medium">{formatDateAr(activeContract.endDate)}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {overduePayments.length > 0 && (
        <Card className="border-status-error-surface bg-status-error-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-status-error-foreground">
              <AlertTriangle className="h-4 w-4" /> دفعات متأخرة ({overduePayments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={[
                { key: "unitNumber", header: "الوحدة", render: (p: any) => p.unitNumber || "—" },
                { key: "dueDate", header: "الاستحقاق", render: (p: any) => <span className="text-status-error-foreground">{formatDateAr(p.dueDate)}</span> },
                { key: "amount", header: "المبلغ", render: (p: any) => <span className="font-bold">{formatCurrency(Number(p.amount || 0))}</span> },
              ]}
              data={overduePayments.slice(0, 5)}
              noToolbar
              pageSize={0}
              searchPlaceholder={null}
            />
          </CardContent>
        </Card>
      )}

      {id && (
        <ClientPortalLinkCard
          entityType="tenant"
          entityId={Number(id)}
          patchPath={`/properties/tenants/${id}`}
          linkedClientId={tenant?.clientId ?? null}
          linkedClientName={tenant?.clientName ?? null}
          perm="properties.tenants:update"
          onUpdated={refetch}
          invalidateKeys={[["tenant-detail", id || ""], ["tenants"]]}
        />
      )}

      {id && <EntityComments entityType="tenant" entityId={id} />}
      {id && <EntityTags entityType="tenant" entityId={id} />}
    </div>
  ) : null;

  const extraTabs: ExtraTab[] = [
    {
      key: "contracts",
      label: "العقود",
      icon: FileText,
      content: (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> تاريخ العقود ({contracts.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {contracts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد عقود</p>
            ) : (
              <DataTable
                columns={[
                  { key: "unitNumber", header: "الوحدة", render: (c: any) => (
                    <div>
                      <p className="font-medium">{c.unitNumber}</p>
                      {c.buildingName && <p className="text-xs text-muted-foreground">{c.buildingName}</p>}
                    </div>
                  ) },
                  { key: "startDate", header: "من", render: (c: any) => <span className="text-muted-foreground">{formatDateAr(c.startDate)}</span> },
                  { key: "endDate", header: "إلى", render: (c: any) => <span className="text-muted-foreground">{formatDateAr(c.endDate)}</span> },
                  { key: "monthlyRent", header: "الإيجار", render: (c: any) => <span className="font-bold">{formatCurrency(Number(c.monthlyRent || 0))}</span> },
                  { key: "status", header: "الحالة", render: (c: any) => <PageStatusBadge status={c.status} /> },
                ]}
                data={contracts}
                rowClassName={(c: any) => cn(c.status === "active" && "bg-status-info-surface")}
                noToolbar
                pageSize={0}
                searchPlaceholder={null}
              />
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      key: "payments",
      label: "المدفوعات",
      icon: Banknote,
      content: (
        <Card className="border-0 shadow-sm">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Banknote className="h-4 w-4" /> سجل المدفوعات ({payments.length})</CardTitle></CardHeader>
          <CardContent className="p-0">
            {payments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">لا توجد مدفوعات</p>
            ) : (
              <DataTable
                columns={[
                  { key: "unitNumber", header: "الوحدة", render: (p: any) => p.unitNumber || "—" },
                  { key: "dueDate", header: "الاستحقاق", render: (p: any) => <span className="text-muted-foreground">{formatDateAr(p.dueDate)}</span> },
                  { key: "amount", header: "المبلغ", render: (p: any) => <span className="font-bold">{formatCurrency(Number(p.amount || 0))}</span> },
                  { key: "paidAmount", header: "المدفوع", render: (p: any) => <span className="text-emerald-600">{formatCurrency(Number(p.paidAmount || 0))}</span> },
                  { key: "status", header: "الحالة", render: (p: any) => <PageStatusBadge status={p.status} /> },
                ]}
                data={payments}
                rowClassName={(p: any) => cn(p.status !== "paid" && new Date(p.dueDate) < new Date() ? "bg-status-error-surface" : "")}
                noToolbar
                pageSize={0}
                searchPlaceholder={null}
              />
            )}
          </CardContent>
        </Card>
      ),
    },
    {
      key: "finance",
      label: "الملف المالي",
      icon: BookOpen,
      content: id ? (
        <div className="space-y-6">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-status-info-foreground" />
                الملف المالي الشامل للمستأجر
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EntityFinancialProfile entityType="contract" entityId={id} />
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">دفتر الأستاذ المساعد</CardTitle>
            </CardHeader>
            <CardContent>
              <FinancialTab entityType="client" entityId={id} />
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-status-info-foreground" /> الحسابات الفرعية للمستأجر
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EntitySubsidiaryAccounts entityType="client" entityId={id} />
            </CardContent>
          </Card>
        </div>
      ) : null,
    },
    {
      key: "letters",
      label: "المراسلات",
      icon: Mail,
      content: id ? <TenantLettersTab tenantId={id} /> : null,
    },
    // Append the registry-provided Financial Profile tab so per-tenant
    // GL movements (rent revenue / VAT / installment payments) drill
    // here. The registry resolves tenant → entityType="client" so
    // EntityFinancialProfile pulls every JE line with clientId=tenantId.
    ...registryExtraTabs,
  ];

  const tenantActionsExtra = activeContract ? (
    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">مستأجر نشط</Badge>
  ) : null;

  return (
    <DetailPageLayout
      title={tenant?.name || "المستأجر"}
      subtitle={subtitleBits || undefined}
      backPath="/properties/tenants"
      backLabel="العودة"
      entityType="tenant"
      entityId={id ? Number(id) : (id || "")}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={refetch}
      overview={overview}
      actions={
        <div className="flex items-center gap-2">
          <DetailActionButtons hook={editDelete} editPerm="properties:update" deletePerm="properties:delete" extra={tenantActionsExtra} />
          <PrintButton entityType="tenant" entityId={(id as any) ?? 0} label="طباعة" />
        </div>
      }
      extraTabs={extraTabs}
      hideTabs={registryHideTabs}
    />
  );
}

function TenantLettersTab({ tenantId }: { tenantId: string }) {
  // The backend route is `/api/correspondence?entityType=…&entityId=…` —
  // the older `/api/letters?relatedType=…&relatedId=…` endpoint never
  // existed (see check-frontend-backend-wiring audit), so the tab
  // silently 404'd before this fix.
  const { data: lettersResp, isLoading } = useApiQuery<any>(
    ["tenant-letters", tenantId],
    `/correspondence?entityType=tenant&entityId=${tenantId}`,
    !!tenantId
  );
  // GET /properties/tenants/:id/letters — dedicated property-domain
  // index that returns lease-related letters (renewal notice, eviction,
  // dues warning) even when they weren't filed in the generic
  // correspondence table. Merged with the cross-domain list above.
  const { data: domainLettersResp } = useApiQuery<any>(
    ["tenant-domain-letters", tenantId],
    tenantId ? `/properties/tenants/${tenantId}/letters` : null,
    { enabled: !!tenantId },
  );
  const corrLetters: any[] = Array.isArray(lettersResp?.data) ? lettersResp.data : Array.isArray(lettersResp) ? lettersResp : [];
  const domainLetters: any[] = Array.isArray(domainLettersResp?.data) ? domainLettersResp.data : Array.isArray(domainLettersResp) ? domainLettersResp : [];
  const seen = new Set<number>();
  const letters: any[] = [];
  for (const l of [...corrLetters, ...domainLetters]) {
    if (l?.id == null || seen.has(l.id)) continue;
    seen.add(l.id);
    letters.push(l);
  }

  const columns: DataTableColumn<any>[] = [
    { key: "subject", header: "الموضوع", render: (l) => l.subject || "—" },
    { key: "direction", header: "الاتجاه", render: (l) => l.direction === "outgoing" ? "صادر" : "وارد" },
    { key: "type", header: "النوع", render: (l) => l.type || "—" },
    { key: "letterDate", header: "التاريخ", render: (l) => formatDateAr(l.letterDate) },
    { key: "status", header: "الحالة", render: (l) => <PageStatusBadge status={l.status} /> },
  ];

  if (isLoading) return <LoadingSpinner />;

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> المراسلات ({letters.length})</CardTitle>
        <Button asChild size="sm" className="gap-1"><Link href={`/correspondence/create?relatedType=tenant&relatedId=${tenantId}`}><Mail className="h-3 w-3" /> خطاب جديد</Link></Button>
      </CardHeader>
      <CardContent className="p-0">
        {letters.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">لا توجد مراسلات</p>
        ) : (
          <DataTable
            columns={columns}
            data={letters}
            noToolbar
            pageSize={0}
            searchPlaceholder={null}
          />
        )}
      </CardContent>
    </Card>
  );
}
