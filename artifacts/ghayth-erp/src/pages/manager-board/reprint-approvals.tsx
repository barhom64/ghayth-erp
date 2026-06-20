/**
 * Reprint Approvals — manager workflow for approving/rejecting reprint
 * requests created from /reports/print-log or the PrintButton 409 path.
 *
 *   /manager-board/reprint-approvals
 *
 * Pending requests show the requester, branch, entity, and reason. Approval
 * triggers a fresh render of the document with copyNumber > 1 and a
 * "نسخة مكررة" watermark, then marks the request as approved.
 */

import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, X, AlertTriangle, Repeat } from "lucide-react";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";

interface ReprintRequest {
  id: number;
  entityType: string;
  entityId: string;
  branchId: number | null;
  requestedBy: number | null;
  requesterName: string | null;
  reason: string | null;
  status: string;
  approvedBy: number | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  resultJobId: string | null;
  createdAt: string;
}

export default function ReprintApprovalsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending");
  const [rejecting, setRejecting] = useState<ReprintRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data, isLoading } = useApiQuery<{ items: ReprintRequest[] }>(
    ["reprint-requests", statusFilter],
    `/print/reprint-requests?status=${statusFilter}`
  );

  async function approve(r: ReprintRequest) {
    setBusyId(r.id);
    try {
      await apiFetch(`/print/reprint-requests/${r.id}/approve`, { method: "POST" });
      toast({
        title: "تمت الموافقة",
        description: `تم إصدار نسخة مكررة من ${r.entityType} #${r.entityId} بختم "نسخة مكررة".`,
      });
      qc.invalidateQueries({ queryKey: ["reprint-requests"] });
    } catch (err: any) {
      toast({ title: "فشلت الموافقة", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function submitRejection() {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    try {
      await apiFetch(`/print/reprint-requests/${rejecting.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason: rejectReason }),
      });
      toast({ title: "تم الرفض" });
      qc.invalidateQueries({ queryKey: ["reprint-requests"] });
      setRejecting(null);
      setRejectReason("");
    } catch (err: any) {
      toast({ title: "فشل الرفض", description: err.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell
      title="موافقات إعادة الطباعة"
      subtitle="مراجعة طلبات إعادة طباعة الوثائق وإصدار نسخ مكررة بختم رسمي."
      breadcrumbs={[{ label: "لوحات الإدارة" }, { label: "موافقات إعادة الطباعة" }]}
    >
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="h-4 w-4" />
            الطلبات
            {data?.items && (
              <span className="text-xs text-muted-foreground">({data.items.length})</span>
            )}
          </CardTitle>
          <div className="flex items-center gap-2 pt-1">
            <Label className="text-xs">الحالة:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">قيد الانتظار</SelectItem>
                <SelectItem value="approved">معتمد</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
              const cols: DataTableColumn<ReprintRequest>[] = [
                { key: "createdAt", header: "التاريخ", render: (r) => new Date(r.createdAt).toLocaleString("ar-SA") },
                { key: "requesterName", header: "طالب الإصدار", render: (r) => r.requesterName ?? `#${r.requestedBy}` },
                { key: "entityType", header: "الوثيقة", render: (r) => <span className="font-mono text-xs">{r.entityType} <span className="text-muted-foreground">#{r.entityId}</span></span> },
                { key: "reason", header: "السبب", render: (r) => <span className="line-clamp-2">{r.reason ?? "—"}</span> },
                ...(statusFilter !== "pending" ? [{
                  key: "approvedAt" as const,
                  header: "معالجة بواسطة",
                  render: (r: ReprintRequest) => (
                    <span className="text-xs text-muted-foreground">
                      {r.approvedAt ? new Date(r.approvedAt).toLocaleDateString("ar-SA") : "—"}
                      {r.rejectedReason && (
                        <div className="text-status-error-foreground mt-1">
                          <AlertTriangle className="inline h-3 w-3 me-1" />
                          {r.rejectedReason}
                        </div>
                      )}
                    </span>
                  ),
                }] : []),
                {
                  key: "status", header: "", render: (r) => r.status === "pending" ? (
                    <div className="flex gap-1 whitespace-nowrap">
                      <Button size="sm" variant="default" className="gap-1" onClick={() => approve(r)} disabled={busyId === r.id}>
                        <Check className="h-3 w-3" />موافقة
                      </Button>
                      <Button size="sm" variant="destructive" className="gap-1" onClick={() => setRejecting(r)} disabled={busyId === r.id}>
                        <X className="h-3 w-3" />رفض
                      </Button>
                    </div>
                  ) : (
                    <span className={r.status === "approved" ? "text-status-success-foreground text-xs" : "text-status-error-foreground text-xs"}>
                      {r.status === "approved" ? "✓ معتمد" : "✗ مرفوض"}
                    </span>
                  ),
                },
              ];
              return (
                <DataTable
                  data={data?.items ?? []}
                  rowKey={(r) => String(r.id)}
                  columns={cols}
                  noToolbar
                  pageSize={0}
                  isLoading={isLoading}
                  emptyMessage={statusFilter === "pending" ? "لا توجد طلبات إعادة طباعة قيد الانتظار." : "لا توجد طلبات بهذه الحالة."}
                />
              );
            })()}
        </CardContent>
      </Card>

      <Dialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>رفض طلب إعادة الطباعة</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>سبب الرفض</Label>
            <Textarea
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="اشرح للموظف الطالب سبب الرفض ليتمكن من تصحيحه."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              onClick={submitRejection}
              disabled={!rejectReason || busyId !== null}
            >
              تأكيد الرفض
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
