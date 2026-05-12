import { useState, useEffect } from "react";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { formatDateAr } from "@/lib/formatters";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  Route, Bell, Mail, MessageSquare, Smartphone, Globe, Zap, Plus, Save,
  Trash2, RefreshCw, ArrowRight, AlertCircle, CheckCircle, XCircle,
  BarChart3, Clock, Shield, Webhook, ChevronDown, ChevronUp,
} from "lucide-react";
import { GuardedButton } from "@/components/shared/permission-gate";

const CHANNEL_LABELS: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  in_app: { label: "داخلي", icon: <Bell className="h-4 w-4" />, color: "bg-blue-100 text-blue-700" },
  email: { label: "بريد إلكتروني", icon: <Mail className="h-4 w-4" />, color: "bg-green-100 text-green-700" },
  sms: { label: "رسالة نصية", icon: <Smartphone className="h-4 w-4" />, color: "bg-yellow-100 text-yellow-700" },
  whatsapp: { label: "واتساب", icon: <MessageSquare className="h-4 w-4" />, color: "bg-emerald-100 text-emerald-700" },
  push: { label: "إشعار فوري", icon: <Zap className="h-4 w-4" />, color: "bg-purple-100 text-purple-700" },
  webhook: { label: "ويب هوك", icon: <Globe className="h-4 w-4" />, color: "bg-orange-100 text-orange-700" },
};

const ALL_CHANNELS = ["in_app", "email", "sms", "whatsapp", "push", "webhook"];

function ChannelBadge({ channel }: { channel: string }) {
  const info = CHANNEL_LABELS[channel];
  if (!info) return <Badge variant="outline">{channel}</Badge>;
  return (
    <Badge className={`${info.color} gap-1 font-normal`} variant="outline">
      {info.icon} {info.label}
    </Badge>
  );
}

