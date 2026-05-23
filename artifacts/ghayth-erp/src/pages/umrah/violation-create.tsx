import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useFormContext } from "react-hook-form";
import { z } from "zod";
import { useApiMutation, useApiQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CreatePageLayout,
  CreationDateField,
} from "@/components/create-page-layout";
import {
  FormShell,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormGrid,
} from "@workspace/ui-core";
import { AlertTriangle, Clock, UserX, HelpCircle, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";

const violationTypes = [
  { value: "overstay", label: "تأخر مغادرة", icon: Clock, cls: "border-status-warning-surface bg-status-warning-surface ring-amber-200", desc: "تأخر المعتمر عن موعد المغادرة المحدد" },
  { value: "absconded", label: "هروب", icon: UserX, cls: "border-status-error-surface bg-status-error-surface ring-red-200", desc: "هروب المعتمر من مقر الإقامة" },
  { value: "other", label: "أخرى", icon: HelpCircle, cls: "border-slate-300 bg-slate-50 ring-slate-200", desc: "مخالفة غير مصنفة" },
];

const statusOptions = [
  { value: "detected", label: "مكتشفة" },
  { value: "open", label: "مفتوحة" },
];

const referenceTypes = [
  { value: "mutamer", label: "معتمر" },
  { value: "group", label: "مجموعة" },
  { value: "passport", label: "جواز سفر" },
  { value: "border", label: "حدود" },
];

const violationSchema = z.object({
  type: z.string().min(1, "نوع المخالفة مطلوب"),
  status: z.string().min(1),
  referenceType: z.string(),
  referenceNumber: z.string(),
  mutamerId: z.string(),
  agentId: z.string(),
  subAgentId: z.string(),
  penaltyAmount: z.string(),
  description: z.string(),
});

type ViolationForm = z.infer<typeof violationSchema>;

const DEFAULTS: ViolationForm = {
  type: "",
  status: "open",
  referenceType: "mutamer",
  referenceNumber: "",
  mutamerId: "",
  agentId: "",
  subAgentId: "",
  penaltyAmount: "",
  description: "",
};

const DRAFT_KEY = "umrah_violation_create";
const STORAGE_KEY = `erp_draft_${DRAFT_KEY}`;

function loadDraftDefaults(): ViolationForm {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
  } catch { /* corrupt draft */ }
  return DEFAULTS;
}

function DraftManager({ defaults }: { defaults: ViolationForm }) {
  const form = useFormContext<ViolationForm>();
  const [visible, setVisible] = useState(() => !!localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const sub = form.watch((values) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(values)); } catch { /* quota */ }
      }, 1000);
    });
    return () => { sub.unsubscribe(); clearTimeout(timer); };
  }, [form]);

  if (!visible) return null;

  return (
    <div className="mb-4 flex items-center justify-between bg-status-warning-surface border border-status-warning-surface rounded-lg px-4 py-2 text-sm text-status-warning-foreground">
      <span>تم استعادة مسودة محفوظة سابقا</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-status-warning-foreground h-7 px-2"
        onClick={() => {
          localStorage.removeItem(STORAGE_KEY);
          form.reset(defaults);
          setVisible(false);
        }}
      >
        مسح المسودة
      </Button>
    </div>
  );
}

