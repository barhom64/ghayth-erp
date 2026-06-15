import { useState } from "react";
import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useAppContext } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, RotateCcw, MessageSquare, ChevronDown, ChevronUp, History, ArrowLeftRight, ArrowUpCircle } from "lucide-react";
import { ImpactCard } from "@/components/impact-card";
import { actionLabel } from "@/lib/action-labels";
import { FormShell } from "@workspace/ui-core";

export type ApprovalActionType = "approve" | "reject" | "return" | "refer" | "escalate";

// Which flat `module:action` permission represents "may decide this kind of
// request". The frontend permission vocabulary (role_permissions, surfaced via
// can()) is CRUD-style: only HR carries a distinct `approve` action; for the
// finance/support tracks the decision authority is the module's `update` perm
// (mirrors the backend approve routes, which authorize action:"update"). Owners
// and `*`/`module:*` holders pass automatically inside can(). Entity types not
// listed here (e.g. governance/requests, which have no flat perm) are left
// ungated — the server still enforces on click.
const ENTITY_APPROVE_PERM: Record<string, string> = {
  leave: "hr:approve",
  loan: "hr:approve",
  overtime: "hr:approve",
  exit: "hr:approve",
  violation: "hr:approve",
  excuse: "hr:approve",
  transfer: "hr:approve",
  expense: "finance:update",
  custody: "finance:update",
  budget: "finance:update",
  invoice: "finance:update",
  voucher: "finance:update",
  receivable: "finance:update",
  commitment: "finance:update",
  ticket: "support:update",
};

export interface ApprovalActionsProps {
  entityType: string;
  entityId: number;
  currentStatus?: string;
  /**
   * Permission(s) required to see the decision controls. Defaults to a
   * sensible per-entityType mapping (ENTITY_APPROVE_PERM). The user sees the
   * approve/reject/return buttons only when can(perm) is true — so a viewer
   * without approval authority gets no actionable buttons (the server enforces
   * the same on submit). Pass explicitly to override the default.
   */
  perm?: string | string[];
  approveEndpoint?: string;
  rejectEndpoint?: string;
  returnEndpoint?: string;
  referEndpoint?: string;
  escalateEndpoint?: string;
  approveMethod?: string;
  rejectMethod?: string;
  returnMethod?: string;
  referMethod?: string;
  escalateMethod?: string;
  approveBody?: (notes: string) => any;
  rejectBody?: (notes: string) => any;
  returnBody?: (notes: string) => any;
  referBody?: (notes: string, referredTo?: string) => any;
  escalateBody?: (notes: string) => any;
  pendingStatuses?: string[];
  onDone?: () => void;
  invalidateKeys?: string[][];
  /**
   * #2239 (FIN-P9-APPROVAL-WORKSPACE) — when the surrounding decision workspace
   * has determined the document cannot be approved (e.g. journal-preview
   * blockers, a missing required attachment), it disables only the approve
   * button and surfaces the reason. reject/return stay enabled. Optional and
   * fully back-compatible: callers that omit it behave exactly as before.
   */
  approveDisabled?: boolean;
  approveDisabledReason?: string;
}

const defaultPendingStatuses = ["pending", "in_review", "returned", "draft"];

