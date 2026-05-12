import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, RotateCcw, MessageSquare, ChevronDown, ChevronUp, History, ArrowLeftRight, ArrowUpCircle } from "lucide-react";
import { ImpactCard } from "@/components/impact-card";
import { actionLabel } from "@/lib/action-labels";

export type ApprovalActionType = "approve" | "reject" | "return" | "refer" | "escalate";

export interface ApprovalActionsProps {
  entityType: string;
  entityId: number;
  currentStatus?: string;
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
  pendingStatuses = defaultPendingStatuses,
  onDone,
  invalidateKeys,
}: ApprovalActionsProps) {
  const [action, setAction] = useState<ApprovalActionType | null>(null);
  const [notes, setNotes] = useState("");
  const [referredTo, setReferredTo] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  if (!pendingStatuses.includes(currentStatus)) return null;

  const handleAction = async (actionType: ApprovalActionType) => {
    if ((actionType === "reject" || actionType === "return" || actionType === "escalate") && !notes.trim()) {
      const labels: Record<string, string> = { reject: "يجب ذكر سبب الرفض", return: "يجب ذكر سبب الإرجاع", escalate: "يجب ذكر سبب التصعيد" };
      toast({ variant: "destructive", title: labels[actionType] });
      return;
    }
    if (actionType === "refer" && !referredTo.trim()) {
      toast({ variant: "destructive", title: "يجب تحديد الشخص المحال إليه" });
      return;
    }
    setLoading(true);
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
      setNotes("");
      setReferredTo("");
      if (invalidateKeys) {
        invalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
      }
      onDone?.();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message || "حدث خطأ" });
    } finally {
      setLoading(false);
    }
  };

  if (!action) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:bg-green-50 hover:text-green-700" onClick={() => setAction("approve")}>
          <CheckCircle className="h-3.5 w-3.5 me-1" />قبول
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setAction("reject")}>
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
  const notesRequired = action === "reject" || action === "return" || action === "escalate";
  const notesPlaceholders: Record<ApprovalActionType, string> = {
    approve: "ملاحظات (اختياري)...",
    reject: "سبب الرفض (مطلوب)...",
    return: "سبب الإرجاع (مطلوب)...",
    refer: "ملاحظات الإحالة (اختياري)...",
    escalate: "سبب التصعيد (مطلوب)...",
  };

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2 border">
      <ImpactCard entityType={entityType} entityId={entityId} action={action} />
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4" />
        {actionLabel(action)}
      </div>
      {action === "refer" && (
        <div>
          <Label className="text-xs mb-1">المحال إليه *</Label>
          <Input
            className="h-8 text-sm"
            placeholder="اسم الشخص أو الجهة المحال إليها..."
            value={referredTo}
            onChange={(e) => setReferredTo(e.target.value)}
            autoFocus
          />
        </div>
      )}
      <textarea
        className="w-full border rounded-md p-2 text-sm resize-none"
        rows={2}
        placeholder={notesPlaceholders[action]}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        autoFocus={action !== "refer"}
      />
      <div className="flex gap-2">
        <Button size="sm" className={actionColors[action]} onClick={() => handleAction(action)} disabled={loading}>
          {loading ? "جارٍ..." : "تأكيد"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setAction(null); setNotes(""); setReferredTo(""); }}>إلغاء</Button>
      </div>
    </div>
  );
}

export interface ActionHistoryProps {
  entityType: string;
  entityId: number;
  defaultOpen?: boolean;
}

const actionLabelsMap: Record<string, { label: string; color: string }> = {
  approved: { label: "موافقة", color: "text-green-600" },
  rejected: { label: "رفض", color: "text-red-600" },
  returned: { label: "إرجاع", color: "text-orange-600" },
  in_review: { label: "مراجعة", color: "text-blue-600" },
  escalated: { label: "تصعيد", color: "text-purple-600" },
  referred: { label: "إحالة", color: "text-indigo-600" },
};

export function ActionHistory({ entityType, entityId, defaultOpen = false }: ActionHistoryProps) {
  const [open, setOpen] = useState(defaultOpen);
  const { data } = useApiQuery<any>(["approval-actions", entityType, String(entityId)], `/approval-actions/${entityType}/${entityId}`, !!open);
  const actions = data?.data || [];

  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
        <History className="h-3 w-3" />
        سجل الإجراءات
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && actions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {actions.map((a: any) => (
            <div key={a.id} className="flex items-start gap-2 text-xs bg-gray-50 rounded p-2 border">
              <span className={cn("font-medium", actionLabelsMap[a.action]?.color || "text-gray-600")}>
                {actionLabelsMap[a.action]?.label || a.action}
              </span>
              <span className="text-gray-400">&bull;</span>
              <span className="text-gray-500">{a.actionByEmail || a.actionByName || "النظام"}</span>
              {a.notes && <><span className="text-gray-400">&bull;</span><span className="text-gray-600 flex-1">{a.notes}</span></>}
              <span className="text-gray-400 ms-auto">{formatDateAr(a.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
      {open && actions.length === 0 && <p className="text-xs text-gray-400 mt-1">لا توجد إجراءات سابقة</p>}
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
      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs font-normal max-w-48 truncate">
        سبب الرفض: {rejectionReason || notes}
      </Badge>
    );
  }
  return null;
}