function ViolationTypeSelector() {
  const { watch, setValue, formState: { errors } } = useFormContext<ViolationForm>();
  const currentType = watch("type");
  const error = errors.type?.message;

  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" /> نوع المخالفة <span className="text-status-error">*</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {violationTypes.map((vt) => {
          const Icon = vt.icon;
          return (
            <button
              key={vt.value}
              type="button"
              onClick={() => setValue("type", vt.value, { shouldValidate: true })}
              className={cn(
                "p-4 rounded-xl border-2 text-right transition-all",
                currentType === vt.value
                  ? `${vt.cls} ring-2 ring-offset-1`
                  : "border-border hover:border-border",
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className="h-5 w-5" />
                <span className="text-sm font-medium">{vt.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{vt.desc}</p>
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-status-error-foreground mt-1">{error}</p>}
    </div>
  );
}

function ViolationSummary({ agents, subAgents }: { agents: any[]; subAgents: any[] }) {
  const { watch } = useFormContext<ViolationForm>();
  const [type, agentId, penaltyAmount] = watch(["type", "agentId", "penaltyAmount"]);

  const typeMeta = violationTypes.find((t) => t.value === type);
  const agent = agents.find((a: any) => String(a.id) === agentId);

  if (!type) return null;

  return (
    <div className={cn(
      "p-4 rounded-xl border",
      type === "absconded" ? "bg-status-error-surface border-status-error-surface" : type === "overstay" ? "bg-status-warning-surface border-status-warning-surface" : "bg-slate-50 border-slate-200",
    )}>
      <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
        <DollarSign className="h-4 w-4" /> ملخص المخالفة
      </h4>
      <div className="flex flex-wrap gap-2">
        {typeMeta && <Badge variant="outline">{typeMeta.label}</Badge>}
        {agent && <Badge variant="outline">{agent.name}</Badge>}
        {penaltyAmount && (
          <Badge variant="outline">غرامة: {formatCurrency(Number(penaltyAmount))}</Badge>
        )}
      </div>
    </div>
  );
}

export default function UmrahViolationCreate() {
  const [, setLocation] = useLocation();

  const createMut = useApiMutation("/umrah/violations", "POST", [["umrah-violations"]], {
    successMessage: "تم إنشاء المخالفة بنجاح",
  });

  const { data: agentsData } = useApiQuery<{ data: any[] }>(["umrah-agents"], "/umrah/agents");
  const { data: subAgentsData } = useApiQuery<{ data: any[] }>(["umrah-sub-agents"], "/umrah/sub-agents");
  const { data: pilgrimsData } = useApiQuery<{ data: any[] }>(["umrah-pilgrims"], "/umrah/pilgrims");

  const agents = agentsData?.data ?? [];
  const subAgents = subAgentsData?.data ?? [];
  const pilgrims = pilgrimsData?.data ?? [];

  const draftDefaults = loadDraftDefaults();

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <CreatePageLayout
      title="تسجيل مخالفة عمرة"
      backPath="/umrah/violations"
      breadcrumbs={[{ label: "العمرة", href: "/umrah" }, { label: "المخالفات", href: "/umrah/violations" }]}
    >
      <FormGrid cols={1}>
        <CreationDateField />
      </FormGrid>

      <FormShell
        schema={violationSchema}
        defaultValues={draftDefaults}
        submitLabel="تسجيل المخالفة"
        submitVariant="destructive"
        secondaryActions={
          <Button type="button" variant="outline" onClick={() => setLocation("/umrah/violations")}>
            إلغاء
          </Button>
        }
        onSubmit={async (values) => {
          await createMut.mutateAsync({
            type: values.type,
            status: values.status || "open",
            referenceType: values.referenceType || null,
            referenceNumber: values.referenceNumber || null,
            mutamerId: values.mutamerId ? Number(values.mutamerId) : null,
            agentId: values.agentId ? Number(values.agentId) : null,
            subAgentId: values.subAgentId ? Number(values.subAgentId) : null,
            penaltyAmount: values.penaltyAmount ? Number(values.penaltyAmount) : 0,
            description: values.description || null,
          });
          clearDraft();
          setLocation("/umrah/violations");
        }}
      >
        <DraftManager defaults={DEFAULTS} />

        <div className="space-y-6">
          <ViolationTypeSelector />

          <FormGrid cols={2}>
            <FormSelectField
              name="status"
              label="الحالة"
              options={statusOptions}
            />
            <FormSelectField
              name="referenceType"
              label="نوع المرجع"
              options={referenceTypes}
            />
          </FormGrid>

          <FormGrid cols={2}>
            <FormTextField
              name="referenceNumber"
              label="رقم المرجع"
              placeholder="رقم الجواز، المجموعة، أو الحدود"
            />
            <FormSelectField
              name="mutamerId"
              label="المعتمر"
              placeholder="اختر المعتمر (اختياري)"
              options={pilgrims.map((p: any) => ({
                value: String(p.id),
                label: `${p.fullName || p.name || "—"} ${p.passportNumber ? `(${p.passportNumber})` : ""}`,
              }))}
            />
          </FormGrid>

          <FormGrid cols={2}>
            <FormSelectField
              name="agentId"
              label="الوكيل"
              placeholder="اختر الوكيل (اختياري)"
              options={agents.map((a: any) => ({
                value: String(a.id),
                label: a.name,
              }))}
            />
            <FormSelectField
              name="subAgentId"
              label="الوكيل الفرعي"
              placeholder="اختر الوكيل الفرعي (اختياري)"
              options={subAgents.map((s: any) => ({
                value: String(s.id),
                label: s.name,
              }))}
            />
          </FormGrid>

          <FormGrid cols={1}>
            <FormTextField
              name="penaltyAmount"
              label="مبلغ الغرامة (ريال)"
              type="number"
              placeholder="0"
            />
          </FormGrid>

          <FormTextareaField
            name="description"
            label="وصف المخالفة"
            placeholder="تفاصيل المخالفة وظروف اكتشافها..."
          />

          <ViolationSummary agents={agents} subAgents={subAgents} />
        </div>
      </FormShell>
    </CreatePageLayout>
  );
}
