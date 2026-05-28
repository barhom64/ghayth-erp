import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Edit, FileText, Link2, ShieldCheck, Plus } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  active: "ساري",
  archived: "مؤرشف",
  under_review: "قيد المراجعة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (status === "archived") return "destructive" as const;
  if (status === "under_review") return "info" as const;
  if (status === "draft") return "warning" as const;
  return "default" as const;
}

export default function PolicyDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/governance/policies/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("policy", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["policy", String(id)],
    `/governance/policies/${id}`,
    !!id
  );

  const policy = data;
  const { toast } = useToast();

  // GET /governance/policies/:id/module-links — which app modules
  // declare a dependency on this policy (e.g. finance.invoices must
  // adhere to "Purchase Approval Policy"). Used by auditors to walk
  // from policy → enforcement points.
  const moduleLinksQ = useApiQuery<any>(
    ["policy-module-links", String(id)],
    id ? `/governance/policies/${id}/module-links` : null,
    { enabled: !!id },
  );
  // GET /governance/policies/:id/compliance-actions — list of remedial
  // actions opened against the policy (e.g. "training plan for new
  // staff"). POST adds a new action.
  const complianceActionsQ = useApiQuery<any>(
    ["policy-compliance-actions", String(id)],
    id ? `/governance/policies/${id}/compliance-actions` : null,
    { enabled: !!id },
  );
  const addActionMut = useApiMutation<any, { actionType: string; description?: string; dueDate?: string }>(
    () => `/governance/policies/${id}/compliance-actions`,
    "POST",
    [["policy-compliance-actions", String(id)]],
    { successMessage: "تمت إضافة إجراء الامتثال" },
  );
  const [actionType, setActionType] = useState("");
  const [actionDesc, setActionDesc] = useState("");
  const [actionDue, setActionDue] = useState("");
  const submitAction = () => {
    if (!actionType.trim()) {
      toast({ variant: "destructive", title: "نوع الإجراء مطلوب" });
      return;
    }
    addActionMut.mutate(
      {
        actionType: actionType.trim(),
        description: actionDesc.trim() || undefined,
        dueDate: actionDue || undefined,
      },
      {
        onSuccess: () => {
          setActionType(""); setActionDesc(""); setActionDue("");
        },
      },
    );
  };

  const moduleLinks: any[] = moduleLinksQ.data?.data ?? moduleLinksQ.data?.modules ?? [];
  const complianceActions: any[] = complianceActionsQ.data?.data ?? complianceActionsQ.data?.actions ?? [];

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!policy) return out;
    if (policy.departmentId) {
      out.push({
        type: "department",
        id: policy.departmentId,
        label: policy.departmentName || `قسم #${policy.departmentId}`,
        sublabel: "القسم",
      });
    }
    if (policy.ownerId) {
      out.push({
        type: "employee",
        id: policy.ownerId,
        label: policy.ownerName || `موظف #${policy.ownerId}`,
        sublabel: "المسؤول",
        href: `/hr/employees/${policy.ownerId}`,
      });
    }
    return out;
  }, [policy]);


  const handleEdit = () => {
    setLocation(`/governance/policies/${id}/edit`);
  };

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            بيانات السياسة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {policy?.category && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">التصنيف</p>
                <Badge variant="outline">{policy.category}</Badge>
              </div>
            )}
            {policy?.version && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الإصدار</p>
                <Badge variant="secondary">{policy.version}</Badge>
              </div>
            )}
            {policy?.effectiveDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ السريان</p>
                <span className="text-status-neutral-foreground">{formatDateAr(policy.effectiveDate)}</span>
              </div>
            )}
            {policy?.reviewDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ المراجعة</p>
                <span className="text-status-neutral-foreground">{formatDateAr(policy.reviewDate)}</span>
              </div>
            )}
            {(policy?.owner || policy?.ownerName) && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">المسؤول</p>
                <span className="text-status-neutral-foreground">{policy.owner || policy.ownerName}</span>
              </div>
            )}
          </div>

          {policy?.summary && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الملخص</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{policy.summary}</p>
            </div>
          )}

          {(policy?.content || policy?.fullContent) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">المحتوى الكامل</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">
                {policy.content || policy.fullContent}
              </p>
            </div>
          )}

          {policy?.complianceRequirements && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">متطلبات الامتثال</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{policy.complianceRequirements}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">معلومات إضافية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {policy?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنشاء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(policy.createdAt)}</span>
              </div>
            )}
            {policy?.createdByName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">أنشئ بواسطة</p>
                <span className="text-status-neutral-foreground">{policy.createdByName}</span>
              </div>
            )}
            {policy?.updatedAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">آخر تحديث</p>
                <span className="text-status-neutral-foreground">{formatDateAr(policy.updatedAt)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Module links — which features declare a dependency on this policy */}
      {moduleLinks.length > 0 && (
        <Card className="md:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              ارتباط الوحدات
              <Badge variant="outline" className="text-[10px]">{moduleLinks.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {moduleLinks.map((m: any, i: number) => (
                <Badge key={m.id ?? i} variant="secondary" className="text-xs">
                  {m.moduleLabel ?? m.module ?? m.feature ?? m.name ?? "—"}
                  {m.action && <span className="ms-1 text-muted-foreground">/{m.action}</span>}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compliance actions — remedial work tied to this policy */}
      <Card className="md:col-span-3">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            إجراءات الامتثال
            <Badge variant="outline" className="text-[10px]">{complianceActions.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {complianceActions.length === 0 && (
            <p className="text-xs text-muted-foreground">لا توجد إجراءات بعد — أضِف إجراءً جديداً أدناه.</p>
          )}
          {complianceActions.map((a: any) => (
            <div key={a.id} className="text-xs border rounded p-2 bg-muted/30">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{a.actionType ?? a.type}</span>
                {a.status && <Badge variant="outline" className="text-[10px]">{a.status}</Badge>}
              </div>
              {a.description && <p className="text-muted-foreground mt-1">{a.description}</p>}
              {a.dueDate && <p className="text-[10px] text-muted-foreground mt-1">الاستحقاق: {formatDateAr(a.dueDate)}</p>}
            </div>
          ))}
          <div className="border-t pt-2 mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs">نوع الإجراء *</Label>
              <Input value={actionType} onChange={(e) => setActionType(e.target.value)} className="text-sm" placeholder="تدريب / تدقيق / ..." />
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs">الوصف</Label>
              <Textarea value={actionDesc} onChange={(e) => setActionDesc(e.target.value)} rows={1} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs">الاستحقاق</Label>
              <Input type="date" value={actionDue} onChange={(e) => setActionDue(e.target.value)} className="text-sm" dir="ltr" />
            </div>
            <div className="md:col-span-4">
              <GuardedButton
                perm="governance:update"
                size="sm"
                onClick={submitAction}
                disabled={addActionMut.isPending}
                rateLimitAware
              >
                <Plus className="h-3 w-3 me-1" /> إضافة إجراء
              </GuardedButton>
            </div>
          </div>
        </CardContent>
      </Card>

      {id && <EntityComments entityType="policy" entityId={id} />}
      {id && <EntityTags entityType="policy" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={policy?.title || "تفاصيل السياسة"}
      subtitle={policy?.category}
      backPath="/governance/policies"
      refNumber={`POL-${id}`}
      status={
        policy
          ? { label: STATUS_LABELS[policy.status] || policy.status || "-", tone: statusTone(policy.status) }
          : undefined
      }
      typeLabel={policy?.category}
      createdAt={policy?.createdAt}
      updatedAt={policy?.updatedAt}
      createdByName={policy?.createdByName}
      assignedToName={policy?.owner || policy?.ownerName}
      relatedEntities={relatedEntities}
      entityType="policy"
      entityId={id ?? 0}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {policy && (
            <EntityPrintButton
              entityType="policy"
              entityId={id ?? 0}
              formats={["a4"]}/>
          )}
          <GuardedButton
            perm="governance:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={!policy || ["archived"].includes(policy?.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