export function ApprovalActions({
  entityType,
  entityId,
  currentStatus = "pending",
  approveEndpoint,
  rejectEndpoint,
  returnEndpoint,
  referEndpoint,
  escalateEndpoint,
  approveMethod = "POST",
  rejectMethod = "POST",
  returnMethod = "POST",
  referMethod = "POST",
  escalateMethod = "POST",
  approveBody,
  rejectBody,
  returnBody,
  referBody,
  escalateBody,
  perm,
  pendingStatuses = defaultPendingStatuses,
  onDone,
  invalidateKeys,
  approveDisabled = false,
  approveDisabledReason,
}: ApprovalActionsProps) {
  const [action, setAction] = useState<ApprovalActionType | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { can } = useAppContext();

  if (!pendingStatuses.includes(currentStatus)) return null;

  // Permission gate: hide the decision controls entirely when the viewer lacks
  // approval authority for this entity type. Unmapped types (no default + no
  // explicit perm) stay visible — the server is the source of truth on submit.
  const gatePerm = perm ?? ENTITY_APPROVE_PERM[entityType];
  if (gatePerm) {
    const list = Array.isArray(gatePerm) ? gatePerm : [gatePerm];
    if (!list.some(can)) return null;
  }

  const handleAction = async (actionType: ApprovalActionType, notes: string, referredTo: string) => {
    try {
      let endpoint = "";
      let method = "POST";
      let body: any = { notes: notes.trim() || undefined };

      if (actionType === "approve") {
        endpoint = approveEndpoint || `/requests/${entityId}/approve`;
        method = approveMethod;
        body = approveBody ? approveBody(notes.trim()) : body;
      } else if (actionType === "reject") {
        endpoint = rejectEndpoint || `/requests/${entityId}/reject`;
        method = rejectMethod;
        body = rejectBody ? rejectBody(notes.trim()) : body;
      } else if (actionType === "return") {
        endpoint = returnEndpoint || `/requests/${entityId}/return`;
        method = returnMethod;
        body = returnBody ? returnBody(notes.trim()) : body;
      } else if (actionType === "refer") {
        endpoint = referEndpoint || `/workflows/${entityId}/refer`;
        method = referMethod;
        body = referBody
          ? referBody(notes.trim(), referredTo.trim())
          : { notes: notes.trim() || undefined, referredTo: referredTo.trim(), referredToName: referredTo.trim() };
      } else if (actionType === "escalate") {
        endpoint = escalateEndpoint || `/workflows/${entityId}/escalate`;
        method = escalateMethod;
        body = escalateBody ? escalateBody(notes.trim()) : { notes: notes.trim() };
      }

      await apiFetch(endpoint, {
        method,
        body: JSON.stringify(body),
      });
      const labels: Record<string, string> = {
        approve: "تمت الموافقة",
        reject: "تم الرفض",
        return: "تم الإرجاع",
        refer: "تمت الإحالة",
        escalate: "تم التصعيد",
      };
      toast({ title: labels[actionType] });
      setAction(null);
      if (invalidateKeys) {
        invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      }
      onDone?.();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message || "حدث خطأ" });
      throw err;
    }
  };

  if (!action) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-status-success-foreground hover:bg-status-success-surface hover:text-status-success-foreground"
          onClick={() => setAction("approve")}
          disabled={approveDisabled}
          title={approveDisabled ? approveDisabledReason : undefined}
        >
          <CheckCircle className="h-3.5 w-3.5 me-1" />قبول
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-status-error-foreground hover:bg-status-error-surface hover:text-status-error-foreground" onClick={() => setAction("reject")}>
          <XCircle className="h-3.5 w-3.5 me-1" />رفض
        </Button>
        {returnEndpoint !== undefined && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-orange-600 hover:bg-orange-50 hover:text-orange-700" onClick={() => setAction("return")}>
            <RotateCcw className="h-3.5 w-3.5 me-1" />إرجاع
          </Button>
        )}
        {referEndpoint !== undefined && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700" onClick={() => setAction("refer")}>
            <ArrowLeftRight className="h-3.5 w-3.5 me-1" />إحالة
          </Button>
        )}
        {escalateEndpoint !== undefined && (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-purple-600 hover:bg-purple-50 hover:text-purple-700" onClick={() => setAction("escalate")}>
            <ArrowUpCircle className="h-3.5 w-3.5 me-1" />تصعيد
          </Button>
        )}
        {approveDisabled && approveDisabledReason && (
          <p className="basis-full text-xs text-status-error-foreground flex items-start gap-1">
            <XCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{approveDisabledReason}</span>
          </p>
        )}
      </div>
    );
  }

  // Verbs come from the canonical lib/action-labels so this dialog reads
  // the same as the success toasts and audit-log timeline.
  const actionColors: Record<ApprovalActionType, string> = {
    approve: "bg-green-600 hover:bg-green-700",
    reject: "bg-red-600 hover:bg-red-700",
    return: "bg-orange-600 hover:bg-orange-700",
    refer: "bg-indigo-600 hover:bg-indigo-700",
    escalate: "bg-purple-600 hover:bg-purple-700",
  };
  const notesPlaceholders: Record<ApprovalActionType, string> = {
    approve: "ملاحظات (اختياري)...",
    reject: "سبب الرفض (مطلوب)...",
    return: "سبب الإرجاع (مطلوب)...",
    refer: "ملاحظات الإحالة (اختياري)...",
    escalate: "سبب التصعيد (مطلوب)...",
  };

  // Schema flips per action: notes is required only when the verb
  // *needs* a reason, and referredTo is required only for refer.
  const notesRequired = action === "reject" || action === "return" || action === "escalate";
  const referRequired = action === "refer";
  const schema = z.object({
    notes: notesRequired ? z.string().trim().min(1, "السبب مطلوب") : z.string(),
    referredTo: referRequired
      ? z.string().trim().min(1, "يجب تحديد الشخص المحال إليه")
      : z.string(),
  });
  type FormValues = z.infer<typeof schema>;

  return (
    <FormShell
      // Remount on each action switch so the schema/defaults re-seed
      // without an explicit reset call.
      key={action}
      schema={schema}
      defaultValues={{ notes: "", referredTo: "" } as FormValues}
      hideSubmit
      className="bg-surface-subtle rounded-lg p-3 border"
      onSubmit={(values) => handleAction(action, values.notes, values.referredTo)}
    >
      <ImpactCard entityType={entityType} entityId={entityId} action={action} />
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4" />
        {actionLabel(action)}
      </div>
      {action === "refer" && <ReferredToField />}
      <NotesField placeholder={notesPlaceholders[action]} autoFocus={action !== "refer"} />
      <div className="flex gap-2">
        <ApprovalSubmitButton className={actionColors[action]} />
        <Button type="button" size="sm" variant="ghost" onClick={() => setAction(null)}>إلغاء</Button>
      </div>
    </FormShell>
  );
}

