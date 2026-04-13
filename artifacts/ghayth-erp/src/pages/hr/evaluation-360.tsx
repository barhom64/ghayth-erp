import { useState } from "react";
import { Link } from "wouter";
// Phase A — HR 360° evaluation on unified primitives.
import { PageShell } from "@/components/page-shell";
import { useApiQuery, useApiMutation, getErrorMessage } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Target, TrendingUp, Award, Users, RefreshCw, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const statusMap: Record<string, { label: string; color: string }> = {
  open: { label: "مفتوح", color: "bg-gray-100 text-gray-700" },
  in_progress: { label: "جارٍ", color: "bg-yellow-100 text-yellow-700" },
  completed: { label: "مكتمل", color: "bg-green-100 text-green-700" },
  closed: { label: "مغلق", color: "bg-blue-100 text-blue-700" },
};

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-gray-400 text-sm">-</span>;
  const color = score >= 80 ? "text-green-600" : score >= 60 ? "text-yellow-600" : "text-red-600";
  return <span className={cn("font-bold text-lg", color)}>{score}%</span>;
}

interface Participant {
  evaluatorId: number;
  name: string;
  evaluatorRole: "manager" | "peer";
}

export default function Evaluation360Page() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ employeeId: "", period: "", notes: "" });
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [addingParticipant, setAddingParticipant] = useState({ evaluatorId: "", evaluatorRole: "peer" as "manager" | "peer" });

  const { data: cyclesData, isLoading } = useApiQuery<any>(["evaluation-cycles"], "/hr/evaluation-cycles");
  const { data: employeesData } = useApiQuery<any>(["employees-list-360"], "/employees?pageSize=200");
  const createMutation = useApiMutation("/hr/evaluation-cycles", "POST");

  const cycles = cyclesData?.data || [];
  const employees = employeesData?.data || [];

  const filtered = cycles.filter((c: any) =>
    !search || c.employeeName?.includes(search) || c.period?.includes(search)
  );

  const stats = {
    total: cycles.length,
    inProgress: cycles.filter((c: any) => c.status === 'in_progress').length,
    completed: cycles.filter((c: any) => c.status === 'completed').length,
    avgScore: cycles.length > 0
      ? Math.round(cycles.filter((c: any) => c.finalScore).reduce((s: number, c: any) => s + Number(c.finalScore), 0) /
          (cycles.filter((c: any) => c.finalScore).length || 1))
      : 0,
  };

  function addParticipant() {
    if (!addingParticipant.evaluatorId) return;
    const empId = Number(addingParticipant.evaluatorId);
    if (participants.some((p) => p.evaluatorId === empId)) {
      toast.error("هذا المقيِّم مضاف بالفعل");
      return;
    }
    const emp = employees.find((e: any) => e.id === empId);
    setParticipants([...participants, { evaluatorId: empId, name: emp?.name ?? String(empId), evaluatorRole: addingParticipant.evaluatorRole }]);
    setAddingParticipant({ evaluatorId: "", evaluatorRole: "peer" });
  }

  function removeParticipant(id: number) {
    setParticipants(participants.filter((p) => p.evaluatorId !== id));
  }

  async function handleCreate() {
    if (!form.employeeId || !form.period) {
      toast.error("الرجاء اختيار الموظف وتحديد الفترة");
      return;
    }
    try {
      await createMutation.mutateAsync({
        employeeId: Number(form.employeeId),
        period: form.period,
        notes: form.notes,
        participants: participants.map((p) => ({ evaluatorId: p.evaluatorId, evaluatorRole: p.evaluatorRole })),
      });
      qc.invalidateQueries({ queryKey: ["evaluation-cycles"] });
      setShowCreate(false);
      setForm({ employeeId: "", period: "", notes: "" });
      setParticipants([]);
      toast.success("تم بدء دورة التقييم بنجاح — تم توليد التقرير الآلي");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err) || "حدث خطأ أثناء بدء دورة التقييم");
    }
  }

  const kpiCards = [
    { label: "إجمالي الدورات", value: stats.total, icon: Target, color: "text-blue-600 bg-blue-50" },
    { label: "جارٍ التقييم", value: stats.inProgress, icon: RefreshCw, color: "text-yellow-600 bg-yellow-50" },
    { label: "مكتملة", value: stats.completed, icon: Award, color: "text-green-600 bg-green-50" },
    { label: "متوسط الأداء", value: stats.avgScore ? `${stats.avgScore}%` : "-", icon: TrendingUp, color: "text-purple-600 bg-purple-50" },
  ];

  return (
    <PageShell
      title="التقييم الذكي 360°"
      subtitle="تقييم شامل يجمع بيانات النظام وتقييم المدير والزملاء والتقييم العكسي السري"
      breadcrumbs={[{ href: "/hr", label: "الموارد البشرية" }]}
      actions={
        <Link href="/hr/evaluation-360/create">
          <Button>
            <Plus className="w-4 h-4 me-1" />بدء دورة تقييم
          </Button>
        </Link>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((c) => (
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

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Input
            placeholder="بحث بالاسم أو الفترة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pe-4"
          />
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && (
          <div className="p-8 text-center text-gray-400">جارٍ التحميل...</div>
        )}
        {!isLoading && filtered.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="p-12 text-center text-gray-400">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد دورات تقييم حتى الآن</p>
              <p className="text-sm mt-1">ابدأ بإنشاء دورة تقييم للموظفين</p>
            </CardContent>
          </Card>
        )}
        {filtered.map((cycle: any) => (
          <Link key={cycle.id} href={`/hr/evaluation-360/${cycle.id}`}>
            <Card className="border-0 shadow-sm hover:shadow-md transition-all cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center text-orange-700 font-bold text-lg shrink-0">
                    {(cycle.employeeName || "؟").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">{cycle.employeeName}</span>
                      {cycle.empNumber && <span className="text-xs text-gray-400">{cycle.empNumber}</span>}
                      <Badge className={cn("text-xs", statusMap[cycle.status]?.color)}>
                        {statusMap[cycle.status]?.label || cycle.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">الفترة: {cycle.period}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-1">النظام</p>
                      <ScoreBadge score={cycle.systemScore} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-1">المدير</p>
                      <ScoreBadge score={cycle.managerScore} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-1">الزملاء</p>
                      <ScoreBadge score={cycle.peerScore} />
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gray-400 mb-1">360° النهائي</p>
                      <ScoreBadge score={cycle.finalScore} />
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

    </PageShell>
  );
}
