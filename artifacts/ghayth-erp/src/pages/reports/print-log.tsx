/**
 * Print Log — full history of every printed document.
 * Filters: branch, user, entityType, date range. Each row exposes:
 *   - re-display (downloads the stored PDF/HTML if retained)
 *   - request reprint (creates a print_reprint_request)
 */

import { useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Repeat, Printer, AlertTriangle } from "lucide-react";
import { PageHeader } from "@workspace/ui-core";

interface JobRow {
  id: number;
  jobId: string;
  entityType: string;
  entityId: string;
  format: string;
  paperSize: string | null;
  copyNumber: number;
  isReprint: boolean;
  watermark: string | null;
  status: string;
  createdAt: string;
  pdfStorageKey: string | null;
  branchId: number | null;
  branchName: string | null;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
}

export default function PrintLogPage() {
  const { toast } = useToast();
  const [branchId, setBranchId] = useState<string>("all");
  const [entityType, setEntityType] = useState<string>("all");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const { data: branchesData } = useApiQuery<any>(["settings-branches"], "/settings/branches");
  const branches = (branchesData?.data ?? branchesData?.items ?? []) as Array<{ id: number; name: string }>;

  const qs = new URLSearchParams();
  if (branchId !== "all") qs.set("branchId", branchId);
  if (entityType !== "all") qs.set("entityType", entityType);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);

  const { data, isLoading, refetch } = useApiQuery<{ items: JobRow[] }>(
    ["print-jobs", qs.toString()],
    `/print/jobs?${qs.toString()}`
  );

  async function reprint(j: JobRow) {
    const reason = prompt("سبب طلب إعادة الطباعة:");
    if (!reason) return;
    try {
      await apiFetch(`/print/reprint-requests`, {
        method: "POST",
        body: JSON.stringify({ entityType: j.entityType, entityId: j.entityId, reason }),
      });
      toast({ title: "تم إرسال طلب إعادة الطباعة", description: "بانتظار موافقة المدير." });
    } catch (err: any) {
      toast({ title: "فشل الطلب", description: err.message, variant: "destructive" });
    }
  }

  async function download(j: JobRow) {
    if (!j.pdfStorageKey) {
      toast({
        title: "النسخة غير محفوظة",
        description: "هذه الطباعة لم يتم حفظ نسخة منها (تم بثها مباشرة).",
        variant: "destructive",
      });
      return;
    }
    window.open(`/api/print/jobs/${j.jobId}/download`, "_blank");
  }

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="سجل المطبوعات"
        subtitle="كل طباعة أو إعادة طباعة في النظام، مع الفرع والمستخدم ورقم النسخة."
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">المرشّحات</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>الفرع</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الكيان</Label>
              <Select value={entityType} onValueChange={setEntityType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="invoice">فاتورة</SelectItem>
                  <SelectItem value="quotation">عرض سعر</SelectItem>
                  <SelectItem value="receipt_voucher">سند قبض</SelectItem>
                  <SelectItem value="payment_voucher">سند صرف</SelectItem>
                  <SelectItem value="pos_receipt">إيصال POS</SelectItem>
                  <SelectItem value="purchase_order">أمر شراء</SelectItem>
                  <SelectItem value="delivery_note">سند تسليم</SelectItem>
                  <SelectItem value="payroll">إيصال راتب</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>من تاريخ</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>إلى تاريخ</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Printer className="h-4 w-4" /> المطبوعات
            {data?.items && (
              <span className="text-xs text-muted-foreground">({data.items.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground p-4 text-center">جارٍ التحميل…</div>
          ) : !data?.items?.length ? (
            <div className="text-sm text-muted-foreground p-4 text-center">لا توجد مطبوعات تطابق الفلاتر.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-right p-2">التاريخ</th>
                    <th className="text-right p-2">المستخدم</th>
                    <th className="text-right p-2">الفرع</th>
                    <th className="text-right p-2">الوثيقة</th>
                    <th className="text-right p-2">الصيغة</th>
                    <th className="text-right p-2">النسخة</th>
                    <th className="text-right p-2">الحالة</th>
                    <th className="text-right p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((j) => (
                    <tr key={j.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 whitespace-nowrap">
                        {new Date(j.createdAt).toLocaleString("ar-SA")}
                      </td>
                      <td className="p-2">{j.userName ?? j.userEmail ?? `#${j.userId ?? "—"}`}</td>
                      <td className="p-2">{j.branchName ?? "—"}</td>
                      <td className="p-2 font-mono text-xs">
                        {j.entityType} <span className="text-muted-foreground">#{j.entityId}</span>
                      </td>
                      <td className="p-2">{j.format}</td>
                      <td className="p-2">
                        {j.copyNumber > 1 ? (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-3 w-3" /> {j.copyNumber}
                          </span>
                        ) : (
                          j.copyNumber
                        )}
                      </td>
                      <td className="p-2">
                        <span
                          className={
                            j.status === "done"
                              ? "text-green-600"
                              : j.status === "failed"
                                ? "text-red-600"
                                : "text-muted-foreground"
                          }
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="p-2 text-left whitespace-nowrap">
                        <Button size="sm" variant="ghost" onClick={() => download(j)} title="إعادة عرض">
                          <Download className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => reprint(j)} title="طلب إعادة طباعة">
                          <Repeat className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
