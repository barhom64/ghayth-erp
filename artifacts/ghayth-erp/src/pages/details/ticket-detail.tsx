import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { GuardedButton } from "@/components/shared/permission-gate";
import { formatDateAr, formatTimeAr } from "@/lib/formatters";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Headphones, User, MessageSquare, Send, Trash2, Clock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DetailPageLayout,
  EntityComments,
} from "@workspace/entity-kit";
import { ApprovalActions } from "@workspace/workflow-kit";
import { ApprovalTimeline } from "@/components/shared/approval-timeline";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";
import { PrintButton } from "@/components/shared/print-button";

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
  const [csatScore, setCsatScore] = useState<number>(0);
  const [csatComment, setCsatComment] = useState("");
  const [csatSubmitting, setCsatSubmitting] = useState(false);
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

  // CSAT — only accepted on resolved/closed tickets per the backend's
  // 409 guard. The widget reads csatScore from the loaded ticket payload
  // (if already rated) or shows the entry form.
  const handleSubmitCsat = async () => {
    if (csatScore < 1 || csatScore > 5) return;
    setCsatSubmitting(true);
    try {
      await apiFetch(`/support/tickets/${id}/csat`, {
        method: "POST",
        body: JSON.stringify({ score: csatScore, comment: csatComment || undefined }),
      });
      toast({ title: "تم إرسال التقييم — شكراً لك" });
      qc.invalidateQueries({ queryKey: ["ticket-detail", id] });
      setCsatScore(0);
      setCsatComment("");
    } catch (err) {
      toast({ variant: "destructive", title: "تعذر إرسال التقييم", description: getErrorMessage(err) });
    } finally {
      setCsatSubmitting(false);
    }
  };

  const replies = ticket?.replies || [];

  // POST /support/tickets/:id/field-visit — schedule an on-site visit.
  // Backend schema field is `visitDate`, not scheduledDate.
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitDate, setVisitDate] = useState("");
  const handleScheduleVisit = () => {
    setVisitDate("");
    setVisitOpen(true);
  };
  const confirmScheduleVisit = async () => {
    if (!visitDate.trim()) return;
    setVisitOpen(false);
    try {
      await apiFetch(`/support/tickets/${id}/field-visit`, {
        method: "POST",
        body: JSON.stringify({ visitDate: visitDate.trim() }),
      });
      toast({ title: "تم جدولة الزيارة الميدانية" });
      qc.invalidateQueries({ queryKey: ["ticket-detail", id] });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذر الجدولة", description: getErrorMessage(err) });
    }
  };

  // POST /support/tickets/check-sla — runs the SLA bookkeeper across all
  // open tickets and flags breaches. Triggered manually from this page as
  // an "احسب الـ SLA الآن" diagnostic.
  const handleCheckSla = async () => {
    try {
      await apiFetch("/support/tickets/check-sla", { method: "POST" });
      toast({ title: "تم احتساب الـ SLA" });
      qc.invalidateQueries({ queryKey: ["ticket-detail", id] });
      qc.invalidateQueries({ queryKey: ["tickets"] });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذر الاحتساب", description: getErrorMessage(err) });
    }
  };

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
            {/* نقص بيانات مُصلَح: مهلة SLA + أول رد + العدّاد المتبقّي كانت
                مُحسوبة ومُرجَعة، لكن يُعرض «مُخترَق» فقط لا الرقم القابل للتصرّف. */}
            {ticket.slaDeadline && (
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">مهلة الخدمة (SLA)</span><span className="text-xs">{`${formatDateAr(ticket.slaDeadline)} ${formatTimeAr(ticket.slaDeadline)}`}</span></div>
            )}
            {ticket.firstResponseAt && (
              <div className="flex justify-between py-2 border-b"><span className="text-muted-foreground">أول رد</span><span className="text-xs">{`${formatDateAr(ticket.firstResponseAt)} ${formatTimeAr(ticket.firstResponseAt)}`}</span></div>
            )}
            {ticket.isSlaBreached ? (
              <div className="mt-2 p-2 bg-status-error-surface border border-status-error-surface rounded-lg text-status-error-foreground text-xs text-center">
                تم تجاوز اتفاقية مستوى الخدمة
              </div>
            ) : (ticket.slaDeadline && Number(ticket.slaRemainingHours) > 0 && !["resolved", "closed"].includes(ticket.status)) ? (
              <div className="mt-2 p-2 bg-status-warning-surface border border-status-warning-surface rounded-lg text-status-warning-foreground text-xs text-center">
                متبقٍّ على مهلة الخدمة: {ticket.slaRemainingHours} ساعة
              </div>
            ) : null}
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
                approveEndpoint={`/support/tickets/${id}`}
                rejectEndpoint={`/support/tickets/${id}`}
                returnEndpoint={`/support/tickets/${id}`}
                approveMethod="PATCH"
                rejectMethod="PATCH"
                returnMethod="PATCH"
                approveBody={() => ({ status: "resolved" })}
                rejectBody={() => ({ status: "closed" })}
                returnBody={() => ({ status: "open" })}
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

        {/* CSAT — backend only accepts ratings on resolved/closed
            tickets (409 otherwise). Show as a form when the ticket
            qualifies and there's no existing rating, or as a read-only
            score badge once submitted. */}
        {(ticket.status === "resolved" || ticket.status === "closed") && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                تقييم خدمة العملاء (CSAT)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {ticket.csatScore ? (
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn(
                          "w-4 h-4",
                          n <= Number(ticket.csatScore) ? "fill-amber-400 text-amber-400" : "text-gray-300",
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {ticket.csatScore}/5
                  </span>
                  {ticket.csatComment && (
                    <p className="text-xs text-muted-foreground border-s ps-2 ms-2">
                      {ticket.csatComment}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCsatScore(n)}
                        className="p-1"
                        aria-label={`${n} نجوم`}
                      >
                        <Star
                          className={cn(
                            "w-6 h-6 transition-colors",
                            n <= csatScore ? "fill-amber-400 text-amber-400" : "text-gray-300 hover:text-amber-300",
                          )}
                        />
                      </button>
                    ))}
                  </div>
                  <Textarea
                    placeholder="تعليقك على الخدمة (اختياري)"
                    value={csatComment}
                    onChange={(e) => setCsatComment(e.target.value)}
                    className="min-h-[60px] text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleSubmitCsat}
                    disabled={csatScore < 1 || csatSubmitting}
                    rateLimitAware
                  >
                    إرسال التقييم
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {id && <EntityComments entityType="ticket" entityId={id} />}
      {id && <EntityTags entityType="ticket" entityId={id} />}
    </div>
  ) : null;

  return (
    <>
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
          <PrintButton entityType="support_ticket" entityId={id ?? 0} label="طباعة" />
          <GuardedButton perm="support:update" variant="outline" size="sm" onClick={handleCheckSla} rateLimitAware>احسب الـ SLA</GuardedButton>
          <GuardedButton perm="support:update" variant="outline" size="sm" onClick={handleScheduleVisit} rateLimitAware>زيارة ميدانية</GuardedButton>
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
    <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>جدولة زيارة ميدانية</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">تاريخ الزيارة</Label>
          <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setVisitOpen(false)}>إلغاء</Button>
          <Button onClick={confirmScheduleVisit} disabled={!visitDate.trim()} rateLimitAware>جدولة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
