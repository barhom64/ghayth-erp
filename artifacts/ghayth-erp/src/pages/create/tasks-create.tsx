import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useApiMutation, useApiQuery, asList } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreatePageLayout, AutoField, CreationDateField } from "@/components/create-page-layout";
import { useToast } from "@/hooks/use-toast";
import { useAutoDraft } from "@/hooks/use-auto-draft";
import { Badge } from "@/components/ui/badge";
import { Link2 } from "lucide-react";
import { Autocomplete, type AutocompleteOption } from "@/components/ui/autocomplete";
import { FileDropZone, type Attachment } from "@/components/shared/file-drop-zone";

const ENTITY_TYPE_OPTIONS = [
  { value: "", label: "— بدون ربط —" },
  { value: "maintenance_request", label: "طلب صيانة" },
  { value: "property_unit", label: "وحدة عقارية" },
  { value: "vehicle", label: "مركبة" },
  { value: "client", label: "عميل" },
  { value: "contract", label: "عقد" },
  { value: "project", label: "مشروع" },
  { value: "legal_case", label: "قضية قانونية" },
];

export default function TasksCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const createMut = useApiMutation("/tasks", "POST", [["tasks"]]);
  const { data: clientsData } = useApiQuery<{ data: any[] }>(["clients-list"], "/clients");
  const clients = clientsData?.data || [];
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [entitySearch, setEntitySearch] = useState("");

  const getInitial = () => {
    const copy = searchParams.get("copy");
    if (copy) {
      try {
        const data = JSON.parse(copy);
        return { title: data.title || "", description: data.description || "", type: data.type || "task", priority: data.priority || "medium", scheduledStart: "", clientName: data.clientName || "", linkedEntityType: "", linkedEntityId: "" };
      } catch { /* ignore */ }
    }
    return {
      title: searchParams.get("title") || "",
      description: "",
      type: searchParams.get("type") || "task",
      priority: searchParams.get("priority") || "medium",
      scheduledStart: "",
      clientName: "",
      linkedEntityType: searchParams.get("linkedEntityType") || "",
      linkedEntityId: searchParams.get("linkedEntityId") || "",
    };
  };

  const { form, setForm, clearDraft, hasDraft } = useAutoDraft("tasks_create", getInitial());

  const { data: entityResults } = useApiQuery<any>(
    ["entity-search", form.linkedEntityType, entitySearch],
    `/tasks/entity-search?type=${form.linkedEntityType}&q=${encodeURIComponent(entitySearch)}`,
    !!form.linkedEntityType && entitySearch.length > 0
  );
  const entityOptions: AutocompleteOption[] = (Array.isArray(entityResults) ? entityResults : []).map((item: any) => ({
    value: String(item.id),
    label: item.name || item.unitNumber || item.title || item.plateNumber || item.ref || item.description || `#${item.id}`,
    subtitle: item.category || item.email || item.phone || undefined,
  }));

  const handleSubmit = async () => {
    if (!form.title) {
      toast({ variant: "destructive", title: "يرجى إدخال عنوان المهمة" });
      return;
    }
    const payload: any = { ...form, assignedTo: user?.name || "" };
    if (!payload.linkedEntityType) { delete payload.linkedEntityType; delete payload.linkedEntityId; }
    try {
      await createMut.mutateAsync(payload);
      clearDraft();
      toast({ title: "تم إنشاء المهمة بنجاح" });
      setLocation("/tasks");
    } catch (err: any) {
      toast({ variant: "destructive", title: "حدث خطأ أثناء إنشاء المهمة", description: err?.message });
    }
  };

  return (
    <CreatePageLayout title="مهمة جديدة" backPath="/tasks">
      {hasDraft && (
        <div className="mb-4 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700">
          <span>تم استعادة مسودة محفوظة سابقاً</span>
          <Button variant="ghost" size="sm" className="text-amber-600 h-7 px-2" onClick={clearDraft}>مسح المسودة</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <AutoField label="المنشئ" value={user?.name || "-"} />
        <CreationDateField />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><Label>العنوان</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></div>
        <div>
          <Label>النوع</Label>
          <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="task">مهمة عامة</SelectItem>
              <SelectItem value="meeting">اجتماع</SelectItem>
              <SelectItem value="call">مكالمة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>الأولوية</Label>
          <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">منخفضة</SelectItem>
              <SelectItem value="medium">متوسطة</SelectItem>
              <SelectItem value="high">عالية</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>الموعد</Label><Input className="mt-1" type="datetime-local" value={form.scheduledStart} onChange={(e) => setForm((f) => ({ ...f, scheduledStart: e.target.value }))} /></div>
        <div>
          <Label>العميل</Label>
          <Select value={form.clientName || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, clientName: v === "_none" ? "" : v }))}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="— بدون عميل —" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">— بدون عميل —</SelectItem>
              {clients.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2"><Label>الوصف</Label><Textarea className="mt-1" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} /></div>

        <div className="md:col-span-2 border-t pt-4 mt-2">
          <div className="flex items-center gap-2 mb-3">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <Label className="text-base font-semibold">ربط بكيان (اختياري)</Label>
            {form.linkedEntityType && (
              <Badge variant="secondary" className="text-xs">
                {ENTITY_TYPE_OPTIONS.find(o => o.value === form.linkedEntityType)?.label}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>نوع الكيان</Label>
              <Select value={form.linkedEntityType || "_none"} onValueChange={(v) => setForm((f) => ({ ...f, linkedEntityType: v === "_none" ? "" : v, linkedEntityId: "" }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="— بدون ربط —" /></SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value || "_none"} value={opt.value || "_none"}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.linkedEntityType && (
              <div>
                <Label>اختر الكيان</Label>
                <Autocomplete
                  options={entityOptions}
                  value={form.linkedEntityId}
                  onChange={(val) => setForm((f) => ({ ...f, linkedEntityId: String(val || "") }))}
                  placeholder="ابحث عن الكيان..."
                  loading={false}
                  emptyMessage="لا توجد نتائج"
                  className="mt-1"
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <FileDropZone files={attachments} onFilesChange={setAttachments} />
      <div className="flex justify-end gap-3 pt-6">
        <Button variant="outline" onClick={() => setLocation("/tasks")}>إلغاء</Button>
        <Button onClick={handleSubmit} disabled={!form.title || createMut.isPending}>
          {createMut.isPending ? "جاري الحفظ..." : "حفظ"}
        </Button>
      </div>
    </CreatePageLayout>
  );
}
