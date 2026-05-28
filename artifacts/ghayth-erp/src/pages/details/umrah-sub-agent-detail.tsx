import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DetailPageLayout,
  EntityComments,
} from "@workspace/entity-kit";
import { UmrahAttachmentsPanel } from "@/components/shared/umrah-attachments-panel";
import { EntityTags } from "@/components/shared/entity-tags";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { UserPlus, FileText, ExternalLink, Phone, Mail, MapPin } from "lucide-react";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { PrintButton } from "@/components/shared/print-button";

// Detail view for `umrah_sub_agents`. Reuses the polymorphic
// UmrahAttachmentsPanel + EntityComments + EntityTags helpers so the
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
}

const PAYMENT_TERMS_LABEL: Record<string, string> = {
  prepaid: "مقدم",
  postpaid: "آجل",
  partial: "جزئي",
};

export default function UmrahSubAgentDetail() {
  const [, params] = useRoute("/umrah/sub-agents/:id");
  const id = params?.id ? Number(params.id) : null;

  const { data: sa, isLoading, error, refetch } = useApiQuery<SubAgent>(
    ["umrah-sub-agent", String(id ?? 0)],
    `/umrah/sub-agents/${id}`,
    !!id,
  );

  // GET /umrah/statements/:subAgentId — accounting statement (detailed
  // by default) for this sub-agent. Shows last 90 days of activity in a
  // collapsible card. The existing PDF button on the same row hits the
  // /pdf variant.
  const { data: stmtResp } = useApiQuery<any>(
    ["umrah-statement-summary", String(id ?? 0)],
    id ? `/umrah/statements/${id}?type=summary` : null,
    { enabled: !!id },
  );
  const statement = stmtResp?.data ?? stmtResp;

  // GET /umrah/payments?subAgentId=... — payment history for this
  // sub-agent. POST /umrah/payments — record a new incoming payment.
  const paymentsQ = useApiQuery<any>(
    ["umrah-payments-by-sub-agent", String(id ?? 0)],
    id ? `/umrah/payments?subAgentId=${id}` : null,
    { enabled: !!id },
  );
  const payments: any[] = paymentsQ.data?.data ?? [];
  const { toast: subAgentToast } = useToast();
  const addPaymentMut = useApiMutation<unknown, {
    subAgentId: number;
    amount: number;
    method: string;
    receivedAt?: string;
    notes?: string;
  }>(
    "/umrah/payments",
    "POST",
    [["umrah-payments-by-sub-agent", String(id ?? 0)], ["umrah-statement-summary", String(id ?? 0)]],
    { successMessage: "تم تسجيل الدفعة" },
  );
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payDate, setPayDate] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const submitPayment = () => {
    if (!id) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      subAgentToast({ variant: "destructive", title: "أدخل مبلغاً صحيحاً" });
      return;
    }
    addPaymentMut.mutate(
      {
        subAgentId: id,
        amount: amt,
        method: payMethod,
        receivedAt: payDate || undefined,
        notes: payNotes.trim() || undefined,
      },
      {
        onSuccess: () => {
          setPayAmount(""); setPayDate(""); setPayNotes("");
        },
      },
    );
  };

  // PATCH /umrah/sub-agents/:id + DELETE soft-delete.
  const editDelete = useDetailEditDelete({
    entityLabel: "الوكيل الفرعي",
    patchPath: `/umrah/sub-agents/${id}`,
    deletePath: `/umrah/sub-agents/${id}`,
    listPath: "/umrah/sub-agents",
    initialValues: sa,
    fields: [
      { key: "name", label: "الاسم" },
      { key: "phone", label: "الهاتف" },
      { key: "email", label: "البريد الإلكتروني" },
      { key: "country", label: "الدولة" },
      { key: "defaultPricePerMutamer", label: "السعر الافتراضي للمعتمر", type: "number" },
      { key: "notes", label: "ملاحظات" },
    ],
    invalidateKeys: [["umrah-sub-agent", String(id ?? 0)], ["umrah-sub-agents"]],
    onSaved: () => refetch(),
  });

  const status = sa
    ? sa.isActive
      ? ({ label: "نشط", tone: "success" as const })
      : ({ label: "غير نشط", tone: "muted" as const })
    : undefined;

  const overview = (
    <div className="space-y-4">
      <InlineEditCard hook={editDelete} />
      {statement && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">ملخص كشف الحساب</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(statement as Record<string, any>)
              .filter(([k]) => typeof (statement as any)[k] !== "object" || (statement as any)[k] === null)
              .slice(0, 8)
              .map(([k, v]) => (
                <div key={k} className="flex justify-between border rounded p-1">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-mono">
                    {v == null ? "—" : typeof v === "number" ? formatCurrency(v) : String(v)}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">الدفعات ({payments.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {payments.length > 0 ? (
            <div className="divide-y text-xs">
              {payments.slice(0, 8).map((p: any) => (
                <div key={p.id} className="py-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{p.method ?? "—"}</Badge>
                    <span className="text-muted-foreground">{p.receivedAt ? formatDateAr(p.receivedAt) : ""}</span>
                  </div>
                  <span className="font-mono">{formatCurrency(Number(p.amount ?? 0))}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">لا توجد دفعات مسجلة</p>
          )}
          <div className="border-t pt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>
              <p className="text-xs text-muted-foreground">المبلغ *</p>
              <input
                type="number"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="w-full h-8 text-xs border rounded px-2"
                dir="ltr"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">الطريقة</p>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full h-8 text-xs border rounded px-2 bg-white"
              >
                <option value="bank_transfer">حوالة بنكية</option>
                <option value="cash">نقدي</option>
                <option value="cheque">شيك</option>
                <option value="other">أخرى</option>
              </select>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">التاريخ</p>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="w-full h-8 text-xs border rounded px-2"
                dir="ltr"
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ملاحظات</p>
              <input
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
                className="w-full h-8 text-xs border rounded px-2"
              />
            </div>
            <div className="md:col-span-4">
              <button
                type="button"
                className="text-xs h-8 px-3 rounded bg-status-info-foreground text-white"
                onClick={submitPayment}
                disabled={addPaymentMut.isPending}
              >
                تسجيل دفعة
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
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
                <Link href={`/umrah/agents/${sa.agentId}`}>
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
                <Link href={`/clients/${sa.clientId}`}>
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
                  window.open(`/api/umrah/statements/${sa.id}/pdf`, "_blank");
                }}
                rateLimitAware
              >
                <FileText className="h-3.5 w-3.5" />
                كشف حساب PDF
              </Button>
              <Link href={`/umrah/pricing?subAgentId=${sa.id}`}>
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

      {sa && <EntityComments entityType="umrah-sub-agent" entityId={sa.id} />}
      {sa && <EntityTags entityType="umrah-sub-agent" entityId={sa.id} />}
      {sa && <UmrahAttachmentsPanel entityType="sub_agent" entityId={sa.id} />}
    </div>
  );

  return (
    <DetailPageLayout
      actions={
        <div className="flex items-center gap-2">
          <PrintButton entityType="umrah_sub_agent" entityId={(params?.id ?? id ?? 0) as any} formats={["a4"]} label="طباعة" />
          <DetailActionButtons hook={editDelete} editPerm="umrah:update" deletePerm="umrah:delete" />
        </div>
      }
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
    />
  );
}
