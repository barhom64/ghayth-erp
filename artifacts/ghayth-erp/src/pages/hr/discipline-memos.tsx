import { useState } from "react";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/formatters";
// Phase A — HR discipline memos on unified primitives.
import { PageShell } from "@/components/page-shell";
import { PageStatusBadge } from "@/components/page-status-badge";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FileText, Plus, Gavel } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// HR-U3 — حُذفت STATUS_STYLES المحلية. حالات المذكرات التأديبية مُعرَّفة
// في STATUS_MAP.memo (pending_employee/pending_manager/pending_gm/approved/
// rejected/cancelled) مع expired في الـ shared.

const INCIDENT_LABELS: Record<string, string> = {
  late: "تأخر",
  absence: "غياب",
  early_leave: "خروج مبكر",
  behavior: "سلوك",
  organization: "تنظيم",
  gps_out_of_range: "خارج النطاق",
  custom: "أخرى",
};

interface Memo {
  id: number;
  memoNumber: string;
  incidentType: string;
  incidentDate: string;
  incidentDurationMinutes?: number;
  status: string;
  source: string;
  occurrenceCount: number;
  appliedPenaltyLabel?: string;
  appliedDeductionAmount?: string;
  appliedExtraDeduction?: string;
  terminationDecided: boolean;
  createdAt: string;
  employeeName: string;
  empNumber: string;
  regSection?: string;
  regArticle?: number;
  regTitle?: string;
}

