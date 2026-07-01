import { useState } from "react";
import { z } from "zod";
import { useRoute, Link } from "wouter";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DetailPageLayout,
  type ExtraTab,
  EntityComments,
  EntityDocuments,
  UMRAH_ATTACHMENT_CATEGORIES,
} from "@workspace/entity-kit";
import {
  FormShell,
  FormGrid,
  FormNumberField,
  FormTextField,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityTags } from "@/components/shared/entity-tags";
import { JourneyStepIndicator } from "@/components/shared/journey-step-indicator";
import { UserPlus, FileText, ExternalLink, Phone, Mail, MapPin, DollarSign, Plus, X, Wallet } from "lucide-react";

// Pilgrim status labels — mirrors the route's PILGRIM_STATUSES enum.
// Used by the statement card's status-breakdown chips to render
// human-readable Arabic instead of raw values. Same dictionary as the
// agent detail page (PR #1438).
const PILGRIM_STATUS_LABELS: Record<string, string> = {
  pending: "لم يصل",
  arrived: "وصل",
  active: "نشط",
  overstayed: "متأخر",
  departed: "غادر",
  violated: "مخالف",
  cancelled: "ملغي",
};
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { PrintButton } from "@/components/shared/print-button";

const paymentFormSchema = z.object({
  sarAmount: z.coerce.number().positive("المبلغ مطلوب"),
  method: z.string().trim(),
  reference: z.string().trim(),
});
type PaymentForm = z.infer<typeof paymentFormSchema>;

function AddPaymentForm({ subAgentId, onSuccess }: { subAgentId: number; onSuccess: () => void }) {
  const saveMut = useApiMutation<unknown, PaymentForm & { subAgentId: number }>(
    "/umrah/payments",
    "POST",
    [["umrah-sub-agent-payments", String(subAgentId)]],
    { successMessage: "تم تسجيل الدفعة", onSuccess },
  );
  return (
    <Card className="border-dashed">
      <CardContent className="p-4">
        <h4 className="font-semibold mb-3 text-sm">تسجيل دفعة جديدة</h4>
        <FormShell
          schema={paymentFormSchema}
          defaultValues={{ sarAmount: 0, method: "", reference: "" }}
          submitLabel="حفظ الدفعة"
          onSubmit={async (values, ctx) => {
            await saveMut.mutateAsync({ ...values, subAgentId });
            ctx.reset();
          }}
        >
          <FormGrid cols={2}>
            <FormNumberField name="sarAmount" label="المبلغ (ر.س)" />
            <FormTextField name="method" label="طريقة الدفع" placeholder="cash / bank / transfer" />
            <FormTextField name="reference" label="المرجع" className="md:col-span-2" />
          </FormGrid>
        </FormShell>
      </CardContent>
    </Card>
  );
}

// Detail view for `umrah_sub_agents`. Reuses the polymorphic
// EntityDocuments + EntityComments + EntityTags helpers so the
// only sub-agent-specific code is the header + bio card. Statement of
// account and pricing CTAs link to the existing endpoints (#305 PDF
// statement + /umrah/pricing page).

interface SubAgent {
  id: number;
  nuskCode: string;
  name: string;
  agentId: number | null;
  agentName: string | null;
  clientId: number | null;
  clientName: string | null;
  paymentTerms: "prepaid" | "postpaid" | "partial" | null;
  defaultPricePerMutamer: number | null;
  phone: string | null;
  email: string | null;
  country: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  // Statement aggregates from GET /umrah/sub-agents/:id (mirrors PR #1438
  // for agents). pilgrimCount counts non-deleted pilgrims with this
  // subAgentId; totalPaid is SUM sarAmount from umrah_payments;
  // statusBreakdown is { status → count } over the same pilgrim set.
  pilgrimCount?: number;
  overstayedCount?: number;
  totalPaid?: number;
  statusBreakdown?: Record<string, number>;
}

const PAYMENT_TERMS_LABEL: Record<string, string> = {
  prepaid: "مقدم",
  postpaid: "آجل",
  partial: "جزئي",
};

