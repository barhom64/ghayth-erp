import { useState } from "react";
import { formatDateAr } from "@/lib/formatters";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, FileText, FileSignature, Send, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PrintPreviewModal } from "@/components/print-layout";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";
import { useAuth } from "@/lib/auth";
import { useSortedData } from "@/hooks/use-sorted-data";
import { SortableTableHead } from "@/components/sortable-table-head";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useAppContext } from "@/contexts/app-context";
import { useQueryClient } from "@tanstack/react-query";
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
  const { data } = useApiQuery<any>(["official-letters"], "/hr/official-letters");
  const items = data?.data || [];
  const { toast } = useToast();
  const [form, setForm] = useState({ employeeId: "", type: "general", subject: "", content: "" });
  const createMut = useApiMutation("/hr/official-letters", "POST", [["official-letters"]]);
  const { user } = useAuth();
  const branch = useBranchLetterhead(user?.branchId);
  const { roleLevel } = useAppContext();
  const canApprove = roleLevel >= 70;
  const qc = useQueryClient();
  const [advFilters, setAdvFilters] = useFilters();

  const filtered = applyFilters(items, advFilters, {
    searchFields: ["", ""],
    statusField: "",
    dateField: "",
  });
  const { sortedData, sortState, handleSort } = useSortedData(filtered);

  const handleSubmit = async () => {
    try {
      await createMut.mutateAsync({ ...form, employeeId: Number(form.employeeId) || null });
      toast({ title: "تم إنشاء الخطاب" });
      setShowForm(false);
      setForm({ employeeId: "", type: "general", subject: "", content: "" });
    } catch (err: unknown) {
      toast({ variant: "destructive", title: "حدث خطأ", description: getErrorMessage(err) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">الخطابات الرسمية</h1>
          <p className="text-sm text-muted-foreground mt-0.5">إصدار ومتابعة الخطابات الرسمية للموظفين</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 me-1" />{showForm ? "إلغاء" : "خطاب جديد"}
        </Button>
      </div>

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

      <div className="border rounded-lg bg-card overflow-hidden"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <SortableTableHead column="subject" label="الموضوع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="type" label="النوع" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="employeeName" label="الموظف" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="createdAt" label="التاريخ" sortState={sortState} onSort={handleSort} />
            <SortableTableHead column="status" label="الحالة" sortState={sortState} onSort={handleSort} />
            <th className="p-3 text-start font-medium">إجراءات</th>
            {canApprove && <th className="p-3 text-start font-medium">اعتماد</th>}
          </TableRow></TableHeader>
          <TableBody>
            {(sortedData || []).map((l: any) => (
              <tr key={l.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-medium">{l.subject}</td>
                <td className="p-3">{typeMap[l.type] || l.type}</td>
                <td className="p-3 text-gray-500">{l.employeeName || "-"}</td>
                <td className="p-3 text-gray-500">{l.createdAt ? formatDateAr(l.createdAt) : "-"}</td>
                <td className="p-3"><StatusBadge status={l.status} /></td>
                <td className="p-3">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewLetter(l)} title="معاينة وطباعة">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
                {canApprove && (
                  <td className="p-3">
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
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={canApprove ? 7 : 6} className="p-8 text-center text-gray-400">لا توجد خطابات</td></tr>}
          </TableBody>
        </Table>
      </div></div>

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
    </div>
  );
}
