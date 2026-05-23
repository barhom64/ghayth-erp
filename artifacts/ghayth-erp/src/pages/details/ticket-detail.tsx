import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { formatDateAr, formatTimeAr } from "@/lib/formatters";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Headphones, User, MessageSquare, Send, Trash2, Clock } from "lucide-react";
import { DetailPageLayout } from "@workspace/entity-kit";
import { ApprovalActions } from "@/components/approval-actions";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

// SUP-006 — mirror of the support_tickets state machine in
// lib/lifecycleEngine.ts. The status selector must offer only the
// transitions the backend will accept, not a fixed list of four states.
const TICKET_STATUS_TRANSITIONS: Record<string, string[]> = {
  open: ["in_progress", "pending_customer", "field_visit", "resolved", "closed"],
  in_progress: ["pending_customer", "field_visit", "resolved", "closed", "open"],
  pending_customer: ["in_progress", "field_visit", "resolved", "closed"],
  field_visit: ["in_progress", "resolved", "closed"],
  resolved: ["closed", "in_progress"],
  closed: [],
};

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: "مفتوحة",
  in_progress: "قيد المعالجة",
  pending_customer: "بانتظار العميل",
  field_visit: "زيارة ميدانية",
  resolved: "تم الحل",
  closed: "مغلقة",
};

