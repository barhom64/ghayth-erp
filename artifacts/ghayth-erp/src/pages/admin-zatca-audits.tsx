/**
 * ZATCA compliance audits — surfaces the 4 admin endpoints introduced
 * after the ZATCA pause/auto-recovery work (#1286 + #1370):
 *
 *   GET   /finance/zatca/missing-tax-numbers   — clients without VAT IDs
 *   PATCH /finance/zatca/missing-tax-numbers/:id — patch a client's taxNumber
 *   GET   /finance/zatca/pause-history         — when B2C reporting paused/resumed
 *   GET   /finance/zatca/misrouted-b2c-invoices — B2C rows routed through B2B path
 *
 * Designed for the AR/tax team — fixes data-quality issues that ZATCA
 * reporting depends on, surfaces pause events for the auditor trail.
 */

import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useApiQuery, apiFetch } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { AlertTriangle, History, Receipt, Edit } from "lucide-react";

export default function AdminZatcaAuditsPage() {
  const { toast } = useToast();

  // GET /finance/zatca/missing-tax-numbers — clients with B2B invoices
  // but no VAT ID set. ZATCA rejects these on submission.
  const missingTaxQ = useApiQuery<{ data: any[] }>(
    ["zatca-missing-tax-numbers"],
    "/finance/zatca/missing-tax-numbers",
  );
  const missingTax: any[] = missingTaxQ.data?.data ?? [];

  // GET /finance/zatca/pause-history — log of times the B2C live-mode
  // was paused (after consecutive failures) and resumed.
  const pauseQ = useApiQuery<{ data: any[] }>(
    ["zatca-pause-history"],
    "/finance/zatca/pause-history",
  );
  const pauseHistory: any[] = pauseQ.data?.data ?? [];

  // GET /finance/zatca/misrouted-b2c-invoices — B2C invoices that were
  // accidentally routed to B2B (caller didn't pass an individual
  // clientName/taxNumber pair). Operator must re-classify.
  const misroutedQ = useApiQuery<{ data: any[] }>(
    ["zatca-misrouted"],
    "/finance/zatca/misrouted-b2c-invoices",
  );
  const misrouted: any[] = misroutedQ.data?.data ?? [];

  // PATCH inline: set taxNumber on a missing-tax client row.
  const [editingClientId, setEditingClientId] = useState<number | null>(null);
  const [taxNumberDraft, setTaxNumberDraft] = useState("");
  const handleSaveTaxNumber = async (id: number) => {
    const t = taxNumberDraft.trim();
    if (!t) {
      toast({ variant: "destructive", title: "أدخل رقم ضريبي" });
      return;
    }
    try {
      await apiFetch(`/finance/zatca/missing-tax-numbers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ taxNumber: t }),
      });
      toast({ title: "تم تحديث الرقم الضريبي" });
      setEditingClientId(null);
      setTaxNumberDraft("");
      missingTaxQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التحديث", description: err?.message });
    }
  };

  return (
    <PageShell
      title="مراجعات ZATCA"
      subtitle="بنود تتطلب تدخّل فريق الضريبة قبل تقديم البيان الشهري"
      breadcrumbs={[{ label: "الإدارة" }, { label: "مراجعات ZATCA" }]}
    >
      <div className="space-y-4">
        <Card className="border-status-warning-surface">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-status-warning" />
              عملاء بدون رقم ضريبي ({missingTax.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {missingTaxQ.isLoading ? <LoadingSpinner /> : missingTaxQ.isError ? <ErrorState /> : (
              <div className="divide-y text-xs">
                {missingTax.length === 0 ? (
                  <p className="p-3 text-muted-foreground text-center">لا توجد بنود.</p>
                ) : (
                  missingTax.slice(0, 30).map((c: any) => (
                    <div key={c.id} className="px-3 py-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{c.name ?? c.clientName ?? `عميل #${c.id}`}</p>
                        {c.invoiceCount != null && (
                          <p className="text-muted-foreground text-[10px]">
                            {c.invoiceCount} فاتورة B2B متأثرة
                          </p>
                        )}
                      </div>
                      {editingClientId === c.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            value={taxNumberDraft}
                            onChange={(e) => setTaxNumberDraft(e.target.value)}
                            placeholder="3xxxxxxxxxxxxxx"
                            dir="ltr"
                            className="h-7 w-40 px-2 text-xs border rounded font-mono"
                          />
                          <GuardedButton
                            perm="finance:update"
                            size="sm"
                            rateLimitAware
                            onClick={() => handleSaveTaxNumber(c.id)}
                          >
                            حفظ
                          </GuardedButton>
                          <button type="button" className="text-[10px] text-muted-foreground" onClick={() => setEditingClientId(null)}>
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <GuardedButton
                          perm="finance:update"
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            setEditingClientId(c.id);
                            setTaxNumberDraft(c.taxNumber ?? "");
                          }}
                        >
                          <Edit className="h-3.5 w-3.5 me-1" />
                          إضافة رقم ضريبي
                        </GuardedButton>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4 text-status-error" />
              فواتير B2C مُوجَّهة خطأً إلى B2B ({misrouted.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {misroutedQ.isLoading ? <LoadingSpinner /> : (
              <div className="divide-y text-xs max-h-64 overflow-y-auto">
                {misrouted.length === 0 ? (
                  <p className="p-3 text-muted-foreground text-center">لا توجد فواتير مُوجَّهة بشكل خاطئ.</p>
                ) : (
                  misrouted.slice(0, 50).map((inv: any) => (
                    <div key={inv.id} className="px-3 py-2 flex items-center justify-between">
                      <span className="font-mono text-[10px]">
                        {inv.invoiceNumber ?? inv.ref ?? `#${inv.id}`}
                      </span>
                      <span className="text-muted-foreground">
                        {inv.clientName ?? "—"}
                        {inv.amount != null && (
                          <span className="font-mono ms-2">{Number(inv.amount).toLocaleString("ar-SA")}</span>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-status-info" />
              سجل إيقاف B2C ({pauseHistory.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pauseQ.isLoading ? <LoadingSpinner /> : (
              <div className="divide-y text-xs max-h-64 overflow-y-auto">
                {pauseHistory.length === 0 ? (
                  <p className="p-3 text-muted-foreground text-center">لم يحدث أي إيقاف.</p>
                ) : (
                  pauseHistory.slice(0, 50).map((e: any, i: number) => (
                    <div key={e.id ?? i} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <Badge variant={e.action === "paused" ? "destructive" : "default"} className="text-[10px]">
                          {e.action === "paused" ? "إيقاف" : e.action === "resumed" ? "استئناف" : (e.action ?? "—")}
                        </Badge>
                        {e.reason && <span className="text-muted-foreground ms-2">{e.reason}</span>}
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        {e.createdAt ? formatDateAr(e.createdAt) : ""}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
