import { useMemo } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
  EntityDocuments,
  UMRAH_ATTACHMENT_CATEGORIES,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntitySubsidiaryAccounts } from "@/components/shared/entity-subsidiary-accounts";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Phone, Mail, MapPin, Users, Wallet, TrendingUp } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { EntityPnlButton } from "@/components/shared/entity-pnl-button";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  suspended: "موقوف",
  blocked: "محظور",
};

// Pilgrim status labels — mirrors the route's PILGRIM_STATUSES enum.
// Used by the statement card's status-breakdown chips to render
// human-readable Arabic instead of raw values.
const PILGRIM_STATUS_LABELS: Record<string, string> = {
  pending: "لم يصل",
  arrived: "وصل",
  active: "نشط",
  overstayed: "متأخر",
  departed: "غادر",
  violated: "مخالف",
  cancelled: "ملغي",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "inactive") return "muted" as const;
  if (status === "suspended") return "warning" as const;
  if (status === "blocked") return "destructive" as const;
  return "default" as const;
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "مسودّة",
  sent: "مرسلة",
  partially_paid: "مدفوعة جزئياً",
  paid: "مدفوعة",
  overdue: "متأخّرة",
  cancelled: "ملغاة",
};

const INVOICE_TYPE_LABELS: Record<string, string> = {
  sales: "مبيعات",
  purchase: "مشتريات",
  credit_note: "إشعار دائن",
};

interface AgentInvoiceRow {
  id: number;
  ref: string | null;
  type: string;
  pilgrimCount: number;
  total: string | number;
  status: string;
  dueDate: string | null;
  createdAt: string;
}

