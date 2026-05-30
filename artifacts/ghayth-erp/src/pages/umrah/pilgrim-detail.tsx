import { useState } from "react";
import { z } from "zod";
import { formatDateAr, formatCurrency } from "@/lib/formatters";
import { useRoute, useLocation } from "wouter";
import { useApiQuery, apiFetch, asList } from "@/lib/api";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { EntityEditDialog } from "@/components/shared/entity-edit-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
  FormGrid,
  FormTextField,
  FormTextareaField,
  FormSelectField,
} from "@workspace/ui-core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Save, User, Calendar, AlertTriangle, Trash2, Edit, UserCog, ShieldOff } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DetailPageLayout } from "@workspace/entity-kit";
import { UmrahAttachmentsPanel } from "@/components/shared/umrah-attachments-panel";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { PrintButton } from "@/components/shared/print-button";
import {
  useDetailEditDelete,
  DetailActionButtons,
} from "@/components/shared/detail-edit-delete-actions";

const STATUS_OPTIONS = [
  { value: "pending", label: "لم يصل" },
  { value: "arrived", label: "وصل" },
  { value: "active", label: "نشط" },
  { value: "overstayed", label: "متأخر" },
  { value: "departed", label: "غادر" },
  { value: "violated", label: "مخالف" },
  { value: "cancelled", label: "ملغي" },
];

const STATUS_TONES: Record<string, "success" | "warning" | "info" | "muted" | "destructive" | "default"> = {
  pending: "muted",
  arrived: "info",
  active: "success",
  overstayed: "warning",
  departed: "muted",
  violated: "destructive",
  cancelled: "destructive",
};

const pilgrimEditSchema = z.object({
  fullName: z.string().min(1, "الاسم مطلوب"),
  nationality: z.string().optional().default(""),
  gender: z.enum(["male", "female", ""]).optional().default(""),
  phone: z.string().optional().default(""),
  hotelName: z.string().optional().default(""),
  roomNumber: z.string().optional().default(""),
  notes: z.string().optional().default(""),
});
type PilgrimEditForm = z.infer<typeof pilgrimEditSchema>;

// Reassign schema: keeps both ids as strings on the wire. Empty string
// means "no agent / no sub-agent" — the backend's patchPilgrimSchema
// pre-processes "" → null before zod's coerce.number, so an explicit
// unassign survives the round-trip.
const pilgrimReassignSchema = z.object({
  agentId: z.string().optional().default(""),
  subAgentId: z.string().optional().default(""),
});
type PilgrimReassignForm = z.input<typeof pilgrimReassignSchema>;