export default function TicketDetail() {
  const [, params] = useRoute("/support/:id");
  const id = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newReply, setNewReply] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { extraTabs: registryExtraTabs, hideTabs: registryHideTabs } = useRegistryTabs("support_ticket", id ?? 0);

  const { data: ticket, isLoading, isError, error, refetch } = useApiQuery<any>(["ticket-detail", id || ""], `/support/tickets/${id}`, !!id);

  const priorityMap: Record<string, { label: string; color: string }> = {
    critical: { label: "حرجة", color: "bg-red-200 text-status-error-foreground" },
    high: { label: "عالية", color: "bg-status-error-surface text-status-error-foreground" },
    medium: { label: "متوسطة", color: "bg-status-warning-surface text-status-warning-foreground" },
    low: { label: "منخفضة", color: "bg-status-success-surface text-status-success-foreground" },
  };

  const statusTone = (s: string) =>
    s === "open" ? "warning" as const :
    s === "in_progress" ? "info" as const :
    s === "pending_customer" ? "warning" as const :
    s === "field_visit" ? "info" as const :
    s === "resolved" ? "success" as const :
    s === "closed" ? "muted" as const : "default" as const;

  const statusLabel = (s: string) => TICKET_STATUS_LABELS[s] ?? s;

  const handleSendReply = async () => {
    if (!newReply.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/support/tickets/${id}/replies`, {
        method: "POST",
        body: JSON.stringify({ message: newReply, authorName: "مستخدم النظام" }),
      });
      toast({ title: "تم إرسال الرد" });
      setNewReply("");
      qc.invalidateQueries({ queryKey: ["ticket-detail", id] });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
    setSending(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await apiFetch(`/support/tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      toast({ title: "تم تحديث الحالة" });
      qc.invalidateQueries({ queryKey: ["ticket-detail", id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetch(`/support/tickets/${id}`, { method: "DELETE" });
      toast({ title: "تم حذف التذكرة" });
      navigate("/support");
    } catch (err) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  const replies = ticket?.replies || [];

  const overview = ticket ? (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Headphones className="w-5 h-5" /> تفاصيل التذكرة</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">{ticket.description || "-"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5" /> الردود ({replies.length})</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {replies.length === 0 && <p className="text-center text-muted-foreground py-4">لا توجد ردود</p>}
            {replies.map((r: any) => (
              <div key={r.id} className={`p-4 rounded-lg border ${r.isInternal ? "bg-status-warning-surface border-yellow-100" : r.authorId ? "bg-status-info-surface border-status-info-surface" : "bg-surface-subtle border-border"}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium flex items-center gap-1">
                    <User className="w-3 h-3" /> {r.authorName || "مجهول"}
                  </span>
                  <span className="text-xs text-muted-foreground">{r.createdAt ? `${formatDateAr(r.createdAt)} ${formatTimeAr(r.createdAt)}` : "-"}</span>
                </div>
                <p className="text-sm text-status-neutral-foreground">{r.message}</p>
              </div>
            ))}

            <div className="border-t pt-4 space-y-3">
              <Textarea placeholder="اكتب رداً..." value={newReply} onChange={(e) => setNewReply(e.target.value)} className="min-h-[80px]" />
              <div className="flex justify-end">
                <Button className="gap-2" disabled={!newReply.trim() || sending} onClick={handleSendReply} rateLimitAware><Send className="w-4 h-4" /> إرسال الرد</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-base">معلومات التذكرة</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">الحالة</span>
              <Select
                value={ticket.status}
                onValueChange={(v) => handleStatusChange(v)}
                disabled={(TICKET_STATUS_TRANSITIONS[ticket.status] ?? []).length === 0}
              >
                <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[ticket.status, ...(TICKET_STATUS_TRANSITIONS[ticket.status] ?? [])].map((s) => (
                    <SelectItem key={s} value={s}>{statusLabel(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">الأولوية</span><Badge className={priorityMap[ticket.priority]?.color || "bg-surface-subtle text-status-neutral-foreground"}>{priorityMap[ticket.priority]?.label || ticket.priority}</Badge></div>
            <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">الفئة</span><span>{ticket.category || "-"}</span></div>
            <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">العميل</span><span>{ticket.clientName || "-"}</span></div>
            <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">تاريخ الإنشاء</span><span className="text-xs">{ticket.createdAt ? `${formatDateAr(ticket.createdAt)} ${formatTimeAr(ticket.createdAt)}` : "-"}</span></div>
            <div className="flex justify-between py-2"><span className="text-muted-foreground">آخر تحديث</span><span className="text-xs">{ticket.updatedAt ? `${formatDateAr(ticket.updatedAt)} ${formatTimeAr(ticket.updatedAt)}` : "-"}</span></div>
            {ticket.isSlaBreached && (
              <div className="mt-2 p-2 bg-status-error-surface border border-status-error-surface rounded-lg text-status-error-foreground text-xs text-center">
                تم تجاوز اتفاقية مستوى الخدمة
              </div>
            )}
          </CardContent>
        </Card>

        {id && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">إجراءات الاعتماد</CardTitle>
            </CardHeader>
            <CardContent>
              <ApprovalActions
                entityType="ticket"
                entityId={Number(id)}
                currentStatus={ticket.status}
                approveEndpoint={`/support/tickets/${id}/approve`}
                rejectEndpoint={`/support/tickets/${id}/approve`}
                returnEndpoint={`/support/tickets/${id}/approve`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={(notes) => ({ approved: true, notes: notes || undefined })}
                rejectBody={(notes) => ({ approved: false, notes })}
                returnBody={(notes) => ({ approved: "returned", notes })}
                pendingStatuses={["pending", "open", "returned"]}
                invalidateKeys={[["support-tickets"], ["support-stats"]]}
                onDone={() => {
                  refetch();
                  toast({ title: "تم تحديث التذكرة" });
                }}
              />
            </CardContent>
          </Card>
        )}

        {id && <ApprovalTimeline entityType="ticket" entityId={id} />}
      </div>

      {id && <EntityComments entityType="ticket" entityId={id} />}
      {id && <EntityTags entityType="ticket" entityId={id} />}
    </div>
  ) : null;

  return (
    <DetailPageLayout
      title={ticket?.ref || `TKT-${id}`}
      subtitle={ticket?.title || undefined}
      backPath="/support"
      backLabel="الدعم الفني"
      status={ticket ? { label: statusLabel(ticket.status), tone: statusTone(ticket.status) } : undefined}
      entityType="ticket"
      entityId={id || ""}
      isLoading={isLoading}
      error={isError ? error : undefined}
      onRetry={refetch}
      createdAt={ticket?.createdAt}
      updatedAt={ticket?.updatedAt}
      extraTabs={registryExtraTabs}
      hideTabs={registryHideTabs}
      overview={overview}
      actions={
        <div className="flex items-center gap-2">
          {deleting ? (
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleDelete}>تأكيد الحذف</Button>
              <Button variant="outline" size="sm" onClick={() => setDeleting(false)}>إلغاء</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="text-status-error-foreground" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4 me-1" />حذف</Button>
          )}
        </div>
      }
    />
  );
}