function AgentRecentInvoicesCard({ agentId }: { agentId: number }) {
  const { data } = useApiQuery<{ data: AgentInvoiceRow[] }>(
    ["umrah-agent-invoices", String(agentId)],
    `/umrah/agents/${agentId}/invoices?limit=10`,
  );
  const rows = data?.data ?? [];
  if (rows.length === 0) {
    // Render nothing on the "no invoices" path — the statement card
    // above already shows the zero totals, an empty table just adds
    // noise without information.
    return null;
  }
  return (
    <Card data-testid="agent-recent-invoices-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">آخر الفواتير</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-right text-muted-foreground border-b">
                <th className="p-2 font-medium">المرجع</th>
                <th className="p-2 font-medium">النوع</th>
                <th className="p-2 font-medium">عدد المعتمرين</th>
                <th className="p-2 font-medium">الإجمالي</th>
                <th className="p-2 font-medium">الاستحقاق</th>
                <th className="p-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0" data-testid={`agent-invoice-row-${r.id}`}>
                  <td className="p-2 font-mono">{r.ref || `#${r.id}`}</td>
                  <td className="p-2">{INVOICE_TYPE_LABELS[r.type] || r.type}</td>
                  <td className="p-2">{r.pilgrimCount ?? 0}</td>
                  <td className="p-2 font-semibold">{formatCurrency(Number(r.total))}</td>
                  <td className="p-2 text-muted-foreground">{r.dueDate ? formatDateAr(r.dueDate) : "—"}</td>
                  <td className="p-2">
                    <Badge variant="outline" className="text-xs">
                      {INVOICE_STATUS_LABELS[r.status] || r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function UmrahAgentDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/umrah/agents/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("umrah-agent", id ?? 0);

  const { data: agent, isLoading, error, refetch } = useApiQuery<any>(
    ["umrah-agent", String(id)],
    `/umrah/agents/${id}`,
    !!id
  );

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!agent) return out;
    if (agent.pilgrimsCount || agent.totalPilgrims) {
      out.push({
        type: "pilgrim",
        id: 0,
        label: `${agent.pilgrimsCount ?? agent.totalPilgrims ?? 0} معتمر`,
        sublabel: "المعتمرون المرتبطون",
        href: `/umrah/pilgrims?agentId=${id}`,
        icon: Users,
      });
    }
    return out;
  }, [agent, id]);


  const editDelete = useDetailEditDelete({
    entityLabel: "الوكيل",
    patchPath: `/umrah/agents/${id}`,
    deletePath: `/umrah/agents/${id}`,
    listPath: "/umrah/agents",
    initialValues: agent,
    fields: [
      { key: "name", label: "الاسم" },
      { key: "phone", label: "الهاتف" },
      { key: "email", label: "البريد الإلكتروني" },
      { key: "licenseNumber", label: "رقم الترخيص" },
      { key: "address", label: "العنوان" },
      { key: "notes", label: "ملاحظات" },
    ],
    invalidateKeys: [["umrah-agent", id || ""], ["umrah-agents"]],
    onSaved: () => refetch(),
  });

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="md:col-span-3">
        <InlineEditCard hook={editDelete} />
      </div>
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            بيانات الوكيل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">اسم الوكيل</p>
              <span className="text-status-neutral-foreground font-medium">{agent?.name || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">رقم الترخيص</p>
              <span className="text-status-neutral-foreground font-mono text-xs">{agent?.licenseNumber || "-"}</span>
            </div>
            {agent?.phone && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الهاتف</p>
                <span className="text-status-neutral-foreground flex items-center gap-1" dir="ltr">
                  <Phone className="h-3 w-3 text-muted-foreground" />
                  {agent.phone}
                </span>
              </div>
            )}
            {agent?.email && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">البريد الإلكتروني</p>
                <span className="text-status-neutral-foreground flex items-center gap-1 text-xs" dir="ltr">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  {agent.email}
                </span>
              </div>
            )}
            {agent?.address && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">العنوان</p>
                <span className="text-status-neutral-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {agent.address}
                </span>
              </div>
            )}
            {agent?.commissionRate != null && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نسبة العمولة</p>
                <Badge variant="outline">{agent.commissionRate}%</Badge>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">إجمالي المعتمرين</p>
              <span className="text-status-neutral-foreground font-semibold" data-testid="agent-pilgrim-count">
                {agent?.pilgrimCount ?? 0}
              </span>
            </div>
          </div>

          {(agent?.contractStart || agent?.contractEnd) && (
            <div className="pt-2 border-t grid grid-cols-2 gap-3">
              {agent.contractStart && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">بداية العقد</p>
                  <span className="text-status-neutral-foreground">{formatDateAr(agent.contractStart)}</span>
                </div>
              )}
              {agent.contractEnd && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">نهاية العقد</p>
                  <span className="text-status-neutral-foreground">{formatDateAr(agent.contractEnd)}</span>
                </div>
              )}
            </div>
          )}

          {agent?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{agent.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Operator statement — answers the sub-agent's #1 question
            ("what's my outstanding balance?") and the operator's #1
            question ("how many of this agent's pilgrims are still
            here?") in a single glance. Numbers come straight from
            the enriched GET /umrah/agents/:id response, no extra
            round-trip. */}
        <Card data-testid="agent-statement-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              كشف حساب الوكيل
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">الرصيد المستحق</p>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-bold ${Number(agent?.totalOutstanding ?? 0) > 0 ? "text-status-error-foreground" : "text-status-success-foreground"}`}
                  data-testid="agent-outstanding"
                >
                  {formatCurrency(Number(agent?.totalOutstanding ?? 0))}
                </span>
                <span className="text-xs text-muted-foreground">ر.س</span>
              </div>
            </div>
            <div className="pt-2 border-t grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">إجمالي المُفوتر</p>
                <span className="font-semibold" data-testid="agent-invoiced">
                  {formatCurrency(Number(agent?.totalInvoiced ?? 0))}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">المُحصّل</p>
                <span className="font-semibold text-status-success-foreground" data-testid="agent-paid">
                  {formatCurrency(Number(agent?.totalPaid ?? 0))}
                </span>
              </div>
            </div>
            {agent?.statusBreakdown && Object.keys(agent.statusBreakdown).length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1.5">توزيع حالة المعتمرين</p>
                <div className="flex flex-wrap gap-1.5" data-testid="agent-status-breakdown">
                  {Object.entries(agent.statusBreakdown as Record<string, number>).map(([status, count]) => (
                    <Badge key={status} variant="outline" className="text-xs">
                      {PILGRIM_STATUS_LABELS[status] || status}: {count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent invoices — makes the statement card actionable. The
          operator can spot which invoice is unpaid, not just the
          balance number. The fetch is gated on `!!id` so we don't
          probe `/umrah/agents/0/invoices`. */}
      {id && <AgentRecentInvoicesCard agentId={id} />}

      {id && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-status-info-foreground" /> الحسابات الفرعية للوكيل
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EntitySubsidiaryAccounts entityType="umrah_agent" entityId={id} />
          </CardContent>
        </Card>
      )}

      {id && <EntityComments entityType="umrah-agent" entityId={id} />}
      {id && <EntityTags entityType="umrah-agent" entityId={id} />}
      {id && (
        <EntityDocuments
          entityType="umrah_agent"
          entityId={id}
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
      title={agent?.name || "تفاصيل الوكيل"}
      subtitle={agent?.licenseNumber ? `ترخيص #${agent.licenseNumber}` : undefined}
      backPath="/umrah/agents"
      refNumber={id ? `AGT-${id}` : undefined}
      status={
        agent
          ? { label: STATUS_LABELS[agent.status] || agent.status || "-", tone: statusTone(agent.status) }
          : undefined
      }
      createdAt={agent?.createdAt}
      updatedAt={agent?.updatedAt}
      relatedEntities={relatedEntities}
      entityType="umrah-agent"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <DetailActionButtons
          hook={editDelete}
          editPerm="umrah:update"
          deletePerm="umrah:delete"
          extra={
            <>
              <Button asChild variant="outline" size="sm" className="gap-1"><Link href={`/finance/profitability/umrah-agent/${id}`}>
                  <TrendingUp className="h-4 w-4" /> الربحية
                </Link></Button>
              <PrintButton
                entityType="umrah_agent"
                entityId={id ?? 0}
               />
              {id && <EntityPnlButton entityType="umrah_agent" entityId={id} />}
            </>
          }
        />
      }
    />
  );
}
