import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Filter, X, Plus } from "lucide-react";

export interface AbacConditions {
  statusIn?: string[];
  statusNotIn?: string[];
  amountMax?: number;
  amountMin?: number;
  ownRecord?: boolean;
  ownDepartment?: boolean;
  ownBranch?: boolean;
  businessHours?: { from: number; to: number };
  daysOfWeek?: number[];
  ipPrefixIn?: string[];
  emergencyDisabled?: boolean;
}

const DAY_LABELS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

interface Props {
  value: AbacConditions | null;
  onChange: (next: AbacConditions | null) => void;
  triggerLabel?: string;
}

export function ConditionsEditor({ value, onChange, triggerLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AbacConditions>(value || {});

  useEffect(() => {
    if (open) setDraft(value || {});
  }, [open, value]);

  const conditionCount = Object.keys(value || {}).length;

  const apply = () => {
    const cleaned: AbacConditions = {};
    if (draft.statusIn?.length) cleaned.statusIn = draft.statusIn;
    if (draft.statusNotIn?.length) cleaned.statusNotIn = draft.statusNotIn;
    if (draft.amountMax != null) cleaned.amountMax = draft.amountMax;
    if (draft.amountMin != null) cleaned.amountMin = draft.amountMin;
    if (draft.ownRecord) cleaned.ownRecord = true;
    if (draft.ownDepartment) cleaned.ownDepartment = true;
    if (draft.ownBranch) cleaned.ownBranch = true;
    if (draft.businessHours?.from != null && draft.businessHours?.to != null) {
      cleaned.businessHours = draft.businessHours;
    }
    if (draft.daysOfWeek?.length && draft.daysOfWeek.length < 7) {
      cleaned.daysOfWeek = draft.daysOfWeek;
    }
    if (draft.ipPrefixIn?.length) cleaned.ipPrefixIn = draft.ipPrefixIn;
    if (draft.emergencyDisabled) cleaned.emergencyDisabled = true;
    onChange(Object.keys(cleaned).length > 0 ? cleaned : null);
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setOpen(false);
  };

  return (
    <>
      <Button
        size="sm"
        variant={conditionCount > 0 ? "default" : "outline"}
        onClick={() => setOpen(true)}
        className="text-xs h-7"
      >
        <Filter className="h-3 w-3 me-1" />
        {triggerLabel || "شروط"}
        {conditionCount > 0 && (
          <Badge variant="outline" className="ms-1 h-4 px-1 text-[10px] bg-white text-status-info-foreground">
            {conditionCount}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              شروط ABAC الديناميكية
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              تضيق متى تنطبق الصلاحية. كل الشروط AND-combined — أي شرط يفشل، الصلاحية تُرفض.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status filters */}
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-status-neutral-foreground mb-2">حالة السجل</p>
                <ListInput
                  label="مسموح فقط في الحالات"
                  placeholder="draft, pending"
                  value={draft.statusIn || []}
                  onChange={(v) => setDraft((d) => ({ ...d, statusIn: v.length > 0 ? v : undefined }))}
                />
                <ListInput
                  label="ممنوع في الحالات"
                  placeholder="closed, cancelled"
                  value={draft.statusNotIn || []}
                  onChange={(v) => setDraft((d) => ({ ...d, statusNotIn: v.length > 0 ? v : undefined }))}
                />
              </CardContent>
            </Card>

            {/* Amount bounds */}
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-status-neutral-foreground mb-2">حدود المبلغ (تُقرأ من السجل)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">الحد الأدنى</label>
                    <Input
                      type="number"
                      value={draft.amountMin ?? ""}
                      placeholder="بلا حد"
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          amountMin: e.target.value === "" ? undefined : Number(e.target.value),
                        }))
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">الحد الأقصى</label>
                    <Input
                      type="number"
                      value={draft.amountMax ?? ""}
                      placeholder="بلا حد"
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          amountMax: e.target.value === "" ? undefined : Number(e.target.value),
                        }))
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ownership */}
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-status-neutral-foreground mb-2">الملكية</p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!draft.ownRecord}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, ownRecord: !!v || undefined }))}
                    />
                    سجلاتي فقط (record.createdBy = أنا)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!draft.ownDepartment}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, ownDepartment: !!v || undefined }))}
                    />
                    قسمي فقط (record.departmentId = قسمي)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={!!draft.ownBranch}
                      onCheckedChange={(v) => setDraft((d) => ({ ...d, ownBranch: !!v || undefined }))}
                    />
                    فرعي فقط (record.branchId = فرعي)
                  </label>
                </div>
              </CardContent>
            </Card>

            {/* Time + Day */}
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-status-neutral-foreground mb-2">الوقت</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">من ساعة</label>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={draft.businessHours?.from ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        setDraft((d) => {
                          const from = e.target.value === "" ? undefined : Number(e.target.value);
                          if (from == null) {
                            const { businessHours, ...rest } = d;
                            return rest;
                          }
                          return { ...d, businessHours: { from, to: d.businessHours?.to ?? 17 } };
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-1">إلى ساعة</label>
                    <Input
                      type="number"
                      min={1}
                      max={24}
                      value={draft.businessHours?.to ?? ""}
                      placeholder="17"
                      onChange={(e) =>
                        setDraft((d) => {
                          const to = e.target.value === "" ? undefined : Number(e.target.value);
                          if (to == null) {
                            const { businessHours, ...rest } = d;
                            return rest;
                          }
                          return { ...d, businessHours: { from: d.businessHours?.from ?? 8, to } };
                        })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-1">أيام الأسبوع المسموحة</p>
                <div className="flex flex-wrap gap-1">
                  {DAY_LABELS.map((label, idx) => {
                    const active = draft.daysOfWeek?.includes(idx) ?? true;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setDraft((d) => {
                            const cur = d.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6];
                            const next = cur.includes(idx) ? cur.filter((x) => x !== idx) : [...cur, idx].sort();
                            if (next.length === 7) {
                              const { daysOfWeek, ...rest } = d;
                              return rest;
                            }
                            return { ...d, daysOfWeek: next };
                          });
                        }}
                        className={`px-2 py-1 rounded text-xs border ${
                          active ? "bg-status-info-surface border-status-info-surface text-status-info-foreground" : "bg-surface-subtle border-border text-muted-foreground line-through"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">انقر على اليوم لتفعيله/تعطيله. الافتراضي كل الأيام مسموحة.</p>
              </CardContent>
            </Card>

            {/* Network + Emergency */}
            <Card>
              <CardContent className="p-3">
                <p className="text-xs font-semibold text-status-neutral-foreground mb-2">شبكة وطوارئ</p>
                <ListInput
                  label="بادئات IP المسموحة"
                  placeholder="10.0.0., 192.168."
                  value={draft.ipPrefixIn || []}
                  onChange={(v) => setDraft((d) => ({ ...d, ipPrefixIn: v.length > 0 ? v : undefined }))}
                />
                <label className="flex items-center gap-2 text-sm mt-2">
                  <Checkbox
                    checked={!!draft.emergencyDisabled}
                    onCheckedChange={(v) => setDraft((d) => ({ ...d, emergencyDisabled: !!v || undefined }))}
                  />
                  تُجمَّد في حالة الطوارئ
                </label>
              </CardContent>
            </Card>

            {/* Live preview */}
            <Card className="bg-status-info-surface border-status-info-surface">
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-status-info-foreground mb-1">معاينة JSON:</p>
                <pre className="text-[10px] bg-white p-2 rounded overflow-x-auto" dir="ltr">
                  {JSON.stringify(draft, null, 2) || "{}"}
                </pre>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={clear} className="me-auto">
              <X className="h-4 w-4 me-1" />
              مسح كل الشروط
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={apply}>تطبيق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ListInput({ label, value, placeholder, onChange }: {
  label: string;
  value: string[];
  placeholder?: string;
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInput("");
  };

  return (
    <div className="mb-2">
      <label className="text-[10px] text-muted-foreground block mb-1">{label}</label>
      <div className="flex gap-1">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="h-7 text-xs"
        />
        <Button size="sm" variant="outline" onClick={add} className="h-7" disabled={!input.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {value.map((v) => (
            <Badge key={v} variant="outline" className="text-xs bg-status-info-surface cursor-pointer"
              onClick={() => onChange(value.filter((x) => x !== v))}>
              {v} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
