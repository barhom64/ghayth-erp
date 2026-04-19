import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Headphones, User, MessageSquare, Send, Trash2, Clock, FileText } from "lucide-react";
import { EntityTimeline } from "@/components/shared/entity-timeline";
import { EntityDocuments } from "@/components/shared/entity-documents";
import { PageShell } from "@/components/page-shell";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";

export default function TicketDetail() {
  const [, params] = useRoute("/support/:id");
  const id = params?.id;
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newReply, setNewReply] = useState("");
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { data: ticket, isLoading, isError, error } = useApiQuery<any>(["ticket-detail", id || ""], `/support/tickets/${id}`, !!id);
  const is404 = isError && (error?.message?.includes("غير موجود") || error?.message?.includes("404"));

  const priorityMap: Record<string, { label: string; color: string }> = {
    critical: { label: "حرجة", color: "bg-red-200 text-red-800" },
    high: { label: "عالية", color: "bg-red-100 text-red-700" },
    medium: { label: "متوسطة", color: "bg-yellow-100 text-yellow-700" },
    low: { label: "منخفضة", color: "bg-green-100 text-green-700" },
  };

  if (isLoading) return <LoadingSpinner />;

  if (is404 || (!isLoading && !ticket)) return (
    <div className="text-center py-12">
      <Headphones className="h-12 w-12 mx-auto mb-3 text-gray-300" />
      <p className="text-gray-500">التذكرة غير موجودة</p>
      <Link href="/support"><Button variant="outline" className="mt-4">العودة للدعم الفني</Button></Link>
    </div>
  );

  if (isError) return <ErrorState onRetry={() => window.location.reload()} />;

  const replies = ticket.replies || [];

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

  return (
    <PageShell
      title={ticket.ref || `TKT-${id}`}
      subtitle={ticket.title || undefined}
      loading={isLoading}
      breadcrumbs={[{ href: "/support", label: "الدعم" }]}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={priorityMap[ticket.priority]?.color || "bg-gray-100 text-gray-700"}>{priorityMap[ticket.priority]?.label || ticket.priority}</Badge>
          {deleting ? (
            <div className="flex gap-2">
              <Button variant="destructive" size="sm" onClick={handleDelete}>تأكيد الحذف</Button>
              <Button variant="outline" size="sm" onClick={() => setDeleting(false)}>إلغاء</Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleting(true)}><Trash2 className="h-4 w-4 me-1" />حذف</Button>
          )}
          <Link href="/support">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 me-1" />
              العودة
            </Button>
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Headphones className="w-5 h-5" /> تفاصيل التذكرة</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 leading-relaxed">{ticket.description || "-"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><MessageSquare className="w-5 h-5" /> الردود ({replies.length})</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {replies.length === 0 && <p className="text-center text-gray-400 py-4">لا توجد ردود</p>}
              {replies.map((r: any) => (
                <div key={r.id} className={`p-4 rounded-lg border ${r.isInternal ? "bg-yellow-50 border-yellow-100" : r.authorId ? "bg-blue-50 border-blue-100" : "bg-gray-50 border-gray-100"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium flex items-center gap-1">
                      <User className="w-3 h-3" /> {r.authorName || "مجهول"}
                    </span>
                    <span className="text-xs text-gray-500">{r.createdAt ? new Date(r.createdAt).toLocaleString("ar-SA") : "-"}</span>
                  </div>
                  <p className="text-sm text-gray-700">{r.message}</p>
                </div>
              ))}

              <div className="border-t pt-4 space-y-3">
                <Textarea placeholder="اكتب رداً..." value={newReply} onChange={(e) => setNewReply(e.target.value)} className="min-h-[80px]" />
                <div className="flex justify-end">
                  <Button className="gap-2" disabled={!newReply.trim() || sending} onClick={handleSendReply}><Send className="w-4 h-4" /> إرسال الرد</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {id && <EntityDocuments entityType="ticket" entityId={id} />}

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="w-4 h-4" /> السجل الزمني</CardTitle></CardHeader>
            <CardContent>
              <EntityTimeline entityType="support_tickets" entityId={id!} maxItems={15} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">معلومات التذكرة</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">الحالة</span>
                <Select value={ticket.status} onValueChange={(v) => handleStatusChange(v)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">مفتوحة</SelectItem>
                    <SelectItem value="in_progress">قيد المعالجة</SelectItem>
                    <SelectItem value="resolved">تم الحل</SelectItem>
                    <SelectItem value="closed">مغلقة</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">الأولوية</span><Badge className={priorityMap[ticket.priority]?.color || "bg-gray-100 text-gray-700"}>{priorityMap[ticket.priority]?.label || ticket.priority}</Badge></div>
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">الفئة</span><span>{ticket.category || "-"}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">العميل</span><span>{ticket.clientName || "-"}</span></div>
              <div className="flex justify-between py-2 border-b"><span className="text-gray-500">تاريخ الإنشاء</span><span className="text-xs">{ticket.createdAt ? new Date(ticket.createdAt).toLocaleString("ar-SA") : "-"}</span></div>
              <div className="flex justify-between py-2"><span className="text-gray-500">آخر تحديث</span><span className="text-xs">{ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString("ar-SA") : "-"}</span></div>
              {ticket.isSlaBreached && (
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs text-center">
                  تم تجاوز اتفاقية مستوى الخدمة
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {id && <EntityDocuments entityType="ticket" entityId={id} />}

      {id && (
        <Card>
          <CardHeader><CardTitle className="text-lg">سجل الأحداث</CardTitle></CardHeader>
          <CardContent>
            <EntityTimeline entityType="ticket" entityId={id} />
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
