import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MessageCircle, Send, Trash2, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

interface EntityCommentsProps {
  entityType: string;
  entityId: number | string;
  className?: string;
}

function formatTimeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "الآن";
  if (min < 60) return `منذ ${min} دقيقة`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `منذ ${hrs} ساعة`;
  const days = Math.floor(hrs / 24);
  return `منذ ${days} يوم`;
}

export function EntityComments({ entityType, entityId, className }: EntityCommentsProps) {
  const qc = useQueryClient();
  const qk = ["entity-comments", entityType, String(entityId)];
  const { data } = useApiQuery<any>(qk, `/entity-meta/comments/${entityType}/${entityId}`, !!entityId);
  const comments = data?.data || [];
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const addComment = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/entity-meta/comments/${entityType}/${entityId}`, {
        method: "POST",
        body: JSON.stringify({ body: body.trim() }),
      });
      setBody("");
      qc.invalidateQueries({ queryKey: qk });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في إضافة التعليق", description: err.message });
    } finally {
      setSending(false);
    }
  };

  const removeComment = async (id: number) => {
    try {
      await apiFetch(`/entity-meta/comments/${id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: qk });
    } catch (err: any) {
      toast({ variant: "destructive", title: "خطأ في حذف التعليق", description: err.message });
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
        <MessageCircle className="h-4 w-4" />
        <span>التعليقات ({comments.length})</span>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="أضف تعليقاً..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
          className="flex-1"
        />
        <Button size="sm" onClick={addComment} disabled={!body.trim() || sending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {comments.length > 0 && (
        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          {comments.map((c: any) => (
            <div key={c.id} className="flex gap-2 group">
              <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-3.5 w-3.5 text-status-info-foreground" />
              </div>
              <div className="flex-1 bg-surface-subtle rounded-lg p-2.5 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-700">{c.userName || "مستخدم"}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">{formatTimeAgo(c.createdAt)}</span>
                    <button
                      onClick={() => removeComment(c.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 p-0.5"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