function ReferredToField() {
  const { register } = useFormContext<{ notes: string; referredTo: string }>();
  return (
    <div>
      <Label className="text-xs mb-1">المحال إليه *</Label>
      <Input
        className="h-8 text-sm"
        placeholder="اسم الشخص أو الجهة المحال إليها..."
        autoFocus
        {...register("referredTo")}
      />
    </div>
  );
}

function NotesField({ placeholder, autoFocus }: { placeholder: string; autoFocus: boolean }) {
  const { register } = useFormContext<{ notes: string; referredTo: string }>();
  return (
    <textarea
      className="w-full border rounded-md p-2 text-sm resize-none"
      rows={2}
      placeholder={placeholder}
      autoFocus={autoFocus}
      {...register("notes")}
    />
  );
}

function ApprovalSubmitButton({ className }: { className: string }) {
  const { formState } = useFormContext();
  return (
    <Button type="submit" size="sm" className={className} rateLimitAware disabled={formState.isSubmitting}>
      {formState.isSubmitting ? "جاري..." : "تأكيد"}
    </Button>
  );
}

export interface ActionHistoryProps {
  entityType: string;
  entityId: number;
  defaultOpen?: boolean;
}

const actionLabelsMap: Record<string, { label: string; color: string }> = {
  approved: { label: "موافقة", color: "text-status-success-foreground" },
  rejected: { label: "رفض", color: "text-status-error-foreground" },
  returned: { label: "إرجاع", color: "text-orange-600" },
  in_review: { label: "مراجعة", color: "text-status-info-foreground" },
  escalated: { label: "تصعيد", color: "text-purple-600" },
  referred: { label: "إحالة", color: "text-indigo-600" },
};

export function ActionHistory({ entityType, entityId, defaultOpen = false }: ActionHistoryProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { data } = useApiQuery<any>(["approval-actions", entityType, String(entityId)], `/approval-actions/${entityType}/${entityId}`, !!open);
  const actions = data?.data || [];

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-muted-foreground">
        <History className="h-3 w-3" />
        سجل الإجراءات
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && actions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {actions.map((a: any) => (
            <div key={a.id} className="flex items-start gap-2 text-xs bg-surface-subtle rounded p-2 border">
              <span className={cn("font-medium", actionLabelsMap[a.action]?.color || "text-muted-foreground")}>
                {actionLabelsMap[a.action]?.label || a.action}
              </span>
              <span className="text-muted-foreground">&bull;</span>
              <span className="text-muted-foreground">{a.actionByEmail || a.actionByName || "النظام"}</span>
              {a.notes && <><span className="text-muted-foreground">&bull;</span><span className="text-muted-foreground flex-1">{a.notes}</span></>}
              <span className="text-muted-foreground ms-auto">{formatDateAr(a.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
      {open && actions.length === 0 && <p className="text-xs text-muted-foreground mt-1">لا توجد إجراءات سابقة</p>}
    </div>
  );
}

export interface NotesDisplayProps {
  status: string;
  notes?: string;
  returnReason?: string;
  rejectionReason?: string;
}

export function NotesDisplay({ status, notes, returnReason, rejectionReason }: NotesDisplayProps) {
  if (status === "returned" && (returnReason || notes)) {
    return (
      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 text-xs font-normal max-w-48 truncate">
        سبب الإرجاع: {returnReason || notes}
      </Badge>
    );
  }
  if (status === "rejected" && (rejectionReason || notes)) {
    return (
      <Badge variant="outline" className="bg-status-error-surface text-status-error-foreground border-status-error-surface text-xs font-normal max-w-48 truncate">
        سبب الرفض: {rejectionReason || notes}
      </Badge>
    );
  }
  return null;
}
