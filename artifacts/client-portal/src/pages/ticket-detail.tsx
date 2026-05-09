import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { formatDateAr } from "@/lib/formatters";
import { useRateLimitCooldown } from "@/hooks/use-rate-limit-cooldown";

function ReplySubmit({ sending, disabled }: { sending: boolean; disabled: boolean }) {
  const { isCoolingDown, label } = useRateLimitCooldown();
  const busy = sending || isCoolingDown || disabled;
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
    >
      {isCoolingDown ? label : sending ? "جاري الإرسال..." : "إرسال"}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: "مفتوح", cls: "bg-blue-100 text-blue-700" },
    in_progress: { label: "قيد التنفيذ", cls: "bg-indigo-100 text-indigo-700" },
    closed: { label: "مغلق", cls: "bg-gray-100 text-gray-600" },
    resolved: { label: "محلول", cls: "bg-green-100 text-green-700" },
  };
  const s = map[status] || { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = { high: "text-red-600", medium: "text-amber-600", low: "text-green-600", urgent: "text-red-700 font-bold" };
  const labels: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة", urgent: "عاجل" };
  return <span className={`text-xs ${map[priority] || "text-gray-500"}`}>{labels[priority] || priority}</span>;
}

export default function TicketDetail() {
  const [, params] = useRoute("/tickets/:id");
  const id = params?.id || "";
  const qc = useQueryClient();

  const { data: ticket, isLoading } = useApiQuery<any>(["portal-ticket", id], `/tickets/${id}`, !!id);
  const { data: repliesData } = useApiQuery<any>(["portal-ticket-replies", id], `/tickets/${id}/replies`, !!id);

  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendErr, setSendErr] = useState("");

  const replies: any[] = repliesData?.data || [];

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) return;
    setSending(true);
    setSendErr("");
    try {
      await apiFetch(`/tickets/${id}/replies`, {
        method: "POST",
        body: JSON.stringify({ message: replyText.trim() }),
      });
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["portal-ticket-replies", id] });
      qc.invalidateQueries({ queryKey: ["portal-ticket", id] });
    } catch (err: any) {
      setSendErr(err.message || "فشل في إرسال الرد");
    } finally {
      setSending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-gray-200 rounded animate-pulse w-32" />
        <div className="h-48 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-4xl mb-2">😕</p>
        <p>الطلب غير موجود</p>
        <Link href="/tickets" className="text-blue-600 text-sm hover:underline mt-2 block">العودة للطلبات</Link>
      </div>
    );
  }

  const canReply = ticket.status !== "closed" && ticket.status !== "resolved";

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/tickets" className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            الطلبات
          </Link>
        <span className="text-gray-400">/</span>
        <span className="text-gray-900 font-mono text-sm font-semibold">{ticket.ref}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{ticket.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="font-mono text-xs text-gray-400">{ticket.ref}</span>
              <span className="text-gray-300">•</span>
              <PriorityBadge priority={ticket.priority} />
              {ticket.category && <><span className="text-gray-300">•</span><span className="text-xs text-gray-500">{ticket.category}</span></>}
              <span className="text-gray-300">•</span>
              <span className="text-xs text-gray-400">{formatDateAr(ticket.createdAt)}</span>
            </div>
          </div>
          <StatusBadge status={ticket.status} />
        </div>

        {ticket.description && (
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{ticket.description}</p>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-gray-800">المحادثة</h2>

        {replies.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400 text-sm">
            لا توجد ردود بعد
          </div>
        ) : (
          <div className="space-y-3">
            {replies.map((r: any) => (
              <div
                key={r.id}
                className={`rounded-xl p-4 ${r.senderType === "client" ? "bg-blue-50 border border-blue-100 ms-4" : "bg-white border border-gray-200 me-4"}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className={`text-xs font-medium ${r.senderType === "client" ? "text-blue-700" : "text-gray-600"}`}>
                    {r.senderType === "client" ? "أنت" : (r.senderName || "فريق الدعم")}
                  </span>
                  <span className="text-xs text-gray-400">{formatDateAr(r.createdAt)}</span>
                </div>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{r.message}</p>
              </div>
            ))}
          </div>
        )}

        {canReply && (
          <form onSubmit={handleReply} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-700">إرسال رد</h3>
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={3}
              placeholder="اكتب ردك هنا..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            {sendErr && (
              <p className="text-xs text-red-600">{sendErr}</p>
            )}
            <ReplySubmit sending={sending} disabled={!replyText.trim()} />
          </form>
        )}

        {!canReply && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-sm text-gray-500">هذا الطلب {ticket.status === "closed" ? "مغلق" : "محلول"} ولا يمكن الرد عليه</p>
          </div>
        )}
      </div>

      {["resolved", "closed"].includes(ticket.status) && (
        <CSATWidget ticketId={Number(id)} />
      )}
    </div>
  );
}

function CSATWidget({ ticketId }: { ticketId: number }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!score) return;
    setLoading(true);
    setError("");
    try {
      await apiFetch(`/tickets/${ticketId}/csat`, { method: "POST", body: JSON.stringify({ score, comment }) });
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message || "خطأ في الإرسال");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
      <p className="text-sm font-medium text-green-700">شكراً على تقييمك! 🎉</p>
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="text-base font-semibold text-gray-800">قيّم تجربتك</h3>
      <div className="flex items-center gap-2 justify-center">
        {[1, 2, 3, 4, 5].map(s => (
          <button
            key={s}
            onClick={() => setScore(s)}
            className={`w-10 h-10 rounded-full text-lg transition-transform hover:scale-110 ${score === s ? "bg-amber-100 ring-2 ring-amber-400 scale-110" : "hover:bg-gray-100"}`}
          >
            {["😞", "😕", "😐", "😊", "😃"][s - 1]}
          </button>
        ))}
      </div>
      {score && (
        <>
          <textarea
            rows={2}
            placeholder="تعليقك (اختياري)..."
            value={comment}
            onChange={e => setComment(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            onClick={submit}
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "جاري الإرسال..." : "إرسال التقييم"}
          </button>
        </>
      )}
    </div>
  );
}
