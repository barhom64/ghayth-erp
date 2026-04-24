import { useState } from "react";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Zap, Plus, Power, PowerOff, Trash2, History, Shield,
  AlertTriangle, CheckCircle, XCircle, Clock, Settings2,
  ChevronDown, ChevronUp,
} from "lucide-react";

interface BusinessRule {
  id: number;
  companyId: number | null;
  name: string;
  description: string;
  triggerEvent: string;
  conditionField: string;
  conditionOperator: string;
  conditionValue: string;
  actionType: string;
  actionTarget: string;
  actionConfig: any;
  module: string;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

interface RuleLog {
  id: number;
  ruleId: number;
  ruleName: string;
  triggerEvent: string;
  actionTaken: string;
  actionResult: string;
  status: string;
  executedAt: string;
  companyId: number;
  entityType: string;
  entityId: number;
}

const TRIGGER_OPTIONS = [
  { value: "attendance.checkin", label: "تسجيل حضور" },
  { value: "attendance.absent", label: "غياب" },
  { value: "invoice.created", label: "إنشاء فاتورة" },
  { value: "invoice.overdue_check", label: "فاتورة متأخرة" },
  { value: "leave.requested", label: "طلب إجازة" },
  { value: "expense.created", label: "طلب صرف" },
  { value: "support.ticket.created", label: "تذكرة دعم" },
  { value: "contract.expiry_check", label: "انتهاء عقد" },
  { value: "fleet.maintenance_check", label: "صيانة مركبة" },
  { value: "fleet.insurance_check", label: "تأمين مركبة" },
  { value: "project.budget_check", label: "ميزانية مشروع" },
  { value: "property.contract_check", label: "عقد إيجار" },
  { value: "legal.case.created", label: "قضية قانونية" },
  { value: "employee.created", label: "موظف جديد" },
  { value: "task.created", label: "مهمة جديدة" },
];

const ACTION_OPTIONS = [
  { value: "notification", label: "إشعار" },
  { value: "escalation", label: "تصعيد" },
  { value: "create_task", label: "إنشاء مهمة" },
  { value: "set_sla", label: "تحديد مهلة مستوى الخدمة" },
  { value: "status_change", label: "تغيير حالة" },
];

const TARGET_OPTIONS = [
  { value: "manager", label: "المدير المباشر" },
  { value: "director", label: "المدير العام" },
  { value: "hr", label: "الموارد البشرية" },
  { value: "finance", label: "المالية" },
  { value: "legal", label: "القانونية" },
  { value: "employee", label: "الموظف" },
  { value: "owner", label: "المالك" },
  { value: "fleet_manager", label: "مدير النقليات" },
  { value: "property_manager", label: "مدير الأملاك" },
  { value: "project_manager", label: "مدير المشاريع" },
];

const OPERATOR_OPTIONS = [
  { value: ">=", label: "أكبر من أو يساوي" },
  { value: "<=", label: "أقل من أو يساوي" },
  { value: ">", label: "أكبر من" },
  { value: "<", label: "أقل من" },
  { value: "==", label: "يساوي" },
  { value: "!=", label: "لا يساوي" },
];

const MODULE_LABELS: Record<string, string> = {
  hr: "الموارد البشرية",
  finance: "المالية",
  fleet: "النقليات",
  legal: "القانونية",
  property: "الأملاك",
  projects: "المشاريع",
  support: "الدعم",
};

function getModuleColor(mod: string) {
  const colors: Record<string, string> = {
    hr: "bg-blue-100 text-blue-800",
    finance: "bg-green-100 text-green-800",
    fleet: "bg-orange-100 text-orange-800",
    legal: "bg-purple-100 text-purple-800",
    property: "bg-yellow-100 text-yellow-800",
    projects: "bg-cyan-100 text-cyan-800",
    support: "bg-red-100 text-red-800",
  };
  return colors[mod] || "bg-gray-100 text-gray-800";
}

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

function RuleCard({ rule, onToggle, onDelete }: { rule: BusinessRule; onToggle: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`transition-all ${rule.isActive ? "border-green-200" : "border-gray-200 opacity-70"}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h3 className="font-semibold text-sm">{rule.name}</h3>
              {rule.module && (
                <Badge variant="outline" className={`text-[10px] ${getModuleColor(rule.module)}`}>
                  {MODULE_LABELS[rule.module] || rule.module}
                </Badge>
              )}
              <Badge variant={rule.isActive ? "default" : "secondary"} className="text-[10px]">
                {rule.isActive ? "مفعّل" : "معطّل"}
              </Badge>
              {!rule.companyId && (
                <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700">افتراضي</Badge>
              )}
            </div>
            {rule.description && <p className="text-xs text-muted-foreground mb-2">{rule.description}</p>}

            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="font-medium text-blue-600">إذا</span>
              <span>{TRIGGER_OPTIONS.find(t => t.value === rule.triggerEvent)?.label || rule.triggerEvent}</span>
              {rule.conditionField && (
                <>
                  <span className="font-medium text-orange-600">و</span>
                  <span>{rule.conditionField}</span>
                  <span>{rule.conditionOperator}</span>
                  <span>{rule.conditionValue}</span>
                </>
              )}
              <span className="font-medium text-green-600">→</span>
              <span>{ACTION_OPTIONS.find(a => a.value === rule.actionType)?.label || rule.actionType}</span>
              {rule.actionTarget && (
                <span>({TARGET_OPTIONS.find(t => t.value === rule.actionTarget)?.label || rule.actionTarget})</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onToggle}>
              {rule.isActive ? <PowerOff className="h-3.5 w-3.5 text-orange-500" /> : <Power className="h-3.5 w-3.5 text-green-500" />}
            </Button>
            {rule.companyId && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </Button>
            )}
          </div>
        </div>

        {expanded && rule.actionConfig && (
          <div className="mt-3 pt-3 border-t text-xs space-y-1">
            {rule.actionConfig.title && <div><span className="font-medium">العنوان:</span> {rule.actionConfig.title}</div>}
            {rule.actionConfig.body && <div><span className="font-medium">النص:</span> {rule.actionConfig.body}</div>}
            {rule.actionConfig.priority && <div><span className="font-medium">الأولوية:</span> {rule.actionConfig.priority}</div>}
            {rule.actionConfig.slaHours && <div><span className="font-medium">مهلة مستوى الخدمة:</span> {rule.actionConfig.slaHours} ساعات</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreateRuleForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    description: "",
    triggerEvent: "attendance.checkin",
    conditionField: "",
    conditionOperator: ">=",
    conditionValue: "",
    actionType: "notification",
    actionTarget: "manager",
    module: "hr",
    priority: 10,
    notifTitle: "",
    notifBody: "",
    notifPriority: "high",
  });

  const createMut = useApiMutation<any, Record<string, any>>(
    "/rules",
    "POST",
    [["business-rules"]],
    {
      successMessage: "تم إنشاء القاعدة بنجاح",
      onSuccess: () => {
        setForm({ name: "", description: "", triggerEvent: "attendance.checkin", conditionField: "", conditionOperator: ">=", conditionValue: "", actionType: "notification", actionTarget: "manager", module: "hr", priority: 10, notifTitle: "", notifBody: "", notifPriority: "high" });
        onCreated();
      },
    }
  );
  const saving = createMut.isPending;

  const handleSubmit = () => {
    if (!form.name || !form.triggerEvent || !form.actionType) {
      toast({ title: "يرجى ملء الحقول المطلوبة", variant: "destructive" });
      return;
    }
    createMut.mutate({
      name: form.name,
      description: form.description,
      triggerEvent: form.triggerEvent,
      conditionField: form.conditionField || null,
      conditionOperator: form.conditionOperator,
      conditionValue: form.conditionValue || null,
      actionType: form.actionType,
      actionTarget: form.actionTarget,
      module: form.module,
      priority: form.priority,
      actionConfig: {
        title: form.notifTitle || form.name,
        body: form.notifBody,
        priority: form.notifPriority,
      },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4" /> إنشاء قاعدة جديدة
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>اسم القاعدة *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="مثال: تأخر 3 مرات = إشعار المدير" />
          </div>
          <div>
            <Label>الوصف</Label>
            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="وصف مختصر للقاعدة" />
          </div>
        </div>

        <div className="p-4 bg-blue-50 rounded-lg space-y-3">
          <div className="text-sm font-semibold text-blue-800 flex items-center gap-2">
            <Shield className="h-4 w-4" /> إذا حدث...
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">نوع الحدث *</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-white" value={form.triggerEvent} onChange={e => setForm({ ...form, triggerEvent: e.target.value })}>
                {TRIGGER_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">اسم الحقل (اختياري)</Label>
              <Input className="text-sm" value={form.conditionField} onChange={e => setForm({ ...form, conditionField: e.target.value })} placeholder="مثال: monthlyLateCount" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label className="text-xs">المعيار</Label>
                <select className="w-full border rounded-md p-2 text-sm bg-white" value={form.conditionOperator} onChange={e => setForm({ ...form, conditionOperator: e.target.value })}>
                  {OPERATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <Label className="text-xs">القيمة</Label>
                <Input className="text-sm" value={form.conditionValue} onChange={e => setForm({ ...form, conditionValue: e.target.value })} placeholder="3" />
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 bg-green-50 rounded-lg space-y-3">
          <div className="text-sm font-semibold text-green-800 flex items-center gap-2">
            <Zap className="h-4 w-4" /> فعندها...
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">نوع الإجراء *</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-white" value={form.actionType} onChange={e => setForm({ ...form, actionType: e.target.value })}>
                {ACTION_OPTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">الهدف</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-white" value={form.actionTarget} onChange={e => setForm({ ...form, actionTarget: e.target.value })}>
                {TARGET_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs">المسار</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-white" value={form.module} onChange={e => setForm({ ...form, module: e.target.value })}>
                {Object.entries(MODULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">عنوان الإشعار</Label>
              <Input className="text-sm" value={form.notifTitle} onChange={e => setForm({ ...form, notifTitle: e.target.value })} placeholder="عنوان الرسالة" />
            </div>
            <div>
              <Label className="text-xs">نص الإشعار</Label>
              <Input className="text-sm" value={form.notifBody} onChange={e => setForm({ ...form, notifBody: e.target.value })} placeholder="نص الرسالة (يدعم {field})" />
            </div>
            <div>
              <Label className="text-xs">أولوية الإشعار</Label>
              <select className="w-full border rounded-md p-2 text-sm bg-white" value={form.notifPriority} onChange={e => setForm({ ...form, notifPriority: e.target.value })}>
                <option value="normal">عادية</option>
                <option value="high">عالية</option>
                <option value="urgent">عاجلة</option>
              </select>
            </div>
          </div>
        </div>

        <Button onClick={handleSubmit} disabled={saving} className="w-full">
          {saving ? "جاري الحفظ..." : "إنشاء القاعدة"}
        </Button>
      </CardContent>
    </Card>
  );
}

function RuleLogsList() {
  const { data, isLoading } = useApiQuery<{ data: RuleLog[]; total: number }>(
    ["rule-logs"], "/rules/logs?limit=50"
  );
  const logs = data?.data || [];

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>;

  if (logs.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="text-sm">لا يوجد سجل تنفيذ بعد</p>
        <p className="text-xs mt-1">ستظهر هنا سجلات تنفيذ القواعد التلقائية</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => (
        <div key={log.id} className="flex items-center gap-3 p-3 border rounded-lg text-sm">
          <div className="shrink-0">
            {log.status === "success" ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-xs">{log.ruleName}</div>
            <div className="text-[11px] text-muted-foreground">
              {log.actionTaken} → {log.actionResult}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(log.executedAt)}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SettingsRulesPage() {
  const { data, isLoading } = useApiQuery<{ data: BusinessRule[] }>(["business-rules"], "/rules");
  const rules = data?.data || [];

  const activeRules = rules.filter(r => r.isActive);
  const inactiveRules = rules.filter(r => !r.isActive);

  const toggleMut = useApiMutation<any, { id: number }>(
    (body) => `/rules/${body.id}/toggle`,
    "PATCH",
    [["business-rules"]]
  );
  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/rules/${body.id}`,
    "DELETE",
    [["business-rules"]],
    { successMessage: "تم حذف القاعدة" }
  );

  const handleToggle = (ruleId: number) => toggleMut.mutate({ id: ruleId });
  const handleDelete = (ruleId: number) => deleteMut.mutate({ id: ruleId });

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Settings2 className="h-5 w-5" /> محرك قواعد الأعمال
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إعداد القواعد التلقائية: إذا حدث شيء... فعندها يتم تنفيذ إجراء
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Badge variant="default" className="gap-1">
            <Zap className="h-3 w-3" /> {activeRules.length} مفعّلة
          </Badge>
          <Badge variant="secondary">{rules.length} إجمالي</Badge>
        </div>
      </div>

      <Tabs defaultValue="rules" dir="rtl">
        <TabsList>
          <TabsTrigger value="rules" className="gap-1">
            <Shield className="h-3.5 w-3.5" /> القواعد
          </TabsTrigger>
          <TabsTrigger value="create" className="gap-1">
            <Plus className="h-3.5 w-3.5" /> إنشاء قاعدة
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1">
            <History className="h-3.5 w-3.5" /> سجل التنفيذ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-3 mt-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground">لا توجد قواعد أعمال حالياً</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onToggle={() => handleToggle(rule.id)}
                  onDelete={() => handleDelete(rule.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="create" className="mt-4">
          <CreateRuleForm onCreated={() => { /* invalidation handled by useApiMutation */ }} />
        </TabsContent>

        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> سجل تنفيذ القواعد
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RuleLogsList />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
