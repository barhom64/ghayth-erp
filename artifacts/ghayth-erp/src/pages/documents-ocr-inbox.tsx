/**
 * OCR extractions inbox — wires the 4 documents/ocr stubs from PR #1377:
 *
 *   GET  /documents/ocr/extractions               — list pending extractions
 *   POST /documents/ocr/extractions/:id/confirm   — approve extracted data
 *   POST /documents/ocr/extractions/:id/reject    — reject extraction
 *   POST /documents/:id/ocr/rerun                 — re-run OCR for a document
 *
 * Operators review what the OCR pipeline pulled from invoices/IDs and
 * either confirm (data flows downstream) or reject (forces a manual pass).
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
import { ScanText, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export default function DocumentsOcrInboxPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"pending" | "confirmed" | "rejected" | "">("pending");

  const listQ = useApiQuery<{ data: any[] }>(
    ["documents-ocr-extractions", statusFilter],
    `/documents/ocr/extractions${statusFilter ? `?status=${statusFilter}` : ""}`,
  );
  const items: any[] = listQ.data?.data ?? [];

  const handleAction = async (id: number, action: "confirm" | "reject") => {
    try {
      await apiFetch(`/documents/ocr/extractions/${id}/${action}`, { method: "POST" });
      toast({ title: action === "confirm" ? "تم التأكيد" : "تم الرفض" });
      listQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل التنفيذ", description: err?.message });
    }
  };

  const handleRerun = async (documentId: number) => {
    try {
      await apiFetch(`/documents/${documentId}/ocr/rerun`, { method: "POST" });
      toast({ title: "تم وضع الاستخراج في الطابور" });
      listQ.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الإرسال", description: err?.message });
    }
  };

  return (
    <PageShell
      title="صندوق استخراج المستندات"
      subtitle="مراجعة وتأكيد البيانات المستخرجة من المستندات الممسوحة"
      breadcrumbs={[{ label: "المستندات" }, { label: "صندوق المسح الضوئي" }]}
      actions={
        <div className="flex gap-1 text-xs">
          {(["pending", "confirmed", "rejected", ""] as const).map((s) => (
            <button
              key={s || "all"}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded border ${
                statusFilter === s ? "bg-status-info-surface border-status-info-foreground" : ""
              }`}
            >
              {s === "pending" ? "بانتظار المراجعة"
                : s === "confirmed" ? "مؤكَّدة"
                : s === "rejected" ? "مرفوضة"
                : "الكل"}
            </button>
          ))}
        </div>
      }
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ScanText className="h-4 w-4 text-status-info" />
            استخراجات OCR ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {listQ.isLoading ? <LoadingSpinner /> : listQ.isError ? <ErrorState /> : (
            <div className="divide-y text-xs">
              {items.length === 0 ? (
                <p className="p-4 text-muted-foreground text-center">لا توجد استخراجات في هذه الحالة.</p>
              ) : (
                items.map((x: any) => (
                  <div key={x.id} className="px-3 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <p className="font-medium">
                          {x.documentName ?? x.fileName ?? `مستند #${x.documentId ?? x.id}`}
                          {x.documentType && (
                            <Badge variant="outline" className="ms-2 text-[10px]">{x.documentType}</Badge>
                          )}
                        </p>
                        <p className="text-muted-foreground text-[10px]">
                          {x.createdAt && formatDateAr(x.createdAt)}
                          {x.confidence != null && (
                            <span className="ms-2">ثقة: {Math.round(Number(x.confidence) * 100)}%</span>
                          )}
                        </p>
                      </div>
                      <Badge
                        variant={
                          x.status === "confirmed" ? "default"
                          : x.status === "rejected" ? "destructive"
                          : "outline"
                        }
                        className="text-[10px]"
                      >
                        {x.status}
                      </Badge>
                    </div>

                    {x.extractedData && (
                      <pre className="bg-surface-subtle p-2 rounded text-[10px] font-mono overflow-x-auto max-h-32">
                        {JSON.stringify(x.extractedData, null, 2)}
                      </pre>
                    )}

                    {x.status === "pending" && (
                      <div className="flex gap-1">
                        <GuardedButton
                          perm="documents:update"
                          size="sm"
                          rateLimitAware
                          onClick={() => handleAction(x.id, "confirm")}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 me-1" />تأكيد
                        </GuardedButton>
                        <GuardedButton
                          perm="documents:update"
                          variant="outline"
                          size="sm"
                          rateLimitAware
                          onClick={() => handleAction(x.id, "reject")}
                        >
                          <XCircle className="h-3.5 w-3.5 me-1" />رفض
                        </GuardedButton>
                        {x.documentId && (
                          <GuardedButton
                            perm="documents:update"
                            variant="ghost"
                            size="sm"
                            rateLimitAware
                            onClick={() => handleRerun(x.documentId)}
                          >
                            <RefreshCw className="h-3.5 w-3.5 me-1" />إعادة المسح
                          </GuardedButton>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