function RoutingRulesTab() {
  const { data: rulesData, isLoading: loadingR, isError: errorR } = useApiQuery(["notif-routing-rules"], "/notification-engine/routing-rules");
  const { data: chainsData, isLoading: loadingC, isError: errorC } = useApiQuery(["notif-fallback-chains"], "/notification-engine/fallback-chains");
  const rules = asList(rulesData);
  const chains = asList(chainsData);
  const [editId, setEditId] = useState<number | null>(null);
  const [editChannels, setEditChannels] = useState<string[]>([]);
  const [editPriority, setEditPriority] = useState("normal");
  const [editChainId, setEditChainId] = useState<number | null>(null);

  const startEdit = (rule: Record<string, unknown>) => {
    setEditId(rule.id as number);
    const ch = rule.channels;
    setEditChannels(Array.isArray(ch) ? ch as string[] : typeof ch === "string" ? JSON.parse(ch) : ["in_app"]);
    setEditPriority((rule.priority as string) ?? "normal");
    setEditChainId((rule.fallbackChainId as number) ?? null);
  };

  const saveRuleMut = useApiMutation<any, { id: number; channels: string[]; priority: string; fallbackChainId: number | null }>(
    (body) => `/notification-engine/routing-rules/${body.id}`,
    "PUT",
    [["notif-routing-rules"]],
    {
      successMessage: "تم الحفظ",
      onSuccess: () => setEditId(null),
    }
  );

  const saveRule = () => {
    if (!editId) return;
    saveRuleMut.mutate({ id: editId, channels: editChannels, priority: editPriority, fallbackChainId: editChainId });
  };

  if (loadingR || loadingC) return <LoadingSpinner />;
  if (errorR || errorC) return <ErrorState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">قواعد توجيه الإشعارات</h3>
        <p className="text-sm text-muted-foreground">تحديد القنوات الافتراضية لكل نوع حدث</p>
      </div>
      <div className="space-y-2">
        {rules.map((rule: Record<string, unknown>) => {
          const ruleId = rule.id as number;
          const isEditing = editId === ruleId;
          const channels: string[] = Array.isArray(rule.channels) ? rule.channels as string[] : typeof rule.channels === "string" ? JSON.parse(rule.channels as string) : [];
          const isGlobal = !rule.companyId;

          return (
            <Card key={ruleId} className={isGlobal ? "border-dashed" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Route className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {rule.eventCategory as string}
                        {isGlobal && <Badge variant="secondary" className="text-xs">افتراضي</Badge>}
                      </div>
                      {!!rule.description && <p className="text-xs text-muted-foreground">{String(rule.description)}</p>}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="flex flex-col gap-2 flex-1 max-w-lg">
                      <div className="flex flex-wrap gap-2">
                        {ALL_CHANNELS.map((ch) => (
                          <label key={ch} className="flex items-center gap-1 text-sm cursor-pointer">
                            <Checkbox checked={editChannels.includes(ch)}
                              onCheckedChange={(v) => setEditChannels(v === true ? [...editChannels, ch] : editChannels.filter((c) => c !== ch))} />
                            {CHANNEL_LABELS[ch]?.label ?? ch}
                          </label>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={editPriority} onValueChange={setEditPriority}>
                          <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">منخفض</SelectItem>
                            <SelectItem value="normal">عادي</SelectItem>
                            <SelectItem value="high">عالي</SelectItem>
                            <SelectItem value="urgent">عاجل</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={editChainId ? String(editChainId) : "none"} onValueChange={(v) => setEditChainId(v === "none" ? null : Number(v))}>
                          <SelectTrigger className="w-48 h-8"><SelectValue placeholder="سلسلة تصعيد" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">بدون تصعيد</SelectItem>
                            {chains.map((c: Record<string, unknown>) => (
                              <SelectItem key={c.id as number} value={String(c.id)}>{c.name as string}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <GuardedButton perm="settings:create" size="sm" onClick={saveRule}><Save className="h-3 w-3 ml-1" /> حفظ</GuardedButton>
                        <Button size="sm" variant="outline" onClick={() => setEditId(null)}>إلغاء</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex flex-wrap gap-1">
                        {channels.map((ch) => <ChannelBadge key={ch} channel={ch} />)}
                      </div>
                      <Badge variant="outline" className="text-xs">{String(rule.priority)}</Badge>
                      {!!rule.fallbackChainName && (
                        <Badge variant="outline" className="text-xs bg-orange-50">
                          <ArrowRight className="h-3 w-3 ml-1" />{String(rule.fallbackChainName)}
                        </Badge>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => startEdit(rule)}>تعديل</Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function TemplatesTab() {
  const { data: templatesData, isLoading, isError } = useApiQuery(["notif-templates"], "/notification-engine/templates");
  const [editId, setEditId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newChannel, setNewChannel] = useState("sms");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const templates = asList(templatesData);
  const grouped = templates.reduce((acc: Record<string, Array<Record<string, unknown>>>, t: Record<string, unknown>) => {
    const key = t.templateKey as string;
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {} as Record<string, Array<Record<string, unknown>>>);

  const saveEditMut = useApiMutation<any, { id: number; titleTemplate: string | null; bodyTemplate: string }>(
    (body) => `/notification-engine/templates/${body.id}`,
    "PUT",
    [["notif-templates"]],
    {
      successMessage: "تم الحفظ",
      onSuccess: () => setEditId(null),
    }
  );
  const createMut = useApiMutation<any, { templateKey: string; channel: string; titleTemplate: string | null; bodyTemplate: string }>(
    "/notification-engine/templates",
    "POST",
    [["notif-templates"]],
    {
      successMessage: "تم إنشاء القالب",
      onSuccess: () => {
        setShowNew(false);
        setNewKey("");
        setNewChannel("sms");
        setNewTitle("");
        setNewBody("");
      },
    }
  );
  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/notification-engine/templates/${body.id}`,
    "DELETE",
    [["notif-templates"]],
    { successMessage: "تم الحذف" }
  );

  const saveEdit = () => {
    if (!editId) return;
    saveEditMut.mutate({ id: editId, titleTemplate: editTitle || null, bodyTemplate: editBody });
  };
  const createTemplate = () => {
    if (!newKey || !newBody) return;
    createMut.mutate({ templateKey: newKey, channel: newChannel, titleTemplate: newTitle || null, bodyTemplate: newBody });
  };
  const deleteTemplate = (id: number) => {
    deleteMut.mutate({ id });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">قوالب الرسائل</h3>
        <GuardedButton perm="settings:create" size="sm" onClick={() => setShowNew(!showNew)}>
          <Plus className="h-4 w-4 ml-1" /> قالب جديد
        </GuardedButton>
      </div>

      {showNew && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>مفتاح القالب</Label>
                <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="invoice_reminder" />
              </div>
              <div>
                <Label>القناة</Label>
                <Select value={newChannel} onValueChange={setNewChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_CHANNELS.map((ch) => (
                      <SelectItem key={ch} value={ch}>{CHANNEL_LABELS[ch]?.label ?? ch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>عنوان القالب (اختياري)</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="{{ref}} — تذكير" />
            </div>
            <div>
              <Label>نص القالب</Label>
              <Textarea value={newBody} onChange={(e) => setNewBody(e.target.value)} rows={4}
                placeholder="عزيزي {{clientName}}، لديك فاتورة رقم {{ref}}..." />
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>إلغاء</Button>
              <GuardedButton perm="settings:create" size="sm" onClick={createTemplate}><Save className="h-3 w-3 ml-1" /> إنشاء</GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([key, items]) => {
        const itemsList = items as any[];
        return (
        <Card key={key}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4" /> {key}
              <Badge variant="outline" className="text-xs">{itemsList.length} قنوات</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {itemsList.map((t: any) => {
              const tId = t.id as number;
              const isEditing = editId === tId;
              const isDefault = t.isDefault as boolean;

              return (
                <div key={tId} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <ChannelBadge channel={t.channel as string} />
                      {isDefault && <Badge variant="secondary" className="text-xs">افتراضي</Badge>}
                      {!t.isActive && <Badge variant="destructive" className="text-xs">معطل</Badge>}
                    </div>
                    <div className="flex gap-1">
                      {isEditing ? (
                        <>
                          <GuardedButton perm="settings:create" size="sm" onClick={saveEdit}><Save className="h-3 w-3 ml-1" /> حفظ</GuardedButton>
                          <Button size="sm" variant="outline" onClick={() => setEditId(null)}>إلغاء</Button>
                        </>
                      ) : (
                        <>
                          <GuardedButton perm="settings:create" size="sm" variant="ghost" onClick={() => {
                            setEditId(tId);
                            setEditBody(t.bodyTemplate as string);
                            setEditTitle((t.titleTemplate as string) ?? "");
                          }}>تعديل</GuardedButton>
                          {!isDefault && (
                            <GuardedButton perm="settings:create" size="sm" variant="ghost" className="text-red-500" onClick={() => deleteTemplate(tId)}>
                              <Trash2 className="h-3 w-3" />
                            </GuardedButton>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  {isEditing ? (
                    <div className="space-y-2">
                      {(t.channel === "email" || t.channel === "push") && (
                        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="العنوان" />
                      )}
                      <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} dir="rtl" />
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap mt-1 max-h-20 overflow-hidden">
                      {t.titleTemplate && <div className="font-medium text-foreground mb-1">{t.titleTemplate as string}</div>}
                      {t.bodyTemplate as string}
                    </div>
                  )}
                  {t.variables && Array.isArray(t.variables) && (t.variables as Array<{key: string; label: string}>).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(t.variables as Array<{key: string; label: string}>).map((v) => (
                        <code key={v.key} className="text-xs bg-muted px-1 rounded" title={v.label}>{`{{${v.key}}}`}</code>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      );
      })}
    </div>
  );
}

function FallbackChainsTab() {
  const { data: chainsData, isLoading, isError } = useApiQuery(["notif-fallback-chains"], "/notification-engine/fallback-chains");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newSteps, setNewSteps] = useState<Array<{ channel: string; waitMinutes: number }>>([
    { channel: "sms", waitMinutes: 0 },
  ]);

  const addStep = () => setNewSteps([...newSteps, { channel: "email", waitMinutes: 5 }]);
  const removeStep = (idx: number) => setNewSteps(newSteps.filter((_, i) => i !== idx));
  const updateStep = (idx: number, field: string, value: string | number) => {
    const updated = [...newSteps];
    (updated[idx] as Record<string, string | number>)[field] = value;
    setNewSteps(updated);
  };

  const createMut = useApiMutation<any, { name: string; description: string; steps: Array<{ channel: string; waitMinutes: number }> }>(
    "/notification-engine/fallback-chains",
    "POST",
    [["notif-fallback-chains"]],
    {
      successMessage: "تم إنشاء السلسلة",
      onSuccess: () => {
        setShowNew(false);
        setNewName("");
        setNewDesc("");
        setNewSteps([{ channel: "sms", waitMinutes: 0 }]);
      },
    }
  );
  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/notification-engine/fallback-chains/${body.id}`,
    "DELETE",
    [["notif-fallback-chains"]],
    { successMessage: "تم الحذف" }
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const chains = asList(chainsData);
  const createChain = () => {
    if (!newName || newSteps.length === 0) return;
    createMut.mutate({ name: newName, description: newDesc, steps: newSteps });
  };
  const deleteChain = (id: number) => {
    deleteMut.mutate({ id });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">سلاسل التصعيد</h3>
        <GuardedButton perm="settings:create" size="sm" onClick={() => setShowNew(!showNew)}>
          <Plus className="h-4 w-4 ml-1" /> سلسلة جديدة
        </GuardedButton>
      </div>
      <p className="text-sm text-muted-foreground">
        عند فشل إرسال إشعار على قناة معينة، يتم المحاولة تلقائياً على القناة التالية في السلسلة.
      </p>

      {showNew && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>اسم السلسلة</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div>
                <Label>الوصف</Label>
                <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
              </div>
            </div>
            <Label>الخطوات</Label>
            {newSteps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-6">{idx + 1}.</span>
                <Select value={step.channel} onValueChange={(v) => updateStep(idx, "channel", v)}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["sms", "whatsapp", "email", "push"].map((ch) => (
                      <SelectItem key={ch} value={ch}>{CHANNEL_LABELS[ch]?.label ?? ch}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Label className="text-xs">انتظار</Label>
                  <Input type="number" className="w-16 h-8" value={step.waitMinutes}
                    onChange={(e) => updateStep(idx, "waitMinutes", Number(e.target.value))} />
                  <span className="text-xs text-muted-foreground">دقيقة</span>
                </div>
                {idx > 0 && (
                  <Button size="sm" variant="ghost" className="text-red-500" onClick={() => removeStep(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
                {idx < newSteps.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addStep}><Plus className="h-3 w-3 ml-1" /> خطوة</Button>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>إلغاء</Button>
              <GuardedButton perm="settings:create" size="sm" onClick={createChain}><Save className="h-3 w-3 ml-1" /> إنشاء</GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      {chains.map((chain: Record<string, unknown>) => {
        const steps: Array<{ channel: string; waitMinutes: number }> = Array.isArray(chain.steps)
          ? chain.steps as Array<{ channel: string; waitMinutes: number }>
          : typeof chain.steps === "string" ? JSON.parse(chain.steps as string) : [];
        const isGlobal = !chain.companyId;

        return (
          <Card key={chain.id as number} className={isGlobal ? "border-dashed" : ""}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {chain.name as string}
                    {isGlobal && <Badge variant="secondary" className="text-xs">افتراضي</Badge>}
                  </div>
                  {!!chain.description && <p className="text-xs text-muted-foreground">{String(chain.description)}</p>}
                </div>
                {!isGlobal && (
                  <GuardedButton perm="settings:create" size="sm" variant="ghost" className="text-red-500" onClick={() => deleteChain(chain.id as number)}>
                    <Trash2 className="h-3 w-3" />
                  </GuardedButton>
                )}
              </div>
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <ChannelBadge channel={step.channel} />
                    {step.waitMinutes > 0 && (
                      <span className="text-xs text-muted-foreground">({step.waitMinutes} د)</span>
                    )}
                    {idx < steps.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function WebhooksTab() {
  const { data: webhooksData, isLoading, isError } = useApiQuery(["notif-webhooks"], "/notification-engine/webhooks");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newSecret, setNewSecret] = useState("");
  const [newEvents, setNewEvents] = useState("*");

  const createMut = useApiMutation<any, { name: string; url: string; secret: string | null; events: string[] }>(
    "/notification-engine/webhooks",
    "POST",
    [["notif-webhooks"]],
    {
      successMessage: "تم إنشاء خطاف الاستدعاء",
      onSuccess: () => {
        setShowNew(false);
        setNewName("");
        setNewUrl("");
        setNewSecret("");
        setNewEvents("*");
      },
    }
  );
  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/notification-engine/webhooks/${body.id}`,
    "DELETE",
    [["notif-webhooks"]],
    { successMessage: "تم الحذف" }
  );
  const toggleMut = useApiMutation<any, { id: number; isActive: boolean }>(
    (body) => `/notification-engine/webhooks/${body.id}`,
    "PUT",
    [["notif-webhooks"]]
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const webhooks = asList(webhooksData);
  const createWebhook = () => {
    if (!newName || !newUrl) return;
    const events = newEvents.split(",").map((e) => e.trim()).filter(Boolean);
    createMut.mutate({ name: newName, url: newUrl, secret: newSecret || null, events });
  };
  const deleteWebhook = (id: number) => {
    deleteMut.mutate({ id });
  };
  const toggleWebhook = (id: number, isActive: boolean) => {
    toggleMut.mutate({ id, isActive: !isActive });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">خطافات الاستدعاء الصادرة</h3>
        <GuardedButton perm="settings:create" size="sm" onClick={() => setShowNew(!showNew)}>
          <Plus className="h-4 w-4 ml-1" /> خطاف استدعاء جديد
        </GuardedButton>
      </div>
      <p className="text-sm text-muted-foreground">
        إرسال إشعارات الأحداث لأنظمة خارجية (سلاك، تيمز، أنظمة أخرى) عبر طلبات استدعاء شبكية.
      </p>

      {showNew && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>الاسم</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ربط سلاك" />
              </div>
              <div>
                <Label>الرابط</Label>
                <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://hooks.slack.com/..." dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>المفتاح السري (تشفير HMAC-SHA256)</Label>
                <Input value={newSecret} onChange={(e) => setNewSecret(e.target.value)} type="password" dir="ltr" />
              </div>
              <div>
                <Label>الأحداث (فاصلة بين كل حدث)</Label>
                <Input value={newEvents} onChange={(e) => setNewEvents(e.target.value)} placeholder="* , invoice, leave" dir="ltr" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowNew(false)}>إلغاء</Button>
              <GuardedButton perm="settings:create" size="sm" onClick={createWebhook}><Save className="h-3 w-3 ml-1" /> إنشاء</GuardedButton>
            </div>
          </CardContent>
        </Card>
      )}

      {webhooks.length === 0 && !showNew && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">لا توجد خطافات استدعاء مسجلة</CardContent></Card>
      )}

      {webhooks.map((wh: Record<string, unknown>) => {
        const events: string[] = Array.isArray(wh.events)
          ? wh.events as string[]
          : typeof wh.events === "string" ? JSON.parse(wh.events as string) : [];

        return (
          <Card key={wh.id as number}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Webhook className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="font-medium">{wh.name as string}</div>
                    <p className="text-xs text-muted-foreground font-mono" dir="ltr">{wh.url as string}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!!wh.lastError && (
                    <Badge variant="destructive" className="text-xs">
                      <XCircle className="h-3 w-3 ml-1" />{String((wh.failCount as number) ?? 0)} فشل
                    </Badge>
                  )}
                  {!!wh.lastSuccessAt && !wh.lastError && (
                    <Badge variant="outline" className="text-xs text-green-600">
                      <CheckCircle className="h-3 w-3 ml-1" />يعمل
                    </Badge>
                  )}
                  <Switch checked={wh.isActive as boolean} onCheckedChange={() => toggleWebhook(wh.id as number, wh.isActive as boolean)} />
                  <GuardedButton perm="settings:create" size="sm" variant="ghost" className="text-red-500" onClick={() => deleteWebhook(wh.id as number)}>
                    <Trash2 className="h-3 w-3" />
                  </GuardedButton>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {events.map((ev) => (
                  <Badge key={ev} variant="outline" className="text-xs">{ev === "*" ? "جميع الأحداث" : ev}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DeliveryStatsTab() {
  const [days, setDays] = useState(30);
  const { data: statsData, isLoading: loadingStats, isError: errorStats } = useApiQuery(["notif-delivery-stats", String(days)], `/notification-engine/delivery-stats?days=${days}`);
  const { data: logData, isLoading: loadingLog, isError: errorLog } = useApiQuery(["notif-delivery-log"], "/notification-engine/delivery-log?limit=20");

  if (loadingStats || loadingLog) return <LoadingSpinner />;
  if (errorStats || errorLog) return <ErrorState />;

  const stats = statsData?.data as {
    byChannel?: Array<{ channel: string; total: number; delivered: number; failed: number; pending: number }>;
    byDay?: Array<{ day: string; total: number; delivered: number; failed: number }>;
    deliveryRate?: number;
    totalSent?: number;
  } | undefined;

  const logs = logData?.data as Array<Record<string, unknown>> | undefined;

  const deliveryLogColumns: DataTableColumn<Record<string, unknown>>[] = [
    {
      key: "channel",
      header: "القناة",
      render: (log) => <ChannelBadge channel={log.channel as string} />,
    },
    {
      key: "recipient",
      header: "المستلم",
      ltr: true,
      render: (log) => (
        <span className="font-mono text-xs">{(log.recipient as string)?.substring(0, 30)}</span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      render: (log) => (
        <Badge variant={
          (log.status === "delivered" || log.status === "sent") ? "default" :
          log.status === "failed" ? "destructive" : "secondary"
        } className="text-xs">
          {log.status === "delivered" ? "وصل" :
           log.status === "sent" ? "أُرسل" :
           log.status === "failed" ? "فشل" :
           log.status === "queued" ? "انتظار" :
           log.status === "fallback_triggered" ? "تصعيد" :
           log.status as string}
        </Badge>
      ),
    },
    {
      key: "templateKey",
      header: "القالب",
      render: (log) => <span className="text-xs">{(log.templateKey as string) ?? "-"}</span>,
    },
    {
      key: "createdAt",
      header: "الوقت",
      render: (log) => (
        <span className="text-xs text-muted-foreground">
          {formatDateAr(log.createdAt as string)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">تتبع التوصيل والإحصائيات</h3>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">آخر 7 أيام</SelectItem>
            <SelectItem value="14">آخر 14 يوم</SelectItem>
            <SelectItem value="30">آخر 30 يوم</SelectItem>
            <SelectItem value="90">آخر 90 يوم</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{stats?.totalSent ?? 0}</div>
            <div className="text-sm text-muted-foreground">إجمالي الإشعارات</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-600">{stats?.deliveryRate ?? 0}%</div>
            <div className="text-sm text-muted-foreground">نسبة التوصيل</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-orange-600">{stats?.byChannel?.length ?? 0}</div>
            <div className="text-sm text-muted-foreground">قنوات نشطة</div>
          </CardContent>
        </Card>
      </div>

      {stats?.byChannel && stats.byChannel.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">إحصائيات القنوات</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.byChannel.map((ch) => {
                const rate = ch.total > 0 ? Math.round((ch.delivered / ch.total) * 100) : 0;
                return (
                  <div key={ch.channel} className="flex items-center gap-3">
                    <ChannelBadge channel={ch.channel} />
                    <div className="flex-1">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${rate}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-green-600">{ch.delivered} وصل</span>
                      <span className="text-red-500">{ch.failed} فشل</span>
                      <span className="text-yellow-600">{ch.pending} انتظار</span>
                      <span className="text-muted-foreground font-medium">{rate}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {logs && logs.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">آخر عمليات التوصيل</CardTitle></CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={deliveryLogColumns}
              data={logs}
              searchPlaceholder={null}
              noToolbar
              pageSize={0}
              emptyMessage="لا توجد سجلات"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PreferencesTab() {
  const { data: prefsData, isLoading, isError } = useApiQuery(["notif-preferences"], "/notification-engine/preferences");
  const preferences = asList(prefsData?.data);
  const categories: Array<{ eventCategory: string; description: string | null }> = prefsData?.categories ?? [];

  const [localPrefs, setLocalPrefs] = useState<Record<string, Record<string, boolean>>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const map: Record<string, Record<string, boolean>> = {};
    for (const p of preferences) {
      map[p.category as string] = {
        inApp: p.inApp as boolean,
        email: p.email as boolean,
        sms: p.sms as boolean,
        whatsapp: p.whatsapp as boolean,
        push: p.push as boolean,
        webhook: p.webhook as boolean,
      };
    }
    for (const cat of categories) {
      if (!map[cat.eventCategory]) {
        map[cat.eventCategory] = { inApp: true, email: true, sms: false, whatsapp: false, push: true, webhook: false };
      }
    }
    setLocalPrefs(map);
  }, [prefsData]);

  const toggle = (category: string, channel: string) => {
    setLocalPrefs((prev) => ({
      ...prev,
      [category]: { ...prev[category], [channel]: !prev[category]?.[channel] },
    }));
    setDirty(true);
  };

  const saveMut = useApiMutation<any, { preferences: Array<Record<string, any>> }>(
    "/notification-engine/preferences",
    "PUT",
    [["notif-preferences"]],
    {
      successMessage: "تم حفظ التفضيلات",
      onSuccess: () => setDirty(false),
    }
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const saveAll = () => {
    const prefs = Object.entries(localPrefs).map(([category, channels]) => ({
      category,
      ...channels,
    }));
    saveMut.mutate({ preferences: prefs });
  };

  const channelCols = [
    { key: "inApp", label: "داخلي" },
    { key: "email", label: "إيميل" },
    { key: "sms", label: "رسائل نصية" },
    { key: "whatsapp", label: "واتساب" },
    { key: "push", label: "فوري" },
  ];

  const preferencesColumns: DataTableColumn<{ category: string; channels: Record<string, boolean> }>[] = [
    {
      key: "category",
      header: "نوع الحدث",
      render: (row) => {
        const catInfo = categories.find((c) => c.eventCategory === row.category);
        return (
          <div>
            <div className="font-medium">{row.category}</div>
            {catInfo?.description && <div className="text-xs text-muted-foreground">{catInfo.description}</div>}
          </div>
        );
      },
    },
    ...channelCols.map((ch) => ({
      key: ch.key,
      header: ch.label,
      align: "center" as const,
      render: (row: { category: string; channels: Record<string, boolean> }) => (
        <Switch
          checked={row.channels[ch.key] ?? false}
          onCheckedChange={() => toggle(row.category, ch.key)}
        />
      ),
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">تفضيلات الإشعارات الشخصية</h3>
        <GuardedButton perm="settings:create" size="sm" onClick={saveAll} disabled={!dirty}>
          <Save className="h-4 w-4 ml-1" /> حفظ التفضيلات
        </GuardedButton>
      </div>
      <p className="text-sm text-muted-foreground">
        اختر القنوات التي تريد استقبال الإشعارات عليها لكل نوع من الأحداث.
      </p>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={preferencesColumns}
            data={Object.entries(localPrefs).sort(([a], [b]) => a.localeCompare(b)).map(([category, channels]) => ({ category, channels }))}
            rowKey={(row) => row.category}
            searchPlaceholder={null}
            noToolbar
            pageSize={0}
            emptyMessage="لا توجد تفضيلات"
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function NotificationEnginePage() {
  return (
    <PageShell
      title="محرك الإشعارات"
      subtitle="توجيه ذكي، قوالب رسائل، سلاسل تصعيد، و تتبع التوصيل"
      breadcrumbs={[{ href: "/settings", label: "الإعدادات" }, { label: "محرك الإشعارات" }]}
    >
      <Tabs defaultValue="routing" dir="rtl">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="routing" className="gap-1">
            <Route className="h-4 w-4" /> التوجيه
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1">
            <Shield className="h-4 w-4" /> القوالب
          </TabsTrigger>
          <TabsTrigger value="fallback" className="gap-1">
            <ArrowRight className="h-4 w-4" /> التصعيد
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-1">
            <Webhook className="h-4 w-4" /> خطافات الاستدعاء
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-1">
            <BarChart3 className="h-4 w-4" /> التوصيل
          </TabsTrigger>
        </TabsList>

        <TabsContent value="routing"><RoutingRulesTab /></TabsContent>
        <TabsContent value="templates"><TemplatesTab /></TabsContent>
        <TabsContent value="fallback"><FallbackChainsTab /></TabsContent>
        <TabsContent value="webhooks"><WebhooksTab /></TabsContent>
        <TabsContent value="stats"><DeliveryStatsTab /></TabsContent>
      </Tabs>

      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Bell className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h4 className="font-medium text-blue-800">تفضيلات الإشعارات الشخصية</h4>
              <p className="text-sm text-blue-600">يمكن لكل مستخدم تحديد القنوات المفضلة لاستقبال الإشعارات من الإعدادات الشخصية.</p>
            </div>
          </div>
          <div className="mt-3">
            <PreferencesTab />
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
