import { useState } from "react";
import { Link } from "wouter";
import { formatCurrency } from "@/lib/formatters";
import { useApiQuery, apiFetch, getErrorMessage } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FileText, Plus, Gavel, Clock, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, { label: string; color: string; icon: any }> = {
  pending_employee: { label: "بانتظار الموظف", color: "bg-blue-100 text-blue-700", icon: Clock },
  pending_manager: { label: "بانتظار المدير", color: "bg-indigo-100 text-indigo-700", icon: Clock },
  pending_gm: { label: "بانتظار المدير العام", color: "bg-purple-100 text-purple-700", icon: Clock },
  approved: { label: "معتمد", color: "bg-green-100 text-green-700", icon: CheckCircle },
  rejected: { label: "مرفوض", color: "bg-red-100 text-red-700", icon: XCircle },
  cancelled: { label: "ملغي", color: "bg-gray-100 text-gray-700", icon: XCircle },
  expired: { label: "منتهي", color: "bg-gray-100 text-gray-500", icon: Clock },
};

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
  const qc = useQueryClient();
  const memos = listData?.data ?? [];
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
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

  const submitCreate = async () => {
    if (!form.assignmentId) {
      toast({ variant: "destructive", title: "التعيين مطلوب" });
      return;
    }
    setCreating(true);
    try {
      await apiFetch("/hr/discipline/memos", {
        method: "POST",
        body: JSON.stringify({
          assignmentId: Number(form.assignmentId),
          incidentType: form.incidentType,
          incidentDate: form.incidentDate,
          incidentDurationMinutes: form.incidentDurationMinutes
            ? Number(form.incidentDurationMinutes)
            : undefined,
          absenceDays: form.absenceDays ? Number(form.absenceDays) : undefined,
          incidentDescription: form.incidentDescription,
          disruptsOthers: form.disruptsOthers,
        }),
      });
      toast({ title: "تم إنشاء المحضر" });
      qc.invalidateQueries({ queryKey: ["discipline-memos"] });
      qc.invalidateQueries({ queryKey: ["discipline-memos-stats"] });
      resetForm();
      setShowCreate(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "فشل الإنشاء",
        description: getErrorMessage(err),
      });
    } finally {
      setCreating(false);
    }
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
      render: (m) => {
        const s = STATUS_STYLES[m.status] ?? { label: m.status, color: "", icon: Clock };
        const Icon = s.icon;
        return (
          <Badge className={cn(s.color, "gap-1")}>
            <Icon className="w-3 h-3" />
            {s.label}
          </Badge>
        );
      },
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">محاضر الاستفسار</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            سير العمل الثلاثي: الموظف → المدير المباشر → المدير العام
          </p>
        </div>
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
      </div>

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
    </div>
  );
}
