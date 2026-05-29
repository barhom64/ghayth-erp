/**
 * Admin → Notification Routing.
 *
 * Two-tab CRUD for the existing notification_routing_rules and
 * notification_fallback_chains tables. The notificationEngine already
 * reads these at runtime; this page lets operators manage them from
 * the UI instead of editing rows by hand.
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Bell, GitBranch, Plus, Trash2, RefreshCw } from "lucide-react";

interface RuleRow {
  id: number;
  eventCategory: string;
  channels: string[];
  priority: "low" | "normal" | "high" | "urgent";
  isActive: boolean;
  description: string | null;
  fallbackChainId: number | null;
  fallbackChainName: string | null;
  createdAt: string;
}

interface ChainRow {
  id: number;
  name: string;
  description: string | null;
  steps: Array<{ delayMinutes: number; channels: string[]; target?: string }>;
  isActive: boolean;
  createdAt: string;
}

const ALL_CHANNELS = ["in_app", "email", "whatsapp", "sms", "push", "webhook"] as const;

export default function AdminNotificationRouting() {
  const [tab, setTab] = useState("rules");
  const [ruleOpen, setRuleOpen] = useState(false);
  const [chainOpen, setChainOpen] = useState(false);

  const { data: rulesResp, isLoading: rLoad, refetch: refetchRules } =
    useApiQuery<{ data: RuleRow[] }>(["notif-routing-rules"], "/admin/notification-routing/rules");
  const { data: chainsResp, isLoading: cLoad, refetch: refetchChains } =
    useApiQuery<{ data: ChainRow[] }>(["notif-routing-chains"], "/admin/notification-routing/chains");

  const rules = rulesResp?.data ?? [];
  const chains = chainsResp?.data ?? [];

  const refreshAll = () => { void refetchRules(); void refetchChains(); };

  const createRule = useMutation({
    mutationFn: (b: Partial<RuleRow>) => apiFetch("/admin/notification-routing/rules", {
      method: "POST", body: JSON.stringify(b),
    }),
    onSuccess: () => { toast({ title: "أُضيفت القاعدة" }); setRuleOpen(false); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });
  const toggleRule = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/admin/notification-routing/rules/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => { toast({ title: "تم التحديث" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });
  const deleteRule = useMutation({
    mutationFn: (id: number) => apiFetch(`/admin/notification-routing/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "حُذفت" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });
  const createChain = useMutation({
    mutationFn: (b: Partial<ChainRow>) => apiFetch("/admin/notification-routing/chains", {
      method: "POST", body: JSON.stringify(b),
    }),
    onSuccess: () => { toast({ title: "أُضيفت السلسلة" }); setChainOpen(false); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });
  const toggleChain = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/admin/notification-routing/chains/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => { toast({ title: "تم تحديث السلسلة" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const ruleColumns: DataTableColumn<RuleRow>[] = [
    { key: "eventCategory", header: "فئة الحدث", searchable: true, render: (r) => (
      <span className="font-mono text-xs font-medium">{r.eventCategory}</span>
    )},
    { key: "channels", header: "القنوات", render: (r) => (
      <div className="flex gap-1 flex-wrap">
        {r.channels.map((c) => <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>)}
      </div>
    )},
    { key: "priority", header: "الأولوية", render: (r) => <PageStatusBadge status={r.priority} /> },
    { key: "fallbackChainName", header: "السلسلة الاحتياطية", render: (r) => (
      <span className="text-xs">{r.fallbackChainName ?? "—"}</span>
    )},
    { key: "isActive", header: "مفعّلة", render: (r) => (
      <Button variant="ghost" size="sm" onClick={() => toggleRule.mutate({ id: r.id, isActive: !r.isActive })}>
        {r.isActive ? "مفعّلة" : "معطّلة"}
      </Button>
    )},
    { key: "actions", header: "", render: (r) => (
      <Button variant="ghost" size="sm" onClick={() => deleteRule.mutate(r.id)}>
        <Trash2 className="w-3 h-3 text-status-error-foreground" />
      </Button>
    )},
  ];

  // PATCH /admin/notification-routing/chains/:id — toggles the chain's
  // isActive flag inline so admins can disable a misbehaving fallback
  // chain without opening the editor.
  const toggleChainMut = useMutation({
    mutationFn: (body: { id: number; isActive: boolean }) =>
      apiFetch(`/admin/notification-routing/chains/${body.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: body.isActive }),
      }),
    onSuccess: () => { toast({ title: "تم التحديث" }); refetchChains(); },
    onError: (e: Error) => toast({ title: "فشل", description: e.message, variant: "destructive" }),
  });

  const chainColumns: DataTableColumn<ChainRow>[] = [
    { key: "name", header: "الاسم", searchable: true, render: (r) => (
      <div>
        <p className="text-xs font-medium">{r.name}</p>
        {r.description && <p className="text-[11px] text-muted-foreground">{r.description}</p>}
      </div>
    )},
    { key: "steps", header: "الخطوات", render: (r) => (
      <span className="font-mono text-xs">{r.steps.length}</span>
    )},
    { key: "isActive", header: "مفعّلة", render: (r) => (
      <button
        type="button"
        onClick={() => toggleChainMut.mutate({ id: r.id, isActive: !r.isActive })}
        disabled={toggleChainMut.isPending}
        className="cursor-pointer"
        title={r.isActive ? "تعطيل" : "تفعيل"}
      >
        <PageStatusBadge status={r.isActive ? "active" : "disabled"} />
      </button>
    ) },
    { key: "createdAt", header: "أُضيفت", render: (r) => (
      <span className="text-xs">{formatDateAr(r.createdAt)}</span>
    )},
  ];

  return (
    <PageShell
      title="توجيه الإشعارات"
      subtitle="قواعد توجيه الإشعارات حسب فئة الحدث + سلاسل التصعيد الاحتياطية"
      actions={
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw className="w-4 h-4 me-1" />تحديث
        </Button>
      }
    >
      <PageStateWrapper isLoading={(rLoad || cLoad) && rules.length === 0 && chains.length === 0}>
        <Tabs value={tab} onValueChange={setTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="rules"><Bell className="w-4 h-4 me-1" />القواعد ({rules.length})</TabsTrigger>
            <TabsTrigger value="chains"><GitBranch className="w-4 h-4 me-1" />سلاسل التصعيد ({chains.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="rules" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => setRuleOpen(true)} size="sm" rateLimitAware>
                <Plus className="w-4 h-4 me-1" />قاعدة جديدة
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {rules.length > 0
                  ? <DataTable columns={ruleColumns} data={rules} noToolbar pageSize={0} />
                  : <p className="text-sm text-muted-foreground p-6 text-center">لا توجد قواعد بعد.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chains" className="space-y-3">
            <div className="flex justify-end">
              <Button onClick={() => setChainOpen(true)} size="sm" rateLimitAware>
                <Plus className="w-4 h-4 me-1" />سلسلة جديدة
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                {chains.length > 0
                  ? <DataTable columns={chainColumns} data={chains} noToolbar pageSize={0} />
                  : <p className="text-sm text-muted-foreground p-6 text-center">لا توجد سلاسل بعد.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <NewRuleDialog
          open={ruleOpen}
          chains={chains}
          onClose={() => setRuleOpen(false)}
          onSubmit={(b) => createRule.mutate(b)}
          isSubmitting={createRule.isPending}
        />
        <NewChainDialog
          open={chainOpen}
          onClose={() => setChainOpen(false)}
          onSubmit={(b) => createChain.mutate(b)}
          isSubmitting={createChain.isPending}
        />
      </PageStateWrapper>
    </PageShell>
  );
}

function NewRuleDialog({ open, chains, onClose, onSubmit, isSubmitting }: {
  open: boolean; chains: ChainRow[]; onClose: () => void;
  onSubmit: (b: Partial<RuleRow>) => void; isSubmitting: boolean;
}) {
  const [eventCategory, setEventCategory] = useState("");
  const [channels, setChannels] = useState<string[]>(["in_app"]);
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [description, setDescription] = useState("");
  const [fallbackChainId, setFallbackChainId] = useState<string>("");
  const toggleChannel = (c: string) =>
    setChannels((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>قاعدة توجيه جديدة</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>فئة الحدث</Label><Input value={eventCategory} onChange={(e) => setEventCategory(e.target.value)} placeholder="invoice.created" /></div>
          <div>
            <Label>القنوات</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {ALL_CHANNELS.map((c) => (
                <Button
                  key={c}
                  variant={channels.includes(c) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleChannel(c)}
                  type="button"
                >
                  {c}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>الأولوية</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as "low" | "normal" | "high" | "urgent")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">low</SelectItem>
                  <SelectItem value="normal">normal</SelectItem>
                  <SelectItem value="high">high</SelectItem>
                  <SelectItem value="urgent">urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>سلسلة احتياطية (اختياري)</Label>
              <Select value={fallbackChainId || "none"} onValueChange={(v) => setFallbackChainId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون</SelectItem>
                  {chains.filter((c) => c.isActive).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>الوصف</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button rateLimitAware disabled={isSubmitting || !eventCategory || channels.length === 0} onClick={() => onSubmit({
            eventCategory, channels: channels as RuleRow["channels"], priority,
            description: description || null,
            fallbackChainId: fallbackChainId ? Number(fallbackChainId) : null,
          })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewChainDialog({ open, onClose, onSubmit, isSubmitting }: {
  open: boolean; onClose: () => void;
  onSubmit: (b: Partial<ChainRow>) => void; isSubmitting: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<ChainRow["steps"]>([{ delayMinutes: 0, channels: ["in_app"] }]);
  const addStep = () => setSteps([...steps, { delayMinutes: 30, channels: ["email"] }]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));
  const updateStep = (i: number, patch: Partial<ChainRow["steps"][number]>) =>
    setSteps(steps.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>سلسلة تصعيد جديدة</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div><Label>الاسم</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>الوصف</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div>
            <Label className="mb-2 block">الخطوات ({steps.length})</Label>
            <div className="space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="bg-surface-subtle p-2 rounded text-sm flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                  <Input
                    type="number"
                    className="w-24"
                    value={s.delayMinutes}
                    onChange={(e) => updateStep(i, { delayMinutes: Number(e.target.value) })}
                  />
                  <span className="text-xs">دقيقة بعد البداية، قنوات:</span>
                  <Input
                    className="w-48 font-mono text-xs"
                    value={s.channels.join(",")}
                    onChange={(e) => updateStep(i, { channels: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                    placeholder="email,sms"
                  />
                  <Button variant="ghost" size="sm" onClick={() => removeStep(i)}>
                    <Trash2 className="w-3 h-3 text-status-error-foreground" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addStep}>
                <Plus className="w-3 h-3 me-1" />أضف خطوة
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button rateLimitAware disabled={isSubmitting || !name || steps.length === 0} onClick={() => onSubmit({
            name, description: description || null, steps, isActive: true,
          })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
