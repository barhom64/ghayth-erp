import { useMemo, useState } from "react";
import { useRoute } from "wouter";
import { z } from "zod";
import { useApiQuery, useApiMutation } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
} from "@workspace/entity-kit";
import { FormGrid, FormTextField, FormTextareaField, FormSelectField, FormNumberField } from "@workspace/ui-core";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { EntityPnlButton } from "@/components/shared/entity-pnl-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ApprovalActions removed — contracts use direct status PATCH, no approval flow.
import { Edit, FileText, RefreshCw, XCircle } from "lucide-react";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { formatCurrency, formatDateAr, todayLocal, currentYearRiyadh } from "@/lib/formatters";
import { useToast } from "@/hooks/use-toast";
import { EntityTags } from "@/components/shared/entity-tags";

const STATUS_LABELS: Record<string, string> = {
  draft: "مسودة",
  active: "ساري",
  expired: "منتهي",
  terminated: "منهي",
  suspended: "معلق",
  under_review: "قيد المراجعة",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  service: "خدمات",
  supply: "توريد",
  lease: "إيجار",
  employment: "توظيف",
  partnership: "شراكة",
  nda: "سرية",
  consulting: "استشارات",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "active") return "success" as const;
  if (["terminated", "expired"].includes(status)) return "destructive" as const;
  if (status === "suspended") return "warning" as const;
  if (status === "under_review") return "info" as const;
  return "default" as const;
}

const contractEditSchema = z.object({
  title: z.string().min(1, "العنوان مطلوب"),
  partyName: z.string().min(1, "اسم الطرف الآخر مطلوب"),
  partyContact: z.string().optional().default(""),
  contractType: z.string().optional().default(""),
  value: z.coerce.number().optional().default(0),
  startDate: z.string().optional().default(""),
  endDate: z.string().optional().default(""),
  status: z.enum(["draft", "active", "pending_renewal"]),
  notes: z.string().optional().default(""),
});
type ContractEditForm = z.infer<typeof contractEditSchema>;