export default function UmrahSubAgentDetail() {
  const [, params] = useRoute("/umrah/sub-agents/:id");
  const id = params?.id ? Number(params.id) : null;
  const [showAddPayment, setShowAddPayment] = useState(false);

  const { data: sa, isLoading, error, refetch } = useApiQuery<SubAgent>(
    ["umrah-sub-agent", String(id ?? 0)],
    `/umrah/sub-agents/${id}`,
    !!id,
  );

  const { data: paymentsResp, refetch: refetchPayments } = useApiQuery<{ data: any[] }>(
    ["umrah-sub-agent-payments", String(id ?? 0)],
    id ? `/umrah/payments?subAgentId=${id}` : null,
    !!id,
  );
  const payments = asList(paymentsResp?.data ?? paymentsResp);

  // GET /umrah/statements/:subAgentId — rolled-up running balance + per-
  // booking breakdown, computed server-side.
  const { data: statement } = useApiQuery<any>(
    ["umrah-sub-agent-statement", String(id ?? 0)],
    id ? `/umrah/statements/${id}` : null,
    !!id,
  );

  const paymentsTab: ExtraTab = {
    key: "payments",
    label: "الدفعات",
    icon: DollarSign,
    badge: payments.length || undefined,
    content: (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">دفعات الوكيل الفرعي</h3>
          <GuardedButton perm="umrah:create" size="sm" onClick={() => setShowAddPayment(!showAddPayment)}>
            {showAddPayment ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />دفعة جديدة</>}
          </GuardedButton>
        </div>
        {showAddPayment && id && (
          <AddPaymentForm subAgentId={id} onSuccess={() => { setShowAddPayment(false); refetchPayments(); }} />
        )}
        {payments.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">لا توجد دفعات مسجلة</p>
            </CardContent>
          </Card>
        ) : (
          <DataTable
            columns={[
              { key: "paymentDate", header: "التاريخ", sortable: true, render: (p) => formatDateAr(p.paymentDate) },
              { key: "sarAmount", header: "المبلغ", sortable: true, render: (p) => (
                <span className="font-bold text-status-success-foreground">{formatCurrency(Number(p.sarAmount || p.amount || 0))}</span>
              )},
              { key: "method", header: "الطريقة", render: (p) => p.method || "—" },
              { key: "reference", header: "المرجع", render: (p) => p.reference || "—" },
            ] as DataTableColumn<any>[]}
            data={payments}
            noToolbar
            pageSize={10}
          />
        )}
      </div>
    ),
  };

  const status = sa
    ? sa.isActive
      ? ({ label: "نشط", tone: "success" as const })
      : ({ label: "غير نشط", tone: "muted" as const })
    : undefined;

  const overview = (
    <div className="space-y-4">
      {/* U-19-P4 — journey step indicator pinned at the top of the overview tab. */}
      {sa && (
        <JourneyStepIndicator
          subjectKind="sub-agent"
          subjectId={sa.id}
          currentStage="linked"
        />
      )}
      {statement && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">كشف الحساب الجاري</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">الرصيد</p>
              <p className="font-bold font-mono">{formatCurrency(Number(statement.balance ?? 0))}</p>
            </div>
            <div>
              <p className="text-muted-foreground">المدفوع</p>
              <p className="font-mono">{formatCurrency(Number(statement.totalPaid ?? 0))}</p>
            </div>
            <div>
              <p className="text-muted-foreground">المستحق</p>
              <p className="font-mono">{formatCurrency(Number(statement.totalDue ?? 0))}</p>
            </div>
            <div>
              <p className="text-muted-foreground">عدد الحجوزات</p>
              <p className="font-mono">{statement.bookingsCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="inline-flex items-center gap-2 text-sm">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            بيانات الوكيل الفرعي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">رمز نسك</p>
              <span className="font-mono text-xs text-status-neutral-foreground">{sa?.nuskCode || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">الاسم</p>
              <span className="font-medium text-status-neutral-foreground">{sa?.name || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">الوكيل الرئيسي</p>
              {sa?.agentId ? (
                <Link href={`/umrah/agents/${sa.agentId}`} asChild>
                  <a className="inline-flex items-center gap-1 text-status-info-foreground hover:underline">
                    {sa.agentName || `وكيل #${sa.agentId}`}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Link>
              ) : (
                <span className="text-muted-foreground text-xs">— غير مربوط</span>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">العميل المرتبط</p>
              {sa?.clientId ? (
                <Link href={`/clients/${sa.clientId}`} asChild>
                  <a className="inline-flex items-center gap-1 text-status-info-foreground hover:underline">
                    {sa.clientName || `عميل #${sa.clientId}`}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Link>
              ) : (
                <span className="text-muted-foreground text-xs">— غير مربوط بعميل</span>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">شروط الدفع</p>
              <Badge variant="outline">{PAYMENT_TERMS_LABEL[sa?.paymentTerms ?? ""] || "—"}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">السعر الافتراضي للمعتمر</p>
              <span className="text-status-neutral-foreground">
                {sa?.defaultPricePerMutamer != null ? formatCurrency(Number(sa.defaultPricePerMutamer)) : "—"}
              </span>
            </div>
            {sa?.country && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الدولة</p>
                <span className="inline-flex items-center gap-1 text-status-neutral-foreground">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {sa.country}
                </span>
              </div>
            )}
            {sa?.phone && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الهاتف</p>
                <span dir="ltr" className="inline-flex items-center gap-1 text-status-neutral-foreground">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  {sa.phone}
                </span>
              </div>
            )}
            {sa?.email && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">البريد الإلكتروني</p>
                <span dir="ltr" className="inline-flex items-center gap-1 text-status-neutral-foreground text-xs">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  {sa.email}
                </span>
              </div>
            )}
          </div>

          {sa?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="whitespace-pre-wrap text-status-neutral-foreground">{sa.notes}</p>
            </div>
          )}

          {sa && (
            <div className="pt-2 border-t flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => {
                  // Goes through `/api/umrah/statements/:id/pdf`, which is
                  // itself a renderPrint() orchestrator that gathers
                  // period-bounded journal entries and feeds them as a
                  // previewPayload. The engine logs the print job + audit row
                  // server-side — opening it in a new tab here is just the
                  // download trigger, not a bypass of the print platform.
                  window.open(`/api/umrah/statements/${sa.id}/pdf`, "_blank");
                }}
                rateLimitAware
              >
                <FileText className="h-3.5 w-3.5" />
                كشف حساب PDF
              </Button>
              <Link href={`/umrah/pricing?subAgentId=${sa.id}`} asChild>
                <a>
                  <Button size="sm" variant="outline">
                    عرض تسعير الوكيل
                  </Button>
                </a>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statement card — same one-pane summary as the agent detail
          (PR #1438). totalPaid comes from umrah_payments (the actual
          receipts ledger for sub-agents, not invoice statuses). */}
      <Card data-testid="sub-agent-statement-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            كشف حساب الوكيل الفرعي
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">إجمالي المعتمرين</p>
              <span className="font-semibold" data-testid="sub-agent-pilgrim-count">
                {sa?.pilgrimCount ?? 0}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">المُحصّل</p>
              <span className="font-semibold text-status-success-foreground" data-testid="sub-agent-paid">
                {formatCurrency(Number(sa?.totalPaid ?? 0))}
              </span>
            </div>
          </div>
          {sa?.statusBreakdown && Object.keys(sa.statusBreakdown).length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1.5">توزيع حالة المعتمرين</p>
              <div className="flex flex-wrap gap-1.5" data-testid="sub-agent-status-breakdown">
                {Object.entries(sa.statusBreakdown as Record<string, number>).map(([status, count]) => (
                  <Badge key={status} variant="outline" className="text-xs">
                    {PILGRIM_STATUS_LABELS[status] || status}: {count}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {sa && <EntityComments entityType="umrah-sub-agent" entityId={sa.id} />}
      {sa && <EntityTags entityType="umrah-sub-agent" entityId={sa.id} />}
      {sa && (
        <EntityDocuments
          entityType="umrah_sub_agent"
          entityId={Number(sa.id)}
          title="المرفقات"
          categories={UMRAH_ATTACHMENT_CATEGORIES}
          quickUpload
          canDelete
          viewMode="grid"
        />
      )}
    </div>
  );

  return (
    <DetailPageLayout
      actions={<PrintButton entityType="umrah_sub_agent" entityId={(params?.id ?? id ?? 0) as any} label="طباعة" />}
      title={sa?.name || "تفاصيل الوكيل الفرعي"}
      subtitle={sa?.nuskCode ? `رمز نسك: ${sa.nuskCode}` : undefined}
      backPath="/umrah/sub-agents"
      backLabel="العودة للقائمة"
      refNumber={id ? `SUB-${id}` : undefined}
      status={status}
      entityType="umrah-sub-agent"
      entityId={id ?? 0}
      createdAt={sa?.createdAt}
      updatedAt={sa?.updatedAt}
      isLoading={isLoading}
      error={error ? true : undefined}
      onRetry={() => refetch()}
      overview={overview}
      extraTabs={[paymentsTab]}
    />
  );
}
