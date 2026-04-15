import { useState } from "react";
import { PageShell } from "@/components/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mail, Send, Inbox, FileText, Search, Plus, FileSignature, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useAppContext } from "@/contexts/app-context";
import { useAuth } from "@/lib/auth";
import { PrintPreviewModal } from "@/components/print-layout";
import { useBranchLetterhead } from "@/hooks/use-branch-letterhead";
import { ApprovalActions } from "@/components/approval-actions";

const DIRECTION_MAP: Record<string, { label: string; color: string }> = {
  inbound: { label: "وارد", color: "bg-blue-100 text-blue-700" },
  outbound: { label: "صادر", color: "bg-green-100 text-green-700" },
};

const COMM_STATUS_MAP: Record<string, { label: string; color: string }> = {
  sent: { label: "مرسل", color: "bg-green-100 text-green-700" },
  delivered: { label: "تم التسليم", color: "bg-emerald-100 text-emerald-700" },
  queued: { label: "في الانتظار", color: "bg-yellow-100 text-yellow-700" },
  received: { label: "مستلم", color: "bg-blue-100 text-blue-700" },
  failed: { label: "فشل", color: "bg-red-100 text-red-700" },
};

const HR_STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "مسودة", color: "bg-gray-100 text-gray-700" },
  issued: { label: "صادر", color: "bg-green-100 text-green-700" },
  sent: { label: "مرسل", color: "bg-blue-100 text-blue-700" },
};

const HR_TYPE_MAP: Record<string, string> = {
  general: "عام",
  employment_certificate: "شهادة عمل",
  salary_certificate: "شهادة راتب",
  experience_letter: "شهادة خبرة",
  warning_letter: "خطاب إنذار",
  termination_letter: "خطاب إنهاء خدمة",
};