export default function LegalContractDetail() {
  const [, params] = useRoute("/legal/contracts/:id");
  const id = params?.id ? Number(params.id) : null;
  const [editOpen, setEditOpen] = useState(false);

  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["legal-contract", String(id)],
    id ? `/legal/contracts/${id}` : null,
    !!id
  );

  const contract = data;

  // Renew + Terminate wire the dedicated /:id/renew and /:id/terminate
  // endpoints (applyTransition pipelines). Both prompt for the minimum
  // required field; the full overrides are documented on the backend
  // schemas (newValue/notes for renew, effectiveDate for terminate).
  const renewMut = useApiMutation<any, { id: number; newEndDate: string }>(
    (b) => `/legal/contracts/${b.id}/renew`,
    "POST",
    [["legal-contract", String(id)], ["legal-contracts"]],
    { successMessage: "تم تجديد العقد" },
  );
  const terminateMut = useApiMutation<any, { id: number; reason: string }>(
    (b) => `/legal/contracts/${b.id}/terminate`,
    "POST",
    [["legal-contract", String(id)], ["legal-contracts"]],
    { successMessage: "تم إنهاء العقد" },
  );

  // Renew + terminate dialog state — replaces 2 window.prompt calls.
  const [renewOpen, setRenewOpen] = useState(false);
  const [renewDate, setRenewDate] = useState("");
  const handleRenew = () => {
    if (!id) return;
    // Default-suggest "today + 1y" using Riyadh wall-clock components
    // (Task #433 — finance-period-drift forbids raw `new Date()` year math).
    const year = currentYearRiyadh() + 1;
    const today = todayLocal();
    setRenewDate(`${year}-${today.slice(5)}`);
    setRenewOpen(true);
  };
  const confirmRenew = () => {
    if (!id || !renewDate) return;
    setRenewOpen(false);
    renewMut.mutate({ id, newEndDate: renewDate });
  };

  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateReason, setTerminateReason] = useState("");
  const handleTerminate = () => {
    if (!id) return;
    setTerminateReason("");
    setTerminateOpen(true);
  };
  const confirmTerminate = () => {
    if (!id) return;
    if (!terminateReason.trim()) {
      toast({ variant: "destructive", title: "سبب الإنهاء مطلوب" });
      return;
    }
    setTerminateOpen(false);
    terminateMut.mutate({ id, reason: terminateReason.trim() });
  };

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!contract) return out;
    if (contract.projectId) {
      out.push({
        type: "project",
        id: contract.projectId,
        label: contract.projectName || `مشروع #${contract.projectId}`,
        sublabel: "المشروع",
        href: `/projects/${contract.projectId}`,
      });
    }
    if (contract.clientId) {
      out.push({
        type: "client",
        id: contract.clientId,
        label: contract.clientName || `عميل #${contract.clientId}`,
        sublabel: "العميل",
        href: `/clients/${contract.clientId}`,
      });
    }
    if (contract.vendorId) {
      out.push({
        type: "vendor",
        id: contract.vendorId,
        label: contract.vendorName || `مورد #${contract.vendorId}`,
        sublabel: "المورد",
        href: `/finance/vendors/${contract.vendorId}`,
      });
    }
    return out;
  }, [contract]);


  const { extraTabs, hideTabs } = useRegistryTabs("legal_contract", id ?? 0);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            بيانات العقد
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* Hero value */}
          {contract?.value != null && (
            <div className="flex items-baseline gap-2 border-b pb-3">
              <span className="text-3xl font-bold text-gray-900">
                {formatCurrency(contract.value)}
              </span>
              <span className="text-xs text-muted-foreground">ر.س</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {contract?.ref && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">رقم العقد</p>
                <span className="text-status-neutral-foreground font-mono text-xs">{contract.ref}</span>
              </div>
            )}
            {contract?.contractType && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">نوع العقد</p>
                <Badge variant="outline">
                  {CONTRACT_TYPE_LABELS[contract.contractType] || contract.contractType}
                </Badge>
              </div>
            )}
            {contract?.partyName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الطرف الأول</p>
                <span className="text-status-neutral-foreground">{contract.partyA}</span>
              </div>
            )}
            {contract?.partyContact && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">الطرف الثاني</p>
                <span className="text-status-neutral-foreground">{contract.partyB}</span>
              </div>
            )}
            {contract?.startDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ البداية</p>
                <span className="text-status-neutral-foreground">{formatDateAr(contract.startDate)}</span>
              </div>
            )}
            {contract?.endDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ النهاية</p>
                <span className="text-status-neutral-foreground">{formatDateAr(contract.endDate)}</span>
              </div>
            )}
            {contract?.paymentTerms && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">شروط الدفع</p>
                <span className="text-status-neutral-foreground">{contract.paymentTerms}</span>
              </div>
            )}
          </div>

          {(contract?.scope || contract?.description) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">نطاق العقد / الوصف</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{contract.scope || contract.description}</p>
            </div>
          )}

          {contract?.specialClauses && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">بنود خاصة</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{contract.specialClauses}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {/* Legal contracts have no approve/reject lifecycle — status enum
            is draft/active/expired/terminated/renewed, transitioned via
            PATCH /:id status field or /renew & /terminate endpoints. */}

        {/* Additional info card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">معلومات إضافية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {contract?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنشاء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(contract.createdAt)}</span>
              </div>
            )}
            {contract?.createdByName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">أنشئ بواسطة</p>
                <span className="text-status-neutral-foreground">{contract.createdByName}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );

  return (
    <>
    <DetailPageLayout
      title={contract?.title || "تفاصيل العقد"}
      subtitle={contract?.type ? CONTRACT_TYPE_LABELS[contract.type] || contract.type : undefined}
      backPath="/legal/contracts"
      refNumber={contract?.contractNumber || (id ? `LC-${id}` : undefined)}
      status={
        contract
          ? { label: STATUS_LABELS[contract.status] || contract.status || "-", tone: statusTone(contract.status) }
          : undefined
      }
      typeLabel={contract?.type ? CONTRACT_TYPE_LABELS[contract.type] || contract.type : undefined}
      createdAt={contract?.createdAt}
      updatedAt={contract?.updatedAt}
      createdByName={contract?.createdByName}
      relatedEntities={relatedEntities}
      entityType="legal-contract"
      entityId={id ?? 0}
      overview={overview}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      actions={
        <>
          {contract && (
            <PrintButton
              entityType="legal_contract"
              entityId={contract.id ?? id}
             />
          )}
          {contract?.id != null && (
            <EntityPnlButton entityType="contract" entityId={Number(contract.id)} />
          )}
          <GuardedButton
            perm="legal:update"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            disabled={!contract || ["terminated", "renewed", "expired"].includes(contract?.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
          <GuardedButton
            perm="legal:create"
            variant="outline"
            size="sm"
            onClick={handleRenew}
            disabled={!contract || renewMut.isPending || ["terminated", "renewed", "expired"].includes(contract?.status)}
          >
            <RefreshCw className="h-4 w-4 ms-1" />
            تجديد
          </GuardedButton>
          <GuardedButton
            perm="legal:create"
            variant="outline"
            size="sm"
            className="text-status-error-foreground"
            onClick={handleTerminate}
            disabled={!contract || terminateMut.isPending || ["terminated", "renewed", "expired"].includes(contract?.status)}
          >
            <XCircle className="h-4 w-4 ms-1" />
            إنهاء
          </GuardedButton>
        </>
      }
    />
    <Dialog open={renewOpen} onOpenChange={setRenewOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تجديد العقد</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">تاريخ نهاية التجديد</Label>
          <Input type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRenewOpen(false)}>إلغاء</Button>
          <Button onClick={confirmRenew} disabled={!renewDate} rateLimitAware>تجديد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={terminateOpen} onOpenChange={setTerminateOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إنهاء العقد</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">سبب الإنهاء (مطلوب)</Label>
          <Textarea value={terminateReason} onChange={(e) => setTerminateReason(e.target.value)} rows={3} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setTerminateOpen(false)}>إلغاء</Button>
          <Button variant="destructive" onClick={confirmTerminate} rateLimitAware>تأكيد الإنهاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    {contract && id && (
      <EntityEditDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل العقد"
        schema={contractEditSchema}
        defaultValues={{
          title: contract.title ?? "",
          partyName: contract.partyName ?? "",
          partyContact: contract.partyContact ?? "",
          contractType: contract.contractType ?? "",
          value: Number(contract.value ?? 0),
          startDate: contract.startDate ?? "",
          endDate: contract.endDate ?? "",
          status: (contract.status === "active" || contract.status === "pending_renewal" ? contract.status : "draft") as ContractEditForm["status"],
          notes: contract.notes ?? "",
        }}
        endpoint={`/legal/contracts/${id}`}
        invalidateKeys={[["legal-contract", String(id)], ["legal-contracts"]]}
        onSaved={() => refetch()}
      >
        <FormGrid cols={2}>
          <FormTextField name="title" label="عنوان العقد" required className="md:col-span-2" />
          <FormTextField name="partyName" label="الطرف الآخر" required />
          <FormTextField name="partyContact" label="جهة الاتصال" />
          <FormTextField name="contractType" label="نوع العقد" />
          <FormNumberField name="value" label="القيمة" />
          <FormTextField name="startDate" label="تاريخ البداية" type="date" />
          <FormTextField name="endDate" label="تاريخ النهاية" type="date" />
          <FormSelectField
            name="status"
            label="الحالة"
            options={[
              { value: "draft", label: "مسودة" },
              { value: "active", label: "ساري" },
              { value: "pending_renewal", label: "بانتظار التجديد" },
            ]}
          />
          <FormTextareaField name="notes" label="ملاحظات" className="md:col-span-2" />
        </FormGrid>
      </EntityEditDialog>
    )}
    </>
  );
}
