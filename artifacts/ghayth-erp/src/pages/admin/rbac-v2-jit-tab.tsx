import { useState } from "react";
import { z } from "zod";
import { useFormContext, useWatch } from "react-hook-form";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Clock, Check, X, AlertTriangle, Plus, Hourglass, ShieldCheck, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  FormShell,
  FormNumberField,
  FormSelectField,
  FormTextareaField,
  FormGrid,
} from "@/components/form-shell";

// Justification floor (10 chars) lives in the schema so the submit
// button can't fire below the threshold. Request minutes are capped
// 5..1440 per the original imperative <Input min={5} max={1440}>.
const jitRequestSchema = z.object({
  featureKey: z.string().min(1, "اختر الميزة المطلوبة"),
  action: z.string().min(1, "اختر الإجراء"),
  scope: z.string().min(1, "اختر النطاق"),
  justification: z.string().trim().min(10, "السبب يجب أن يكون 10 أحرف على الأقل").max(500),
  requestedMinutes: z.coerce.number().int().min(5).max(1440),
});
type JitRequestForm = z.infer<typeof jitRequestSchema>;

interface JitRequest {
  id: number;
  feature_key: string;
  action: string;
  scope: string;
  justification: string;
  requested_minutes: number;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  approvedBy: number | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  granted_at: string | null;
  expires_at: string | null;
  createdAt: string;
  userId?: number;
  userName?: string;
}

interface Feature {
  feature_key: string;
  label_ar: string;
  available_actions: string[];
  available_scopes: string[];
}

const STATUS_LABELS: Record<string, string> = {
  pending: "بانتظار الموافقة",
  approved: "مُعتمد",
  rejected: "مرفوض",
  expired: "منتهي",
  cancelled: "مُلغى",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-300",
  approved: "bg-green-100 text-green-800 border-green-300",
  rejected: "bg-red-100 text-red-800 border-red-300",
  expired: "bg-gray-100 text-gray-700 border-gray-300",
  cancelled: "bg-gray-100 text-gray-500 border-gray-300",
};

const SCOPE_LABELS: Record<string, string> = {
  self: "بياناتي فقط",
  team: "فريقي",
  department: "قسمي",
  branch: "فرعي",
  company: "الشركة كاملة",
  all: "كل البيانات",
};

function formatTimeRemaining(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "انتهى";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  return `${hours} ساعة ${mins % 60} د`;
}

