import { PageShell } from "@workspace/ui-core";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";
import { Zap, Clock, Inbox, CheckCircle2 } from "lucide-react";
import { RefreshAction } from "@/components/page-actions";

/**
 * Admin / Event Outbox monitor (#1603, under #1594).
 *
 * Read-only gauge over the transactional outbox (event_outbox): how many
 * rows are still pending vs already processed, and how old the oldest
 * pending row is. The "تفريغ الآن" button calls the existing admin drain
 * endpoint (POST /events/outbox/drain) which marks captured-and-dispatched
 * rows processed — the same job the maintenance interval runs, exposed as
 * an on-demand operator lever with a live UI instead of a curl/script.
 *
 * Endpoints (no new backend beyond the read-only stats GET):
 *   GET  /events/outbox/stats   → { pending, processed, total, oldestPendingAgeSec }
 *   POST /events/outbox/drain   → { drained, pending, oldestAgeSec }
 */

interface OutboxStats {
  pending: number;
  processed: number;
  total: number;
  oldestPendingAgeSec: number | null;
}

function formatAge(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${sec} ثانية`;
  if (sec < 3600) return `${Math.round(sec / 60)} دقيقة`;
  if (sec < 86400) return `${Math.round(sec / 3600)} ساعة`;
  return `${Math.round(sec / 86400)} يوم`;
}

export default function AdminEventOutbox() {
  const { toast } = useToast();
  const { data, isLoading, error, refetch } = useApiQuery<OutboxStats>(
    ["outbox-stats"],
    "/events/outbox/stats",
  );
  const drainMut = useApiMutation<
    { drained: number; pending: number },
    { graceSeconds: number }
  >("/events/outbox/drain", "POST", [["outbox-stats"]]);

  const stats = data;
  const pending = stats?.pending ?? 0;

  const cards = [
    { label: "قيد الانتظار", value: pending, icon: Inbox, tone: pending > 0 ? "text-status-warning-foreground" : "text-muted-foreground" },
    { label: "تمت معالجته", value: stats?.processed ?? 0, icon: CheckCircle2, tone: "text-status-success-foreground" },
    { label: "الإجمالي", value: stats?.total ?? 0, icon: Zap, tone: "text-status-info-foreground" },
  ];

  return (
    <PageShell
      title="صندوق الأحداث الصادرة"
      subtitle="مراقبة الأحداث المُلتقطة في صندوق الصادر المعاملاتي — قيد الانتظار مقابل المُعالَجة — وتفريغها عند الطلب"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "صندوق الأحداث الصادرة" },
      ]}
      loading={isLoading}
      actions={
        <div className="flex items-center gap-2">
          <RefreshAction onRefresh={() => refetch()} />
          <GuardedButton
            perm="admin:update"
            size="sm"
            disabled={drainMut.isPending}
            onClick={async () => {
              try {
                const res = await drainMut.mutateAsync({ graceSeconds: 0 });
                toast({ title: `تم تفريغ ${Number(res.drained).toLocaleString("ar-SA")} حدثاً — المتبقي قيد الانتظار: ${Number(res.pending).toLocaleString("ar-SA")}` });
                refetch();
              } catch (e: any) {
                toast({ variant: "destructive", title: e?.message || "فشل تفريغ صندوق الصادر" });
              }
            }}
          >
            <Zap className="h-4 w-4 me-1" /> {drainMut.isPending ? "جاري التفريغ..." : "تفريغ الآن"}
          </GuardedButton>
        </div>
      }
    >
      <PageStateWrapper isLoading={isLoading && !data} error={error} onRetry={refetch}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {cards.map((c) => (
            <Card key={c.label}>
              <CardContent className="p-4 flex flex-col items-center gap-1 text-center">
                <c.icon className={`h-5 w-5 ${c.tone}`} />
                <p className={`text-2xl font-bold ${c.tone}`}>{Number(c.value).toLocaleString("ar-SA")}</p>
                <p className="text-xs text-muted-foreground">{c.label}</p>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="p-4 flex flex-col items-center gap-1 text-center">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <p className="text-2xl font-bold">{formatAge(stats?.oldestPendingAgeSec ?? null)}</p>
              <p className="text-xs text-muted-foreground">أقدم حدث قيد الانتظار</p>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4 border-status-info-surface/40">
          <CardContent className="p-4 text-sm text-muted-foreground leading-relaxed">
            {pending === 0
              ? "لا توجد أحداث عالقة — صندوق الصادر فارغ من المعلّق. التفريغ يعمل تلقائياً ضمن دورة الصيانة؛ هذا الزر للتفريغ اليدوي عند الحاجة."
              : `يوجد ${Number(pending).toLocaleString("ar-SA")} حدثاً قيد الانتظار. اضغط «تفريغ الآن» لتعليم الأحداث المُلتقطة والمُرسَلة كـ«مُعالَجة». لا يُعيد البثّ (إعادة البثّ مرحلة لاحقة).`}
          </CardContent>
        </Card>
      </PageStateWrapper>
    </PageShell>
  );
}
