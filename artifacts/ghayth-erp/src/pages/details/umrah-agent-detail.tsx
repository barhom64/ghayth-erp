import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  useDetailEditDelete,
  DetailActionButtons,
  InlineEditCard,
} from "@/components/shared/detail-edit-delete-actions";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Phone, Mail, MapPin, Users, Wallet } from "lucide-react";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { UmrahAttachmentsPanel } from "@/components/shared/umrah-attachments-panel";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  active: "نشط",
  inactive: "غير نشط",
  suspended: "موقوف",
  blocked: "محظور",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "inactive") return "muted" as const;
  if (status === "suspended") return "warning" as const;
  if (status === "blocked") return "destructive" as const;
  return "default" as const;
}

export default function UmrahAgentDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/umrah/agents/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("umrah-agent", id ?? 0);

  const { data: agent, isLoading, error, refetch } = useApiQuery<any>(
    ["umrah-agent", String(id)],
    id ? `/umrah/agents/${id}` : null,
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

  const printSections: PrintSection[] = useMemo(() => {
    if (!agent) return [];
    const items: Array<{ label: string; value: string }> = [
      { label: "رقم المرجع", value: `AGT-${id}` },
      { label: "اسم الوكيل", value: agent.name || "-" },
      { label: "رقم الترخيص", value: agent.licenseNumber || "-" },
      { label: "الهاتف", value: agent.phone || "-" },
      { label: "البريد الإلكتروني", value: agent.email || "-" },
      { label: "العنوان", value: agent.address || "-" },
      { label: "نسبة العمولة", value: agent.commissionRate ? `${agent.commissionRate}%` : "-" },
      { label: "إجمالي المعتمرين", value: String(agent.totalPilgrims ?? agent.pilgrimsCount ?? 0) },
      { label: "الرصيد", value: formatCurrency(Number(agent.balance ?? 0)) },
      { label: "بداية العقد", value: agent.contractStart ? formatDateAr(agent.contractStart) : "-" },
      { label: "نهاية العقد", value: agent.contractEnd ? formatDateAr(agent.contractEnd) : "-" },
      { label: "الحالة", value: STATUS_LABELS[agent.status] || agent.status || "-" },
    ];
    return [{ kind: "info-grid", items }];
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
    invalidateKeys: [["umrah-agent-detail", id || ""], ["umrah-agents"]],
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
            <Users className="h-4 w-4 text-gray-500" />
            بيانات الوكيل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">اسم الوكيل</p>
              <span className="text-gray-800 font-medium">{agent?.name || "-"}</span>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">رقم الترخيص</p>
              <span className="text-gray-800 font-mono text-xs">{agent?.licenseNumber || "-"}</span>
            </div>
            {agent?.phone && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">الهاتف</p>
                <span className="text-gray-800 flex items-center gap-1" dir="ltr">
                  <Phone className="h-3 w-3 text-gray-400" />
                  {agent.phone}
                </span>
              </div>
            )}
            {agent?.email && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">البريد الإلكتروني</p>
                <span className="text-gray-800 flex items-center gap-1 text-xs" dir="ltr">
                  <Mail className="h-3 w-3 text-gray-400" />
                  {agent.email}
                </span>
              </div>
            )}
            {agent?.address && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">العنوان</p>
                <span className="text-gray-800 flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-gray-400" />
                  {agent.address}
                </span>
              </div>
            )}
            {agent?.commissionRate != null && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">نسبة العمولة</p>
                <Badge variant="outline">{agent.commissionRate}%</Badge>
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-0.5">إجمالي المعتمرين</p>
              <span className="text-gray-800 font-semibold">{agent?.totalPilgrims ?? agent?.pilgrimsCount ?? 0}</span>
            </div>
          </div>

          {(agent?.contractStart || agent?.contractEnd) && (
            <div className="pt-2 border-t grid grid-cols-2 gap-3">
              {agent.contractStart && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">بداية العقد</p>
                  <span className="text-gray-800">{formatDateAr(agent.contractStart)}</span>
                </div>
              )}
              {agent.contractEnd && (
                <div>
                  <p className="text-xs text-gray-500 mb-0.5">نهاية العقد</p>
                  <span className="text-gray-800">{formatDateAr(agent.contractEnd)}</span>
                </div>
              )}
            </div>
          )}

          {agent?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{agent.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Wallet className="h-4 w-4 text-gray-500" />
              الرصيد
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">
                {formatCurrency(Number(agent?.balance ?? 0))}
              </span>
              <span className="text-xs text-gray-500">ر.س</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="umrah-agent" entityId={id} />}
      {id && <EntityTags entityType="umrah-agent" entityId={id} />}
      {id && <UmrahAttachmentsPanel entityType="agent" entityId={id} />}
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
          extra={
            <EntityPrintButton
              branchId={agent?.branchId}
              title={`ملف الوكيل — ${agent?.name || ""}`}
              ref={`AGT-${id}`}
              date={formatDateAr(new Date().toISOString())}
              sections={printSections}
            />
          }
        />
      }
    />
  );
}
