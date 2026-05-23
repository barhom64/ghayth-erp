import { useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DetailPageLayout,
  EntityComments,
} from "@workspace/entity-kit";
import { UmrahAttachmentsPanel } from "@/components/shared/umrah-attachments-panel";
import { EntityTags } from "@/components/shared/entity-tags";
import { UserPlus, FileText, ExternalLink, Phone, Mail, MapPin } from "lucide-react";
import { formatDateAr, formatCurrency } from "@/lib/formatters";

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
    id ? `/umrah/sub-agents/${id}` : null,
    !!id,
  );

  const status = sa
    ? sa.isActive
      ? ({ label: "نشط", tone: "success" as const })
      : ({ label: "غير نشط", tone: "muted" as const })
    : undefined;

  const overview = (
    <div className="space-y-4">
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
