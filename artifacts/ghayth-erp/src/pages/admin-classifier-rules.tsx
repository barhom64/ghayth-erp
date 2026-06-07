/**
 * Admin → قواعد تصنيف الـ inbox (PR-C of the comms plan).
 *
 * Lets operators add/edit/disable the keyword rules the inbox auto-
 * classifier uses to decide priority, SLA window, and which role
 * receives the generated task.
 *
 * Same tenant-safety pattern as /admin/notification-routing: editing a
 * global default forks a company override server-side instead of
 * mutating the shared row.
 */
import { useState } from "react";
import {
  PageShell,
  DataTable,
  PageStatusBadge,
  type DataTableColumn,
} from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { Tags, Plus, Trash2, RefreshCw, Pencil } from "lucide-react";

interface RuleRow {
  id: number;
  companyId: number | null;
  name: string;
  type: string;
  priority: "low" | "normal" | "high" | "urgent";
  titlePrefix: string;
  patterns: string[];
  assignmentRole: string | null;
  slaHours: number;
  isActive: boolean;
  sortOrder: number;
  description: string | null;
}

const ROLE_OPTIONS = [
  { value: "support_agent",   label: "موظف دعم" },
  { value: "support_manager", label: "مدير الدعم" },
  { value: "accountant",      label: "محاسب" },
  { value: "branch_manager",  label: "مدير الفرع" },
  { value: "hr_manager",      label: "مدير الموارد البشرية" },
  { value: "owner",           label: "المالك" },
];

const PRIORITY_LABEL: Record<RuleRow["priority"], string> = {
  low: "منخفضة", normal: "عادية", high: "عالية", urgent: "عاجلة",
};