export default function DisciplineMemosPage() {
  const { data: listData, isLoading } = useApiQuery<{ data: Memo[]; total: number }>(
    ["discipline-memos"],
    "/hr/discipline/memos"
  );
  const { data: stats } = useApiQuery<any>(["discipline-memos-stats"], "/hr/discipline/stats");
  const { toast } = useToast();
  const memos = listData?.data ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    assignmentId: "",
    incidentType: "late",
    incidentDate: new Date().toISOString().slice(0, 10),
    incidentDurationMinutes: "",
    absenceDays: "",
    incidentDescription: "",
    disruptsOthers: false,
  });

  const resetForm = () => {
    setForm({
      assignmentId: "",
      incidentType: "late",
      incidentDate: new Date().toISOString().slice(0, 10),
      incidentDurationMinutes: "",
      absenceDays: "",
      incidentDescription: "",
      disruptsOthers: false,
    });
  };

  const createMut = useApiMutation<any, Record<string, any>>(
    "/hr/discipline/memos",
    "POST",
    [["discipline-memos"], ["discipline-memos-stats"]],
    {
      successMessage: "تم إنشاء المحضر",
      onSuccess: () => {
        resetForm();
        setShowCreate(false);
      },
    }
  );
  const creating = createMut.isPending;

  const submitCreate = () => {
    if (!form.assignmentId) {
      toast({ variant: "destructive", title: "التعيين مطلوب" });
      return;
    }
    createMut.mutate({
      assignmentId: Number(form.assignmentId),
      incidentType: form.incidentType,
      incidentDate: form.incidentDate,
      incidentDurationMinutes: form.incidentDurationMinutes
        ? Number(form.incidentDurationMinutes)
        : undefined,
      absenceDays: form.absenceDays ? Number(form.absenceDays) : undefined,
      incidentDescription: form.incidentDescription,
      disruptsOthers: form.disruptsOthers,
    });
  };

  const columns: DataTableColumn<Memo>[] = [
    {
      key: "memoNumber",
      header: "رقم المحضر",
      sortable: true,
      render: (m) => (
        <Link href={`/hr/discipline/memos/${m.id}`} className="font-mono text-primary hover:underline">
          {m.memoNumber}
        </Link>
      ),
    },
    {
      key: "employeeName",
      header: "الموظف",
      sortable: true,
      render: (m) => (
        <div className="flex flex-col">
          <span className="font-medium">{m.employeeName}</span>
          <span className="text-xs text-muted-foreground">{m.empNumber}</span>
        </div>
      ),
    },
    {
      key: "incidentType",
      header: "الواقعة",
      sortable: true,
      render: (m) => (
        <div className="flex flex-col gap-0.5">
          <Badge variant="outline" className="w-fit">{INCIDENT_LABELS[m.incidentType] ?? m.incidentType}</Badge>
          <span className="text-xs text-muted-foreground">{m.incidentDate}</span>
          {m.incidentDurationMinutes ? (
            <span className="text-xs text-muted-foreground">{m.incidentDurationMinutes} د</span>
          ) : null}
        </div>
      ),
    },
    {
      key: "regulation",
      header: "المادة",
      render: (m) =>
        m.regArticle ? (
          <span className="text-xs">{m.regSection} #{m.regArticle}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "occurrenceCount",
      header: "التكرار",
      render: (m) => <Badge variant="outline">{m.occurrenceCount}/4</Badge>,
    },
    {
      key: "appliedPenaltyLabel",
      header: "العقوبة",
      render: (m) => m.appliedPenaltyLabel || <span className="text-muted-foreground">—</span>,
    },
    {
      key: "deduction",
      header: "الخصم",
      className: "text-red-600 font-medium",
      render: (m) =>
        formatCurrency(Number(m.appliedDeductionAmount ?? 0) + Number(m.appliedExtraDeduction ?? 0)),
    },
    {
      key: "status",
      header: "الحالة",
      sortable: true,
      render: (m) => <PageStatusBadge status={m.status} domain="memo" />,
    },
    {
      key: "source",
      header: "المصدر",
      render: (m) => (
        <Badge variant="outline" className="text-xs">
          {m.source === "auto" ? "تلقائي" : m.source === "manual" ? "يدوي" : m.source}
        </Badge>
      ),
    },
  ];

  return (
    <PageShell
      title="محاضر الاستفسار"
      subtitle="سير العمل الثلاثي: الموظف → المدير المباشر → المدير العام"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <div className="flex gap-2">
          <Link href="/hr/discipline/regulation">
            <Button variant="outline">
              <FileText className="w-4 h-4 me-2" />
              لائحة الانضباط
            </Button>
          </Link>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 me-2" />
            محضر جديد
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: "بانتظار الموظف",
            value: stats?.pendingEmployee ?? 0,
            color: "text-blue-600 bg-blue-50",
          },
          {
            label: "بانتظار المدير",
            value: stats?.pendingManager ?? 0,
            color: "text-indigo-600 bg-indigo-50",
          },
          {
            label: "بانتظار المدير العام",
            value: stats?.pendingGm ?? 0,
            color: "text-purple-600 bg-purple-50",
          },
          {
            label: "معتمدة",
            value: stats?.approved ?? 0,
            color: "text-green-600 bg-green-50",
          },
          {
            label: "إجمالي الخصومات",
            value: formatCurrency(Number(stats?.totalDeductions ?? 0)),
            color: "text-red-600 bg-red-50",
          },
        ].map((c) => (
          <Card key={c.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", c.color.split(" ")[1])}>
                <Gavel className={cn("w-6 h-6", c.color.split(" ")[0])} />
              </div>
              <div>
                <p className="text-xl font-bold">{c.value}</p>
                <p className="text-xs text-gray-500">{c.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={memos}
        isLoading={isLoading}
        emptyMessage="لا توجد محاضر استفسار بعد"
        pageSize={20}
      />

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>محضر استفسار جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>رقم التعيين (assignmentId)</Label>
              <Input
                type="number"
                value={form.assignmentId}
                onChange={(e) => setForm({ ...form, assignmentId: e.target.value })}
                placeholder="معرّف التعيين للموظف"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>نوع الواقعة</Label>
                <Select
                  value={form.incidentType}
                  onValueChange={(v) => setForm({ ...form, incidentType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(INCIDENT_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>تاريخ الواقعة</Label>
                <Input
                  type="date"
                  value={form.incidentDate}
                  onChange={(e) => setForm({ ...form, incidentDate: e.target.value })}
                />
              </div>
              {(form.incidentType === "late" || form.incidentType === "early_leave") && (
                <div>
                  <Label>المدة (دقيقة)</Label>
                  <Input
                    type="number"
                    value={form.incidentDurationMinutes}
                    onChange={(e) =>
                      setForm({ ...form, incidentDurationMinutes: e.target.value })
                    }
                  />
                </div>
              )}
              {form.incidentType === "absence" && (
                <div>
                  <Label>عدد أيام الغياب</Label>
                  <Input
                    type="number"
                    value={form.absenceDays}
                    onChange={(e) => setForm({ ...form, absenceDays: e.target.value })}
                  />
                </div>
              )}
            </div>
            {form.incidentType === "late" && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.disruptsOthers}
                  onChange={(e) => setForm({ ...form, disruptsOthers: e.target.checked })}
                />
                ترتّب على التأخر تعطيل عمّال آخرين
              </label>
            )}
            <div>
              <Label>وصف الواقعة</Label>
              <Textarea
                rows={3}
                value={form.incidentDescription}
                onChange={(e) => setForm({ ...form, incidentDescription: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
              إلغاء
            </Button>
            <Button onClick={submitCreate} disabled={creating}>
              {creating ? "جاري الإنشاء..." : "إنشاء المحضر"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
