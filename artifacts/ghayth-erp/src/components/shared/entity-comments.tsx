import { z } from "zod";
import { useFormContext } from "react-hook-form";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormShell } from "@workspace/ui-core";
import { cn } from "@/lib/utils";
import { MessageCircle, Send, Trash2, User } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

interface EntityCommentsProps {
  entityType: string;
  entityId: number | string;
  /** When set, the thread is scoped to a specific attachment (document) of the
   *  entity — a reviewer↔submitter dialogue on that file. Omit for the
   *  entity-level «المناقشة» thread. */
  documentId?: number | string | null;
  className?: string;
}

const commentSchema = z.object({
  body: z.string().min(1, "مطلوب"),
});
type CommentForm = z.infer<typeof commentSchema>;

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

function CommentRow() {
  const { register, formState, watch } = useFormContext<CommentForm>();
  const body = watch("body");
  return (
    <div className="flex gap-2 items-start">
      <Input
        {...register("body")}
        placeholder="أضف تعليقاً..."
        disabled={formState.isSubmitting}
        className="flex-1"
      />
      <Button type="submit" size="sm" rateLimitAware disabled={!body?.trim() || formState.isSubmitting}>
        <Send className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function EntityComments({ entityType, entityId, documentId = null, className }: EntityCommentsProps) {
  const qc = useQueryClient();
  const docKey = documentId != null && documentId !== "" ? String(documentId) : "";
  const qk = ["entity-comments", entityType, String(entityId), docKey];
  const listUrl = docKey
    ? `/entity-meta/comments/${entityType}/${entityId}?documentId=${docKey}`
    : `/entity-meta/comments/${entityType}/${entityId}`;
  const { data } = useApiQuery<any>(qk, listUrl, !!entityId);
  const comments = data?.data || [];

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

      <FormShell
        schema={commentSchema}
        defaultValues={{ body: "" }}
        hideSubmit
        onSubmit={async (values, ctx) => {
          try {
            await apiFetch(`/entity-meta/comments/${entityType}/${entityId}`, {
              method: "POST",
              body: JSON.stringify({ body: values.body.trim(), ...(docKey ? { documentId: Number(docKey) } : {}) }),
            });
            qc.invalidateQueries({ queryKey: qk });
            ctx.reset();
          } catch (err: any) {
            toast({ variant: "destructive", title: "خطأ في إضافة التعليق", description: err.message });
            throw err;
          }
        }}
      >
        <CommentRow />
      </FormShell>

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