export default function AdminClassifierRules() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<RuleRow | null>(null);

  const { data: resp, isLoading, error, refetch } =
    useApiQuery<{ data: RuleRow[] }>(["classifier-rules"], "/admin/classifier-rules/rules");
  const rules = resp?.data ?? [];

  const upsertMut = useMutation({
    mutationFn: (b: Partial<RuleRow> & { id?: number }) =>
      b.id
        ? apiFetch(`/admin/classifier-rules/rules/${b.id}`, {
            method: "PATCH", body: JSON.stringify(b),
          })
        : apiFetch(`/admin/classifier-rules/rules`, {
            method: "POST", body: JSON.stringify(b),
          }),
    onSuccess: () => {
      toast({ title: editing ? "تم حفظ التعديل" : "أُضيفت القاعدة" });
      setEditorOpen(false); setEditing(null);
      void refetch();
    },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/admin/classifier-rules/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "حُذفت / عُطّلت محلياً" }); void refetch(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/admin/classifier-rules/rules/${id}`, {
        method: "PATCH", body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => { toast({ title: "تم التحديث" }); void refetch(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const columns: DataTableColumn<RuleRow>[] = [
    {
      key: "name", header: "الاسم", searchable: true,
      render: (r) => (
        <div>
          <p className="text-xs font-medium">{r.name}</p>
          {r.description && <p className="text-[10px] text-muted-foreground">{r.description}</p>}
        </div>
      ),
    },
    { key: "type", header: "النوع", render: (r) => <span className="font-mono text-xs">{r.type}</span> },
    {
      key: "priority", header: "الأولوية",
      render: (r) => <Badge variant="outline" className="text-[10px]">{PRIORITY_LABEL[r.priority]}</Badge>,
    },
    {
      key: "patterns", header: "الأنماط",
      render: (r) => (
        <div className="flex flex-wrap gap-1 max-w-[14rem]">
          {(r.patterns ?? []).map((p, i) => (
            <Badge key={i} variant="outline" className="text-[10px] font-mono">{p}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: "assignmentRole", header: "الإسناد",
      render: (r) => (
        <span className="text-xs">
          {ROLE_OPTIONS.find((o) => o.value === r.assignmentRole)?.label ?? r.assignmentRole ?? "—"}
        </span>
      ),
    },
    {
      key: "slaHours", header: "SLA",
      render: (r) => <span className="font-mono text-xs">{r.slaHours} س</span>,
    },
    {
      key: "isActive", header: "مفعّلة",
      render: (r) => (
        <Button
          variant="ghost" size="sm"
          onClick={() => toggleMut.mutate({ id: r.id, isActive: !r.isActive })}
        >
          {r.isActive ? "مفعّلة" : "معطّلة"}
        </Button>
      ),
    },
    {
      key: "actions", header: "",
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => { setEditing(r); setEditorOpen(true); }}>
            <Pencil className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => deleteMut.mutate(r.id)}>
            <Trash2 className="w-3 h-3 text-status-error-foreground" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageShell
      title="قواعد تصنيف الـ inbox"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/admin/communication-control", label: "نظام الاتصالات" },
        { label: "قواعد التصنيف" },
      ]}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RefreshCw className="w-3 h-3 me-1" />تحديث
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setEditorOpen(true); }}>
            <Plus className="w-3 h-3 me-1" />قاعدة جديدة
          </Button>
        </div>
      }
    >
      <PageStateWrapper isLoading={isLoading && !resp} error={error} onRetry={refetch}>
        <div className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3 text-xs text-indigo-900">
          <p className="font-medium mb-1 flex items-center gap-2">
            <Tags className="w-3 h-3" /> كيف تعمل قواعد التصنيف؟
          </p>
          <p>
            عند وصول رسالة، يفحص النظام أنماط (regex) كل قاعدة على الموضوع + جزء من المتن.
            أول قاعدة تطابق تحدّد <strong>نوع المهمّة المُنشأة + أولويتها + موعد الاستجابة (SLA)</strong>،
            ومَن يستلمها بحسب الدور المسجَّل. القواعد التي تظهر بـ companyId=NULL هي الافتراضيات
            المشتركة — تعديلها يُنشئ نسخة محلية لشركتك دون المساس بالباقي.
          </p>
        </div>

        <Card className="mt-3">
          <CardContent className="p-0">
            <DataTable<RuleRow>
              columns={columns}
              data={rules}
              emptyMessage="لا توجد قواعد"
            />
          </CardContent>
        </Card>
      </PageStateWrapper>

      <RuleEditorDialog
        open={editorOpen}
        rule={editing}
        onClose={() => { setEditorOpen(false); setEditing(null); }}
        onSave={(b) => upsertMut.mutate({ ...b, id: editing?.id })}
        isSubmitting={upsertMut.isPending}
      />
    </PageShell>
  );
}

function RuleEditorDialog({
  open, rule, onClose, onSave, isSubmitting,
}: {
  open: boolean;
  rule: RuleRow | null;
  onClose: () => void;
  onSave: (b: Partial<RuleRow>) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState(rule?.name ?? "");
  const [type, setType] = useState(rule?.type ?? "request");
  const [priority, setPriority] = useState<RuleRow["priority"]>(rule?.priority ?? "normal");
  const [titlePrefix, setTitlePrefix] = useState(rule?.titlePrefix ?? "");
  const [patternsRaw, setPatternsRaw] = useState((rule?.patterns ?? []).join("\n"));
  const [assignmentRole, setAssignmentRole] = useState(rule?.assignmentRole ?? "support_agent");
  const [slaHours, setSlaHours] = useState(rule?.slaHours ?? 24);
  const [sortOrder, setSortOrder] = useState(rule?.sortOrder ?? 100);
  const [description, setDescription] = useState(rule?.description ?? "");

  const patterns = patternsRaw.split("\n").map((s) => s.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "تعديل قاعدة" : "قاعدة تصنيف جديدة"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>الاسم</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: شكوى" />
            </div>
            <div>
              <Label>النوع</Label>
              <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="complaint" className="font-mono" />
            </div>
          </div>
          <div>
            <Label>الأنماط (regex، نمط في كل سطر)</Label>
            <Textarea
              dir="ltr"
              rows={3}
              value={patternsRaw}
              onChange={(e) => setPatternsRaw(e.target.value)}
              placeholder={"شكوى\ncomplaint"}
              className="font-mono text-sm"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {patterns.length} نمط — يُجرَّب كل واحد case-insensitive على الموضوع والمتن.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>الأولوية</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as RuleRow["priority"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["low", "normal", "high", "urgent"] as const).map((p) => (
                    <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>SLA (ساعات)</Label>
              <Input
                type="number" dir="ltr"
                min={1} max={720}
                value={slaHours}
                onChange={(e) => setSlaHours(Number(e.target.value) || 24)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>الإسناد للدور</Label>
              <Select value={assignmentRole} onValueChange={setAssignmentRole}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>ترتيب</Label>
              <Input
                type="number" dir="ltr"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 100)}
              />
            </div>
          </div>
          <div>
            <Label>بادئة العنوان</Label>
            <Input value={titlePrefix} onChange={(e) => setTitlePrefix(e.target.value)} placeholder="شكوى من" />
          </div>
          <div>
            <Label>وصف اختياري</Label>
            <Textarea rows={2} value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            disabled={isSubmitting || !name || patterns.length === 0 || !titlePrefix || !type}
            onClick={() => onSave({
              name, type, priority, titlePrefix, patterns,
              assignmentRole, slaHours, sortOrder,
              description: description || null,
            })}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
