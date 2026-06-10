/**
 * PoliciesTab — §8 Phase 2 of #1870
 *
 * Renders all 11 umrah policy categories with their current values
 * from GET /umrah/settings/policies. Each category is an expandable
 * card with its fields + a per-category save button (PUT
 * /umrah/settings/policies/:categoryId).
 *
 * Status badge per category:
 *   configured — every field has an explicit value
 *   missing    — some fields explicit, some default
 *   default    — all fields at the catalog default
 *
 * The tab is rendered inside the existing /umrah/settings page.
 */
import { useEffect, useMemo, useState } from "react";
import { useApiQuery, apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Save, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PolicyStatus = "configured" | "default" | "missing";
type FieldType = "number" | "boolean" | "text" | "select";

interface PolicyFieldFromAPI {
  key: string;
  fullKey: string;
  label: string;
  type: FieldType;
  options?: Array<{ value: string; label: string }>;
  defaultValue?: number | boolean | string | null;
  hint?: string;
  currentValue: number | boolean | string | null;
  effectiveValue: number | boolean | string | null;
}

interface PolicyCategoryFromAPI {
  id: string;
  title: string;
  description: string;
  icon: string;
  fields: PolicyFieldFromAPI[];
  status: PolicyStatus;
  configuredCount: number;
}

const STATUS_TONE: Record<PolicyStatus, string> = {
  configured: "bg-emerald-100 text-emerald-700 border-emerald-300",
  missing:    "bg-amber-100 text-amber-700 border-amber-300",
  default:    "bg-slate-100 text-slate-600 border-slate-300",
};
const STATUS_LABEL_AR: Record<PolicyStatus, string> = {
  configured: "مكتمل",
  missing:    "ناقص",
  default:    "افتراضي",
};

export function PoliciesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useApiQuery<{ data: PolicyCategoryFromAPI[] }>(
    ["umrah-settings-policies"],
    "/umrah/settings/policies",
  );
  const categories = q.data?.data ?? [];

  return (
    <div className="space-y-3" data-testid="policies-tab">
      <div className="text-xs text-muted-foreground">
        {categories.length} فئة سياسة — {categories.filter((c) => c.status === "configured").length} مكتمل /
        {" "}{categories.filter((c) => c.status === "missing").length} ناقص /
        {" "}{categories.filter((c) => c.status === "default").length} افتراضي
      </div>
      {categories.map((cat) => (
        <PolicyCategoryCard
          key={cat.id}
          category={cat}
          onSaved={() => qc.invalidateQueries({ queryKey: ["umrah-settings-policies"] })}
          toast={toast}
        />
      ))}
    </div>
  );
}

function PolicyCategoryCard({
  category,
  onSaved,
  toast,
}: {
  category: PolicyCategoryFromAPI;
  onSaved: () => void;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  const [expanded, setExpanded] = useState<boolean>(category.status === "missing");
  // Local draft mirror; preserves operator edits across re-renders
  // without firing the save until they click the button.
  const initialDraft = useMemo(() => {
    const d: Record<string, number | boolean | string | null> = {};
    for (const f of category.fields) {
      d[f.key] = f.effectiveValue;
    }
    return d;
  }, [category.fields]);
  const [draft, setDraft] = useState<Record<string, number | boolean | string | null>>(initialDraft);
  useEffect(() => { setDraft(initialDraft); }, [initialDraft]);
  const [saving, setSaving] = useState(false);

  const statusCls = STATUS_TONE[category.status];

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch(`/umrah/settings/policies/${category.id}`, {
        method: "PUT",
        body: JSON.stringify({ values: draft }),
      });
      toast({ title: `تم حفظ ${category.title}` });
      onSaved();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.error || err?.message || "تعذّر الحفظ" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid={`policy-card-${category.id}`}>
      <CardHeader className="pb-2">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between text-start"
          data-testid={`policy-toggle-${category.id}`}
        >
          <div>
            <CardTitle className="text-sm">{category.title}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{category.description}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-[10px] px-2 py-0.5 rounded border ${statusCls}`}
              data-testid={`policy-status-${category.id}`}
            >
              {STATUS_LABEL_AR[category.status]}
            </span>
            {expanded
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {category.fields.map((f) => (
            <PolicyFieldEditor
              key={f.key}
              field={f}
              value={draft[f.key]}
              onChange={(v) => setDraft({ ...draft, [f.key]: v })}
            />
          ))}
          <div className="flex justify-end pt-2 border-t">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
              rateLimitAware
              data-testid={`policy-save-${category.id}`}
            >
              <Save className="h-3.5 w-3.5 me-1" />
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function PolicyFieldEditor({
  field,
  value,
  onChange,
}: {
  field: PolicyFieldFromAPI;
  value: number | boolean | string | null;
  onChange: (v: number | boolean | string | null) => void;
}) {
  const testId = `policy-field-${field.fullKey}`;
  if (field.type === "boolean") {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={!!value}
            onCheckedChange={(v) => onChange(!!v)}
            data-testid={testId}
          />
          <Label className="text-sm">{field.label}</Label>
        </div>
        {field.hint && <p className="text-[10px] text-muted-foreground pe-6">{field.hint}</p>}
      </div>
    );
  }
  if (field.type === "select" && field.options) {
    return (
      <div className="space-y-1">
        <Label className="text-sm">{field.label}</Label>
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger data-testid={testId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.hint && <p className="text-[10px] text-muted-foreground">{field.hint}</p>}
      </div>
    );
  }
  // number / text
  return (
    <div className="space-y-1">
      <Label className="text-sm">{field.label}</Label>
      <Input
        type={field.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(e) => {
          const v = e.target.value;
          if (field.type === "number") {
            onChange(v === "" ? null : Number(v));
          } else {
            onChange(v);
          }
        }}
        data-testid={testId}
      />
      {field.hint && <p className="text-[10px] text-muted-foreground">{field.hint}</p>}
    </div>
  );
}