export default function PilgrimDetail() {
  const [, params] = useRoute("/umrah/pilgrims/:id");
  const id = params?.id || "";
  const { extraTabs, hideTabs } = useRegistryTabs("pilgrim", id ?? "");
  const { data, refetch, isLoading, isError } = useApiQuery<any>(["umrah-pilgrim", id], `/umrah/pilgrims/${id}`);
  const [newStatus, setNewStatus] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  // Overstay-exemption (migration 242 / PR #1482). The card lives
  // below the trip data; reason is a textarea so the operator can
  // type a sentence ("تأخّر مستشفى - تقرير مرفق", etc.).
  const [exemptionReason, setExemptionReason] = useState("");
  const [savingExemption, setSavingExemption] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Agents + sub-agents for the reassign modal dropdowns. Both list
  // endpoints already scope by company in the backend.
  const { data: agentsResp } = useApiQuery<any>(["umrah-agents"], "/umrah/agents");
  const agents = asList(agentsResp?.data || agentsResp) as Array<{ id: number; name: string }>;
  const { data: subAgentsResp } = useApiQuery<any>(["umrah-sub-agents"], "/umrah/sub-agents");
  const subAgents = asList(subAgentsResp?.data || subAgentsResp) as Array<{ id: number; name: string }>;

  // DELETE /umrah/pilgrims/:id soft-delete. Edit happens through the
  // status select above, so we only expose delete here.
  const editDelete = useDetailEditDelete({
    entityLabel: "المعتمر",
    patchPath: `/umrah/pilgrims/${id}`,
    deletePath: `/umrah/pilgrims/${id}`,
    listPath: "/umrah/pilgrims",
    initialValues: data,
    fields: [
      { key: "phone", label: "الهاتف" },
      { key: "roomNumber", label: "رقم الغرفة" },
      { key: "hotelName", label: "الفندق" },
    ],
    invalidateKeys: [["umrah-pilgrim", id], ["umrah-pilgrims"]],
    onSaved: () => refetch(),
  });

  const updateStatus = async () => {
    if (!newStatus) return;
    try {
      await apiFetch(`/umrah/pilgrims/${id}`, { method: "PATCH", body: JSON.stringify({ status: newStatus }) });
      toast({ title: "تم تحديث الحالة" });
      setNewStatus("");
      refetch();
    } catch { toast({ variant: "destructive", title: "خطأ في التحديث" }); }
  };

  // Toggle overstay exemption (PR #1482). Adding an exemption requires
  // a reason; removing one doesn't. The backend re-validates and writes
  // server-side audit metadata (overstayExemptBy + overstayExemptAt).
  const toggleExemption = async (exempt: boolean) => {
    setSavingExemption(true);
    try {
      const body: { overstayExempt: boolean; overstayExemptReason?: string } = {
        overstayExempt: exempt,
      };
      if (exempt) {
        const reason = exemptionReason.trim();
        if (!reason) {
          toast({
            variant: "destructive",
            title: "السبب مطلوب",
            description: "اكتب سبباً واضحاً للاستثناء قبل التفعيل",
          });
          setSavingExemption(false);
          return;
        }
        body.overstayExemptReason = reason;
      }
      await apiFetch(`/umrah/pilgrims/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast({
        title: exempt ? "تم استثناء المعتمر" : "أُلغي الاستثناء",
        description: exempt ? "لن يدخل ضمن المسح اليومي للتأخّر" : "سيُمسح ضمن المسح اليومي للتأخّر",
      });
      setExemptionReason("");
      refetch();
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "خطأ في الحفظ",
        description: e?.message ?? "فشل تحديث حالة الاستثناء",
      });
    } finally {
      setSavingExemption(false);
    }
  };

  const personalFields = [
    // NUSK is the primary operator-facing identifier — NUSK + MOFA both
    // print it on every official document. Goes FIRST so it's the eye's
    // landing point when the page opens.
    { label: "رقم نسك", value: data?.nuskNumber },
    { label: "الاسم الكامل", value: data?.fullName },
    { label: "رقم الجواز", value: data?.passportNumber },
    { label: "رقم التأشيرة", value: data?.visaNumber },
    // visaExpiry / mofaNumber / borderNumber surfaced because operators
    // routinely field calls asking these exact values — pre-PR they had
    // to drop the call and re-open the source Excel file to answer.
    { label: "صلاحية التأشيرة", value: data?.visaExpiry ? formatDateAr(data.visaExpiry) : "-" },
    { label: "رقم الموفا", value: data?.mofaNumber },
    { label: "رقم الحدود", value: data?.borderNumber },
    { label: "الجنسية", value: data?.nationality },
    { label: "الجنس", value: data?.gender === "male" ? "ذكر" : data?.gender === "female" ? "أنثى" : "-" },
    { label: "الهاتف", value: data?.phone },
  ];

  const tripFields = [
    { label: "الموسم", value: data?.seasonTitle },
    // Group + sub-agent complete the 3-tier organisational chain so the
    // operator sees who's responsible for the pilgrim end-to-end:
    //   pilgrim → sub-agent → primary agent → company group.
    { label: "المجموعة", value: data?.groupName },
    { label: "الوكيل الرئيسي", value: data?.agentName },
    { label: "الوكيل الفرعي", value: data?.subAgentName },
    { label: "الباقة", value: data?.packageName },
    { label: "تاريخ الوصول المخطط", value: data?.arrivalDate ? formatDateAr(data.arrivalDate) : "-" },
    { label: "تاريخ المغادرة المخطط", value: data?.departureDate ? formatDateAr(data.departureDate) : "-" },
    { label: "الوصول الفعلي", value: data?.actualArrival ? formatDateAr(data.actualArrival) : "-" },
    { label: "المغادرة الفعلية", value: data?.actualDeparture ? formatDateAr(data.actualDeparture) : "-" },
    // Flight numbers — pair with the pilgrims-list flight filter
    // (?flight=) and bulk-status flip for the canonical flight-day
    // workflow: search "PIA-310" → select all → mark arrived in one
    // click. Pre-PR the columns existed in DB but were invisible.
    { label: "رحلة الوصول", value: data?.entryFlight },
    { label: "رحلة المغادرة", value: data?.exitFlight },
    { label: "الفندق", value: data?.hotelName },
    { label: "رقم الغرفة", value: data?.roomNumber },
  ];

  const overview = (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><User className="h-4 w-4" />البيانات الشخصية</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {personalFields.map(f => (
            <div key={f.label}>
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="font-medium text-sm">{f.value || "-"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />بيانات الرحلة</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          {tripFields.map(f => (
            <div key={f.label}>
              <p className="text-xs text-muted-foreground">{f.label}</p>
              <p className="font-medium text-sm">{f.value || "-"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {(data?.penalties || []).length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-status-error" />الغرامات ({data.penalties.length})</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[
                { key: "type", header: "النوع", render: (p) => p.type === "overstay" ? "تجاوز مدة" : p.type },
                { key: "daysOverstayed", header: "أيام التأخر", render: (p) => `${p.daysOverstayed} يوم` },
                { key: "amount", header: "المبلغ", render: (p) => <span className="font-bold text-status-error-foreground">{formatCurrency(Number(p.amount))}</span> },
                { key: "status", header: "الحالة", render: (p) => <PageStatusBadge status={p.status} /> },
              ] as DataTableColumn<any>[]}
              data={data.penalties}
              noToolbar
              pageSize={0}
            />
          </CardContent>
        </Card>
      )}

      {/* Overstay-exemption card (PR #1482). Shows the active flag,
          the reason + audit metadata when exempt, and a toggle to
          flip it. Adding the exemption requires a non-empty reason
          (backend re-validates so the API stays honest even if the
          UI is bypassed). */}
      <Card
        className={data?.overstayExempt ? "border-status-warning-surface" : ""}
        data-testid="overstay-exemption-card"
      >
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldOff className="h-4 w-4" />
            استثناء غرامة التأخّر
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data?.overstayExempt ? (
            <>
              <div
                className="rounded-md border border-status-warning-surface bg-status-warning-surface/30 p-3 text-sm text-status-warning-foreground space-y-1"
                data-testid="exemption-active-banner"
              >
                <div className="font-semibold">المعتمر مستثنى من المسح اليومي للتأخّر</div>
                <div className="text-xs">
                  السبب: <span className="font-medium">{data.overstayExemptReason || "—"}</span>
                </div>
                {data.overstayExemptAt && (
                  <div className="text-xs">
                    منذ: {formatDateAr(data.overstayExemptAt)}
                  </div>
                )}
              </div>
              <GuardedButton
                perm="umrah:update"
                variant="outline"
                size="sm"
                onClick={() => toggleExemption(false)}
                disabled={savingExemption}
                data-testid="exemption-remove-button"
              >
                {savingExemption ? "جاري الحفظ..." : "إلغاء الاستثناء"}
              </GuardedButton>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                المسح اليومي سيُضيف غرامة تلقائياً إذا تجاوز المعتمر مدة البرنامج. استثنِه فقط عند
                اتفاق وكيل أو ظرف موثَّق (تأخّر مستشفى، تأخّر طيران…)
              </p>
              <div className="space-y-2">
                <Label htmlFor="exemption-reason">سبب الاستثناء</Label>
                <Textarea
                  id="exemption-reason"
                  data-testid="exemption-reason-input"
                  value={exemptionReason}
                  onChange={(e) => setExemptionReason(e.target.value)}
                  placeholder="اكتب سبباً واضحاً (مثل: تأخّر مستشفى — تقرير مرفق)"
                  rows={3}
                />
              </div>
              <GuardedButton
                perm="umrah:update"
                size="sm"
                onClick={() => toggleExemption(true)}
                disabled={!exemptionReason.trim() || savingExemption}
                data-testid="exemption-apply-button"
              >
                {savingExemption ? "جاري الحفظ..." : "تفعيل الاستثناء"}
              </GuardedButton>
            </>
          )}
        </CardContent>
      </Card>

      {data?.notes && (
        <Card>
          <CardHeader><CardTitle className="text-base">ملاحظات</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{data.notes}</p></CardContent>
        </Card>
      )}

      {data?.id && (
        <UmrahAttachmentsPanel entityType="mutamer" entityId={data.id} />
      )}
    </div>
  );

  const actions = (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={newStatus} onValueChange={setNewStatus}>
        <SelectTrigger className="w-[150px]"><SelectValue placeholder="تغيير الحالة" /></SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <GuardedButton perm="umrah:create" onClick={updateStatus} disabled={!newStatus} className="gap-2" size="sm">
        <Save className="h-4 w-4" />تحديث
      </GuardedButton>
      <GuardedButton
        perm="umrah:update"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setEditOpen(true)}
        disabled={!data}
      >
        <Edit className="h-4 w-4" />تعديل
      </GuardedButton>
      <GuardedButton
        perm="umrah:update"
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setReassignOpen(true)}
        disabled={!data}
        data-testid="pilgrim-reassign-button"
      >
        <UserCog className="h-4 w-4" />إعادة إسناد
      </GuardedButton>
      <GuardedButton
        perm="umrah:delete"
        variant="outline"
        size="sm"
        className="gap-2 text-status-error-foreground"
        onClick={() => setDeleteOpen(true)}
      >
        <Trash2 className="h-4 w-4" />حذف
      </GuardedButton>
    </div>
  );

  return (
    <>
    <DetailPageLayout
      title={data?.fullName || "المعتمر"}
      subtitle={`${data?.passportNumber || ""}${data?.nationality ? ` • ${data.nationality}` : ""}`}
      backPath="/umrah/pilgrims"
      backLabel="العودة"
      status={data?.status ? { label: STATUS_OPTIONS.find(o => o.value === data.status)?.label || data.status, tone: STATUS_TONES[data.status] || "default" } : undefined}
      entityType="pilgrim"
      entityId={data?.id || id}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      isLoading={isLoading}
      error={isError ? true : undefined}
      onRetry={() => refetch()}
      createdAt={data?.createdAt}
      updatedAt={data?.updatedAt}
      overview={overview}
      actions={
        <div className="flex items-center gap-2">
          {actions}
          <PrintButton entityType="umrah_pilgrim" entityId={(id as any) ?? 0} label="طباعة" />
          <DetailActionButtons hook={editDelete} editPerm="umrah:update" deletePerm="umrah:delete" />
        </div>
      }
    />
    {id && data && (
      <ConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        entity={{ type: "umrah-pilgrim", id: Number(id), name: data.fullName ?? `معتمر #${id}` }}
        deletePath={`/umrah/pilgrims/${id}`}
        invalidateKeys={[["umrah-pilgrims"]]}
        successMessage="تم حذف المعتمر"
        onDeleted={() => navigate("/umrah/pilgrims")}
      />
    )}
    {id && data && (
      <EntityEditDialog<PilgrimEditForm>
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="تعديل بيانات المعتمر"
        schema={pilgrimEditSchema}
        defaultValues={{
          fullName: data.fullName ?? "",
          nationality: data.nationality ?? "",
          gender: (data.gender ?? "") as PilgrimEditForm["gender"],
          phone: data.phone ?? "",
          hotelName: data.hotelName ?? "",
          roomNumber: data.roomNumber ?? "",
          notes: data.notes ?? "",
        }}
        endpoint={`/umrah/pilgrims/${id}`}
        invalidateKeys={[["umrah-pilgrim", id], ["umrah-pilgrims"]]}
        onSaved={() => refetch()}
      >
        <FormGrid cols={2}>
          <FormTextField name="fullName" label="الاسم الكامل" required className="md:col-span-2" />
          <FormTextField name="nationality" label="الجنسية" />
          <FormSelectField
            name="gender"
            label="الجنس"
            options={[
              { value: "", label: "—" },
              { value: "male", label: "ذكر" },
              { value: "female", label: "أنثى" },
            ]}
          />
          <FormTextField name="phone" label="الهاتف" />
          <FormTextField name="hotelName" label="الفندق" />
          <FormTextField name="roomNumber" label="رقم الغرفة" />
          <FormTextareaField name="notes" label="ملاحظات" className="md:col-span-2" />
        </FormGrid>
      </EntityEditDialog>
    )}
    {id && data && (
      <EntityEditDialog<PilgrimReassignForm>
        open={reassignOpen}
        onClose={() => setReassignOpen(false)}
        title="إعادة إسناد المعتمر"
        schema={pilgrimReassignSchema}
        // Pre-fill with the current assignment so the operator sees the
        // existing values; if they hit Save unchanged, the PATCH is a
        // no-op. The select's empty-string value maps to "no agent"
        // (transformed to null on submit).
        defaultValues={{
          agentId: data.agentId != null ? String(data.agentId) : "",
          subAgentId: data.subAgentId != null ? String(data.subAgentId) : "",
        }}
        endpoint={`/umrah/pilgrims/${id}`}
        invalidateKeys={[["umrah-pilgrim", id], ["umrah-pilgrims"]]}
        onSaved={() => refetch()}
      >
        <FormGrid cols={1}>
          <FormSelectField
            name="agentId"
            label="الوكيل الرئيسي"
            options={[
              { value: "", label: "— لا وكيل —" },
              ...agents.map((a) => ({ value: String(a.id), label: a.name })),
            ]}
          />
          <FormSelectField
            name="subAgentId"
            label="الوكيل الفرعي"
            options={[
              { value: "", label: "— لا وكيل فرعي —" },
              ...subAgents.map((a) => ({ value: String(a.id), label: a.name })),
            ]}
          />
        </FormGrid>
      </EntityEditDialog>
    )}
    </>
  );
}