export function JitRequestsTab() {
  const [showRequest, setShowRequest] = useState(false);
  const [decisionDialog, setDecisionDialog] = useState<{ id: number; mode: "approve" | "reject" } | null>(null);

  const { data: myData, refetch: refetchMy } = useApiQuery<{ data: JitRequest[] }>(
    ["rbac-jit-my"],
    "/rbac/v2/jit/my"
  );
  const { data: pendingData, refetch: refetchPending } = useApiQuery<{ data: JitRequest[] }>(
    ["rbac-jit-pending"],
    "/rbac/v2/jit/pending"
  );
  const { data: featuresData } = useApiQuery<{ features: Feature[] }>(["rbac-features"], "/rbac/v2/features");

  const myRequests = myData?.data || [];
  const pending = pendingData?.data || [];
  const features = featuresData?.features || [];

  const refetchAll = () => {
    refetchMy();
    refetchPending();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5" />
            طلبات الصلاحيات المؤقتة (JIT)
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            للحالات الاستثنائية: أطلب صلاحية مؤقتة بمبرّر، يعتمدها مديرك، ويسحبها النظام تلقائياً عند انتهاء المدة.
          </p>
        </div>
        <GuardedButton perm="admin:create" onClick={() => setShowRequest(!showRequest)}>
          {showRequest ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />طلب جديد</>}
        </GuardedButton>
      </div>

      {showRequest && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-2"><CardTitle className="text-base">طلب صلاحية مؤقتة</CardTitle></CardHeader>
          <CardContent>
            <JitRequestForm
              features={features}
              onCreated={() => { setShowRequest(false); refetchAll(); }}
            />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="pending" dir="rtl">
        <TabsList>
          <TabsTrigger value="pending">
            بانتظار المراجعة
            {pending.length > 0 && <Badge className="ms-2 bg-amber-500">{pending.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="my">طلباتي ({myRequests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-3">
          {pending.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <ShieldCheck className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>لا توجد طلبات بانتظار المراجعة</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pending.map((r) => (
                <Card key={r.id} className="border-amber-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{r.userName || `User #${r.userId}`}</span>
                          <Badge className="text-xs">{r.requested_minutes} دقيقة</Badge>
                        </div>
                        <div className="text-sm text-gray-700 mb-2 font-mono">
                          {r.feature_key} · {r.action} · {SCOPE_LABELS[r.scope] || r.scope}
                        </div>
                        <div className="bg-gray-50 rounded p-2 text-sm text-gray-600 mb-2">
                          <FileText className="h-3 w-3 inline me-1" />
                          {r.justification}
                        </div>
                        <p className="text-xs text-gray-400">
                          مُقدَّم: {new Date(r.createdAt).toLocaleString("ar")}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <GuardedButton perm="admin:create" size="sm" variant="outline" onClick={() => setDecisionDialog({ id: r.id, mode: "reject" })}>
                          <X className="h-4 w-4 me-1" />
                          رفض
                        </GuardedButton>
                        <GuardedButton perm="admin:create" size="sm" onClick={() => setDecisionDialog({ id: r.id, mode: "approve" })}>
                          <Check className="h-4 w-4 me-1" />
                          اعتماد
                        </GuardedButton>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="my" className="mt-3">
          {myRequests.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Hourglass className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>لم تقدّم أي طلبات سابقاً</p>
            </div>
          ) : (
            <div className="space-y-2">
              {myRequests.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`text-xs ${STATUS_COLORS[r.status]}`}>
                            {STATUS_LABELS[r.status]}
                          </Badge>
                          <span className="text-sm font-mono text-gray-700">
                            {r.feature_key} · {r.action}
                          </span>
                          {r.status === "approved" && r.expires_at && (
                            <Badge variant="outline" className="text-xs">
                              متبقّي: {formatTimeRemaining(r.expires_at)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mb-1">{r.justification}</p>
                        {r.rejectedReason && (
                          <p className="text-xs text-red-600">سبب الرفض: {r.rejectedReason}</p>
                        )}
                        <p className="text-[10px] text-gray-400">
                          {new Date(r.createdAt).toLocaleString("ar")}
                          {r.granted_at && ` · مُنح: ${new Date(r.granted_at).toLocaleTimeString("ar")}`}
                        </p>
                      </div>
                      {r.status === "pending" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={async () => {
                            await apiFetch(`/rbac/v2/jit/${r.id}/cancel`, { method: "POST" });
                            refetchMy();
                          }}
                        >
                          إلغاء
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <DecisionDialog
        info={decisionDialog}
        onClose={() => setDecisionDialog(null)}
        onDone={refetchAll}
      />
    </div>
  );
}

function JitRequestForm({ features, onCreated }: {
  features: Feature[]; onCreated: () => void;
}) {
  const { toast } = useToast();

  const submit = async (values: JitRequestForm) => {
    try {
      await apiFetch("/rbac/v2/jit/request", {
        method: "POST",
        body: JSON.stringify(values),
      });
      toast({ title: "تم تقديم الطلب", description: "سيُراجَع من المسؤول" });
      onCreated();
    } catch (err: any) {
      toast({ title: "فشل التقديم", description: err?.message || "خطأ", variant: "destructive" });
    }
  };

  return (
    <FormShell
      schema={jitRequestSchema}
      defaultValues={{
        featureKey: "",
        action: "view",
        scope: "self",
        justification: "",
        requestedMinutes: 60,
      }}
      submitLabel="تقديم الطلب"
      onSubmit={async (values) => {
        await submit(values);
      }}
    >
      <FormSelectField
        name="featureKey"
        label="الميزة المطلوبة"
        required
        options={[
          { value: "", label: "اختر ميزة..." },
          ...features.map((f) => ({ value: f.feature_key, label: f.label_ar })),
        ]}
      />
      <FormGrid cols={2}>
        <ActionField features={features} />
        <ScopeField features={features} />
      </FormGrid>
      <div className="mt-3">
        <FormNumberField
          name="requestedMinutes"
          label="المدة (دقائق): 5 - 1440 (يوم كامل)"
          required
        />
        <MinutesHint />
      </div>
      <div className="mt-3">
        <FormTextareaField
          name="justification"
          label="السبب"
          required
          rows={4}
          placeholder="اشرح بدقّة لماذا تحتاج هذه الصلاحية وما العمل الذي ستنفّذه (10 أحرف على الأقل)"
        />
        <JustificationCounter />
      </div>
    </FormShell>
  );
}

// Dependent dropdowns — same pattern as rbac-v2-sod (#372). The
// action/scope lists are derived from the selected feature's
// available_* arrays; key={selectedFeature} remounts the field so
// stale values can't slip through.
function ActionField({ features }: { features: Feature[] }) {
  const selectedFeature = useWatch<JitRequestForm, "featureKey">({ name: "featureKey" });
  const feat = features.find((f) => f.feature_key === selectedFeature);
  return (
    <FormSelectField
      key={`action-${selectedFeature}`}
      name="action"
      label="الإجراء"
      required
      options={(feat?.available_actions || ["view"]).map((a) => ({ value: a, label: a }))}
    />
  );
}

function ScopeField({ features }: { features: Feature[] }) {
  const selectedFeature = useWatch<JitRequestForm, "featureKey">({ name: "featureKey" });
  const feat = features.find((f) => f.feature_key === selectedFeature);
  return (
    <FormSelectField
      key={`scope-${selectedFeature}`}
      name="scope"
      label="النطاق"
      required
      options={(feat?.available_scopes || ["self"]).map((s) => ({
        value: s,
        label: SCOPE_LABELS[s] || s,
      }))}
    />
  );
}

// Live hint under the minutes input — converts to "X ساعة Y د".
function MinutesHint() {
  const minutes = useWatch<JitRequestForm, "requestedMinutes">({ name: "requestedMinutes" });
  const n = Number(minutes) || 0;
  return (
    <p className="text-[10px] text-gray-500 mt-1">
      {n >= 60 ? `${Math.floor(n / 60)} ساعة ${n % 60} د` : `${n} دقيقة`}
    </p>
  );
}

// Live character counter for the justification textarea.
function JustificationCounter() {
  const justification = useWatch<JitRequestForm, "justification">({ name: "justification" });
  return (
    <p className="text-[10px] text-gray-400 mt-1">
      {(justification || "").length} / 500
    </p>
  );
}

function DecisionDialog({ info, onClose, onDone }: {
  info: { id: number; mode: "approve" | "reject" } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (!info) return null;
  const isApprove = info.mode === "approve";

  const submit = async () => {
    if (!isApprove && !reason.trim()) {
      toast({ title: "مطلوب سبب الرفض", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/rbac/v2/jit/${info.id}/${info.mode}`, {
        method: "POST",
        body: JSON.stringify({ reason: reason || undefined }),
      });
      toast({ title: isApprove ? "تم الاعتماد" : "تم الرفض" });
      onDone();
      onClose();
      setReason("");
    } catch (err: any) {
      toast({ title: "فشل", description: err?.message || "خطأ", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!info} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isApprove ? <Check className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
            {isApprove ? "اعتماد طلب صلاحية" : "رفض طلب صلاحية"}
          </DialogTitle>
        </DialogHeader>
        <div>
          <label className="text-xs text-gray-600 mb-1 block">
            {isApprove ? "ملاحظة (اختياري)" : "سبب الرفض (مطلوب)"}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value.slice(0, 500))}
            className="w-full border rounded p-2 text-sm h-24 resize-none"
            placeholder={isApprove ? "موافق - تقرير الأداء الربع الثاني" : "اشرح لماذا الطلب مرفوض"}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button
            onClick={submit}
            disabled={busy || (!isApprove && !reason.trim())}
            variant={isApprove ? "default" : "destructive"}
          >
            {busy ? "جارٍ..." : isApprove ? "اعتماد" : "رفض"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
