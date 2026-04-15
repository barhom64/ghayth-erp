import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery, useApiMutation, buildErrorToast } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
// Phase A — HR official letters on unified primitives.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, FileText, FileSignature, Send, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PrintPreviewModal } from "@/components/print-layout";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";
import { useAuth } from "@/lib/auth";
import { DataTable, DataTableColumn } from "@/components/ui/data-table";
import { useAppContext } from "@/contexts/app-context";
import { ApprovalActions } from "@/components/approval-actions";
import { AdvancedFilters, useFilters, applyFilters } from "@/components/shared/advanced-filters";


const typeMap: Record<string, string> = {
  general: "عام",
  employment_certificate: "شهادة عمل",
  salary_certificate: "شهادة راتب",
  experience_letter: "شهادة خبرة",
  warning_letter: "خطاب إنذار",
  termination_letter: "خطاب إنهاء خدمة",
};

export default function OfficialLettersPage() {
  const [showForm, setShowForm] = useState(false);
  const [previewLetter, setPreviewLetter] = useState<any>(null);
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["official-letters"], "/hr/official-letters");
  const items = data?.data || [];
  const { toast } = useToast();
  const [form, setForm] = useState({ employeeId: "", type: "general", subject: "", content: "" });
  const createMut = useApiMutation("/hr/official-letters", "POST", [["official-letters"]], { silent: true });
  const { user } = useAuth();
  const branch = useBranchLetterhead(user?.branchId);
  const { roleLevel } = useAppContext();
  const canApprove = roleLevel >= 70;
  const [advFilters, setAdvFilters] = useFilters();

  const filtered = applyFilters(items, advFilters, {
    searchFields: ["subject", "employeeName"] as any,
    statusField: "status" as any,
    dateField: "createdAt" as any,
  });

  const columns: DataTableColumn<any>[] = [
    { key: "subject", header: "الموضوع", sortable: true, className: "font-medium", render: (l) => l.subject },
    { key: "type", header: "النوع", sortable: true, render: (l) => typeMap[l.type] || l.type },
    { key: "employeeName", header: "الموظف", sortable: true, className: "text-gray-500", render: (l) => l.employeeName || "-" },
    { key: "createdAt", header: "التاريخ", sortable: true, className: "text-gray-500", render: (l) => l.createdAt ? formatDateAr(l.createdAt) : "-" },
    { key: "status", header: "الحالة", sortable: true, render: (l) => <PageStatusBadge status={l.status} /> },
    {
      key: "actions",
      header: "إجراءات",
      render: (l) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setPreviewLetter(l)} title="معاينة وطباعة">
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
    {
      key: "approval",
      header: "اعتماد",
      hidden: !canApprove,
      render: (l) => (
        <ApprovalActions
          entityType="official_letter"
          entityId={l.id}
          currentStatus={l.status}
          approveEndpoint={`/hr/official-letters/${l.id}/approve`}
          rejectEndpoint={`/hr/official-letters/${l.id}/approve`}
          returnEndpoint={`/hr/official-letters/${l.id}/approve`}
          approveMethod="PATCH"
          rejectMethod="PATCH"
          returnMethod="PATCH"
          approveBody={() => ({ approved: true })}
          rejectBody={(notes) => ({ approved: false, notes })}
          returnBody={(notes) => ({ approved: null, notes })}
          pendingStatuses={["draft", "pending_approval"]}
          invalidateKeys={[["official-letters"]]}
        />
      ),
    },
  ];

  const handleSubmit = async () => {
    try {
      await createMut.mutateAsync({ ...form, employeeId: Number(form.employeeId) || null });
      toast({ title: "تم إنشاء الخطاب" });
      setShowForm(false);
      setForm({ employeeId: "", type: "general", subject: "", content: "" });
    } catch (err) {
      toast(buildErrorToast(err));
    }
  };

  return (
    <PageShell
      title="الخطابات الرسمية"
      subtitle="إصدار ومتابعة الخطابات الرسمية للموظفين"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 me-1" />{showForm ? "إلغاء" : "خطاب جديد"}
        </Button>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الخطابات", value: items.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
          { label: "مسودة", value: items.filter((l: any) => l.status === "draft").length, icon: FileSignature, color: "text-gray-600 bg-gray-50" },
          { label: "صادر", value: items.filter((l: any) => l.status === "issued").length, icon: Send, color: "text-green-600 bg-green-50" },
          { label: "مرسل", value: items.filter((l: any) => l.status === "sent").length, icon: Send, color: "text-blue-600 bg-blue-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-2xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AdvancedFilters
        config={{
          searchPlaceholder: "بحث بالموضوع أو الموظف...",
          statuses: [
            { value: "draft", label: "مسودة" },
            { value: "issued", label: "صادر" },
            { value: "sent", label: "مرسل" },
          ],
          showDateRange: true,
        }}
        values={advFilters}
        onChange={setAdvFilters}
      />

      {showForm && (
        <Card className="border-blue-200">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>النوع</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(typeMap).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>الموضوع</Label><Input className="mt-1" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              <div className="md:col-span-2"><Label>المحتوى</Label><textarea className="w-full border rounded-md p-2 mt-1 h-24" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
              <div><Button onClick={handleSubmit} disabled={!form.subject || createMut.isPending}>{createMut.isPending ? "جاري الحفظ..." : "حفظ"}</Button></div>
            </div>
          </CardContent>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        noToolbar
        emptyMessage="لا توجد خطابات"
        emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}
      />

      {previewLetter && (
        <PrintPreviewModal
          open={!!previewLetter}
          onClose={() => setPreviewLetter(null)}
          branch={branch}
          documentTitle={typeMap[previewLetter.type] || "خطاب رسمي"}
          documentRef={previewLetter.ref || `LTR-${previewLetter.id}`}
          documentDate={previewLetter.createdAt ? formatDateAr(previewLetter.createdAt) : ""}
        >
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "14pt", fontWeight: "bold", marginBottom: "12px" }}>{previewLetter.subject}</h3>
            {previewLetter.employeeName && (
              <div className="info-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                <div className="info-item" style={{ display: "flex", gap: "4px" }}>
                  <span className="info-label" style={{ color: "#555" }}>الموظف:</span>
                  <span className="info-value" style={{ fontWeight: 600 }}>{previewLetter.employeeName}</span>
                </div>
              </div>
            )}
          </div>

          {previewLetter.content && (
            <div className="letter-body" style={{ whiteSpace: "pre-wrap", lineHeight: 2, fontSize: "12pt", margin: "20px 0" }}>
              {previewLetter.content}
            </div>
          )}

          <div className="signature-area" style={{ marginTop: "60px", display: "flex", justifyContent: "space-between" }}>
            <div className="signature-box" style={{ textAlign: "center", minWidth: "150px" }}>
              <div className="signature-line" style={{ borderTop: "1px solid #333", marginTop: "40px", paddingTop: "4px", fontSize: "9pt" }}>
                توقيع المسؤول
              </div>
            </div>
            <div className="signature-box" style={{ textAlign: "center", minWidth: "150px" }}>
              <div className="signature-line" style={{ borderTop: "1px solid #333", marginTop: "40px", paddingTop: "4px", fontSize: "9pt" }}>
                الختم الرسمي
              </div>
            </div>
          </div>
        </PrintPreviewModal>
      )}
    </PageShell>
  );
}
