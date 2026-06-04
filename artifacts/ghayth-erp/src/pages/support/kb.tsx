import { useState } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { SupportTabsNav } from "@/components/shared/support-tabs-nav";
import { formatDateAr } from "@/lib/formatters";
import {
  DataTable,
  type DataTableColumn,
  PageShell,
} from "@workspace/ui-core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { BookOpen, ThumbsUp, ThumbsDown } from "lucide-react";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { GuardedButton } from "@/components/shared/permission-gate";

interface KBArticle {
  id: number;
  title?: string;
  category?: string;
  tags?: string[];
  views?: number;
  helpful?: number;
  notHelpful?: number;
  createdAt?: string;
}

export default function KnowledgeBase() {
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["support-kb"], "/support/kb");
  // GET /support/kb/:id — lazy-fetched when a row is opened.
  const [openId, setOpenId] = useState<number | null>(null);
  const articleQ = useApiQuery<any>(
    ["support-kb-article", String(openId ?? 0)],
    openId ? `/support/kb/${openId}` : null,
    { enabled: openId !== null },
  );
  // POST /support/kb/:id/feedback — thumbs up/down + optional comment.
  const feedbackMut = useApiMutation<unknown, { id: number; helpful: boolean; comment?: string }>(
    (b) => `/support/kb/${b.id}/feedback`,
    "POST",
    [["support-kb"], ["support-kb-article", String(openId ?? 0)]],
    { successMessage: "تم تسجيل ملاحظتك" },
  );
  const [comment, setComment] = useState("");
  const sendFeedback = (helpful: boolean) => {
    if (openId == null) return;
    feedbackMut.mutate(
      { id: openId, helpful, comment: comment.trim() || undefined },
      {
        onSuccess: () => {
          setComment("");
          refetch();
        },
      },
    );
  };

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const rows: KBArticle[] = asList(data?.data || data);

  const columns: DataTableColumn<KBArticle>[] = [
    { key: "title", header: "العنوان", sortable: true, searchable: true,
      render: (r) => (
        <button
          className="text-right hover:underline text-status-info-foreground"
          onClick={() => setOpenId(r.id)}
        >
          {r.title}
        </button>
      ),
    },
    { key: "category", header: "التصنيف", render: (r) => <Badge variant="outline">{r.category || "عام"}</Badge> },
    { key: "tags", header: "الوسوم", render: (r) => r.tags?.length ? r.tags.map((t, i) => <Badge key={i} variant="secondary" className="mx-0.5">{t}</Badge>) : "-" },
    { key: "views", header: "المشاهدات", sortable: true },
    { key: "helpful", header: "مفيد 👍" },
    { key: "notHelpful", header: "غير مفيد 👎" },
    { key: "createdAt", header: "تاريخ الإنشاء", render: (r) => formatDateAr(r.createdAt) },
  ];

  return (
    <PageShell
      title="قاعدة المعرفة"
      subtitle="مقالات ومواد تعليمية لحل المشاكل الشائعة"
      breadcrumbs={[{ href: "/support", label: "الدعم" }, { label: "قاعدة المعرفة" }]}
      loading={isLoading}
    >
      <SupportTabsNav />
      <DataTable columns={columns} data={rows} isLoading={isLoading} isError={isError} error={error} />

      <Dialog open={openId !== null} onOpenChange={(o) => { if (!o) { setOpenId(null); setComment(""); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              {articleQ.data?.title ?? "مقال"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm space-y-3">
            {articleQ.isLoading ? (
              <p className="text-muted-foreground">جاري التحميل...</p>
            ) : articleQ.data ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  {articleQ.data.category && <Badge variant="outline">{articleQ.data.category}</Badge>}
                  {Array.isArray(articleQ.data.tags) && articleQ.data.tags.map((t: string, i: number) => (
                    <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                  ))}
                </div>
                {articleQ.data.body && (
                  <div className="border rounded p-3 bg-muted/30 whitespace-pre-wrap text-sm leading-relaxed">
                    {articleQ.data.body}
                  </div>
                )}
                <div className="border-t pt-2">
                  <p className="text-xs text-muted-foreground mb-1">هل ساعدك هذا المقال؟</p>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    placeholder="تعليقك (اختياري)"
                    className="text-sm"
                  />
                  <div className="flex items-center gap-2 mt-2">
                    <GuardedButton
                      perm="support:create"
                      variant="outline"
                      size="sm"
                      onClick={() => sendFeedback(true)}
                      disabled={feedbackMut.isPending}
                    >
                      <ThumbsUp className="h-3 w-3 me-1" /> مفيد
                    </GuardedButton>
                    <GuardedButton
                      perm="support:create"
                      variant="outline"
                      size="sm"
                      onClick={() => sendFeedback(false)}
                      disabled={feedbackMut.isPending}
                    >
                      <ThumbsDown className="h-3 w-3 me-1" /> غير مفيد
                    </GuardedButton>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">لا توجد بيانات</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpenId(null); setComment(""); }}>إغلاق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