function HROfficialLettersTab() {
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [previewLetter, setPreviewLetter] = useState<any>(null);
  const { data, isLoading, isError, error, refetch } = useApiQuery<any>(["official-letters"], "/hr/official-letters");
  const items = data?.data || [];
  const { toast } = useToast();
  const [form, setForm] = useState({ employeeId: "", type: "general", subject: "", content: "" });
  const createMut = useApiMutation("/hr/official-letters", "POST", [["official-letters"]]);
  const { user } = useAuth();
  const branch = useBranchLetterhead(user?.branchId);
  const { roleLevel } = useAppContext();
  const canApprove = roleLevel >= 70;

  const searchFiltered = items.filter((l: any) => !search || (l.employeeName || "").includes(search) || (l.subject || "").includes(search));

  const handleSubmit = async () => {
    try {
      await createMut.mutateAsync({ ...form, employeeId: Number(form.employeeId) || null });
      toast({ title: "تم إنشاء الخطاب" });
      setShowForm(false);
      setForm({ employeeId: "", type: "general", subject: "", content: "" });
    } catch {
      toast({ variant: "destructive", title: "حدث خطأ" });
    }
  };

  const columns: DataTableColumn<any>[] = [
    { key: "subject", header: "الموضوع", sortable: true, render: (l) => <span className="font-medium">{l.subject}</span> },
    { key: "type", header: "النوع", sortable: true, render: (l) => HR_TYPE_MAP[l.type] || l.type },
    { key: "employeeName", header: "الموظف", sortable: true, render: (l) => <span className="text-gray-500">{l.employeeName || "-"}</span> },
    { key: "createdAt", header: "التاريخ", sortable: true, render: (l) => <span className="text-gray-500">{l.createdAt ? new Date(l.createdAt).toLocaleDateString("ar-SA") : "-"}</span> },
    { key: "status", header: "الحالة", sortable: true, render: (l) => <Badge className={HR_STATUS_MAP[l.status]?.color || ""}>{HR_STATUS_MAP[l.status]?.label || l.status}</Badge> },
    {
      key: "actions",
      header: "إجراءات",
      render: (l) => (
        <Button variant="ghost" size="sm" onClick={() => setPreviewLetter(l)} title="معاينة وطباعة">
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
    ...(canApprove ? [{
      key: "approval",
      header: "اعتماد",
      render: (l: any) => (
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
    } as DataTableColumn<any>] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي الخطابات", value: items.length, icon: FileText, color: "text-blue-600 bg-blue-50" },
          { label: "مسودة", value: items.filter((l: any) => l.status === "draft").length, icon: FileSignature, color: "text-gray-600 bg-gray-50" },
          { label: "صادر", value: items.filter((l: any) => l.status === "issued").length, icon: Send, color: "text-green-600 bg-green-50" },
          { label: "مرسل", value: items.filter((l: any) => l.status === "sent").length, icon: Send, color: "text-blue-600 bg-blue-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="absolute start-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input placeholder="بحث..." className="ps-9 w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 me-1" />{showForm ? "إلغاء" : "خطاب جديد"}
        </Button>
      </div>

      {showForm && (
        <Card className="border-blue-200">
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>النوع</Label>
                <select className="w-full border rounded-md p-2 mt-1" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {Object.entries(HR_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
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
        data={searchFiltered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد خطابات رسمية"
        emptyIcon={<FileText className="h-6 w-6 text-slate-400" />}
        noToolbar
        pageSize={20}
      />

      {previewLetter && (
        <PrintPreviewModal
          open={!!previewLetter}
          onClose={() => setPreviewLetter(null)}
          branch={branch}
          documentTitle={HR_TYPE_MAP[previewLetter.type] || "خطاب رسمي"}
          documentRef={previewLetter.ref || `LTR-${previewLetter.id}`}
          documentDate={previewLetter.createdAt ? new Date(previewLetter.createdAt).toLocaleDateString("ar-SA") : ""}
        >
          <div style={{ marginBottom: "24px" }}>
            <h3 style={{ fontSize: "14pt", fontWeight: "bold", marginBottom: "12px" }}>{previewLetter.subject}</h3>
            {previewLetter.employeeName && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
                <div style={{ display: "flex", gap: "4px" }}>
                  <span style={{ color: "#555" }}>الموظف:</span>
                  <span style={{ fontWeight: 600 }}>{previewLetter.employeeName}</span>
                </div>
              </div>
            )}
          </div>
          {previewLetter.content && (
            <div style={{ whiteSpace: "pre-wrap", lineHeight: 2, fontSize: "12pt", margin: "20px 0" }}>
              {previewLetter.content}
            </div>
          )}
          <div style={{ marginTop: "60px", display: "flex", justifyContent: "space-between" }}>
            <div style={{ textAlign: "center", minWidth: "150px" }}>
              <div style={{ borderTop: "1px solid #333", marginTop: "40px", paddingTop: "4px", fontSize: "9pt" }}>توقيع المسؤول</div>
            </div>
            <div style={{ textAlign: "center", minWidth: "150px" }}>
              <div style={{ borderTop: "1px solid #333", marginTop: "40px", paddingTop: "4px", fontSize: "9pt" }}>الختم الرسمي</div>
            </div>
          </div>
        </PrintPreviewModal>
      )}
    </div>
  );
}

function GeneralLettersTab() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const { data: logResp, isLoading, isError, error, refetch } = useApiQuery<any>(["comm-log-letters"], "/communications/log?channel=email");
  const letters = asList<any>(logResp);

  const incoming = letters.filter((l: any) => l.direction === "inbound").length;
  const outgoing = letters.filter((l: any) => l.direction === "outbound").length;

  const filtered = letters.filter((l: any) => {
    if (filter !== "all" && l.direction !== filter) return false;
    if (search && !l.subject?.includes(search) && !l.toNumber?.includes(search)) return false;
    return true;
  });

  const columns: DataTableColumn<any>[] = [
    { key: "subject", header: "الموضوع", render: (l) => <span className="font-medium">{l.subject || "-"}</span> },
    { key: "direction", header: "الاتجاه", render: (l) => <Badge className={DIRECTION_MAP[l.direction]?.color}>{DIRECTION_MAP[l.direction]?.label || l.direction}</Badge> },
    { key: "contact", header: "المرسل/المستلم", render: (l) => <span className="text-gray-500">{l.toNumber || l.fromNumber || "-"}</span> },
    { key: "createdAt", header: "التاريخ", render: (l) => <span className="text-gray-500">{l.createdAt ? new Date(l.createdAt).toLocaleDateString("ar-SA") : "-"}</span> },
    { key: "status", header: "الحالة", render: (l) => <Badge className={COMM_STATUS_MAP[l.status]?.color || "bg-gray-100 text-gray-700"}>{COMM_STATUS_MAP[l.status]?.label || l.status}</Badge> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "إجمالي المراسلات", value: letters.length, icon: Mail, color: "text-blue-600 bg-blue-50" },
          { label: "صادرة", value: outgoing, icon: Send, color: "text-green-600 bg-green-50" },
          { label: "واردة", value: incoming, icon: Inbox, color: "text-purple-600 bg-purple-50" },
          { label: "في الانتظار", value: letters.filter((l: any) => l.status === "queued").length, icon: FileText, color: "text-yellow-600 bg-yellow-50" },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", c.color.split(" ")[1])}>
                <c.icon className={cn("w-5 h-5", c.color.split(" ")[0])} />
              </div>
              <div><p className="text-xl font-bold">{c.value}</p><p className="text-xs text-gray-500">{c.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="بحث في المراسلات..." value={search} onChange={(e) => setSearch(e.target.value)} className="ps-10" />
        </div>
        <select className="border rounded-md px-3 py-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">الكل</option>
          <option value="inbound">واردة</option>
          <option value="outbound">صادرة</option>
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        isLoading={isLoading}
        isError={isError}
        error={error as Error | null}
        onRetry={() => refetch()}
        emptyMessage="لا توجد مراسلات"
        emptyIcon={<Mail className="h-6 w-6 text-slate-400" />}
        noToolbar
        pageSize={20}
      />
    </div>
  );
}

export default function LettersPage() {
  return (
    <PageShell
      title="الخطابات والمراسلات"
      subtitle="إدارة الخطابات الرسمية للموارد البشرية والمراسلات العامة"
    >
      <Tabs defaultValue="hr" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="hr" className="gap-2">
            <FileSignature className="h-4 w-4" /> خطابات الموارد البشرية الرسمية
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-2">
            <Mail className="h-4 w-4" /> المراسلات العامة
          </TabsTrigger>
        </TabsList>
        <TabsContent value="hr" className="mt-4">
          <HROfficialLettersTab />
        </TabsContent>
        <TabsContent value="general" className="mt-4">
          <GeneralLettersTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
