/**
 * Task #329 — WPS bank delivery credentials settings.
 *
 * Per-(company,bank) SFTP/HTTPS credentials, scoped through the
 * standard `req.scope.companyId`. Backend stores the field map
 * encrypted (AES-256-GCM via `lib/secrets.ts`); secret values are
 * never echoed back, the UI only shows a "configured" badge and the
 * list of field names that are set. Empty form values clear the
 * field; deleting the row falls back to `process.env`.
 */
import { useMemo, useState } from "react";
import { apiFetch, useApiQuery } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { PageShell } from "@workspace/ui-core";
import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { toast } from "@/hooks/use-toast";
import { Banknote, Save, Trash2, ShieldCheck, KeyRound } from "lucide-react";

interface FieldSpec {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
  multiline?: boolean;
  help?: string;
}
interface Status {
  bankCode: string;
  format: string;
  channel: "sftp" | "https";
  configured: boolean;
  source: "db" | "env" | "none";
  fieldsSet: string[];
  updatedAt: string | null;
}
interface CredentialsResponse {
  data: Status[];
  fieldSpecs: Record<string, FieldSpec[]>;
}

function sourceBadge(source: Status["source"]) {
  if (source === "db") {
    return <Badge className="bg-emerald-100 text-emerald-800">معطاة (قاعدة البيانات)</Badge>;
  }
  if (source === "env") {
    return <Badge className="bg-sky-100 text-sky-800">من متغيرات البيئة</Badge>;
  }
  return <Badge className="bg-slate-200 text-slate-700">غير مُعدَّة</Badge>;
}

function BankCard({
  status,
  specs,
  onSaved,
  onCleared,
}: {
  status: Status;
  specs: FieldSpec[];
  onSaved: () => void;
  onCleared: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function setField(name: string, v: string) {
    setValues((prev) => ({ ...prev, [name]: v }));
  }

  async function save() {
    // Drop empty strings — server only persists non-empty fields, and
    // we don't want to wipe a field by accident on first edit.
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === "string" && v.trim().length > 0) fields[k] = v.trim();
    }
    if (Object.keys(fields).length === 0) {
      toast({ title: "لا توجد قيم للحفظ", description: "الرجاء إدخال قيمة واحدة على الأقل قبل الحفظ.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/hr/saudi/wps/credentials/${encodeURIComponent(status.bankCode)}`, {
        method: "PUT",
        body: JSON.stringify({ fields }),
      });
      toast({ title: "تم حفظ بيانات الاعتماد", description: `بنك: ${status.bankCode}` });
      setValues({});
      onSaved();
    } catch (e: any) {
      toast({ title: "فشل الحفظ", description: e?.message ?? "خطأ غير متوقع", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function clearRow() {
    setBusy(true);
    try {
      await apiFetch(`/hr/saudi/wps/credentials/${encodeURIComponent(status.bankCode)}`, {
        method: "DELETE",
      });
      toast({ title: "تم حذف بيانات الاعتماد", description: "سيتم استخدام متغيرات البيئة كبديل عند توفرها." });
      onCleared();
    } catch (e: any) {
      toast({ title: "فشل الحذف", description: e?.message ?? "خطأ غير متوقع", variant: "destructive" });
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Banknote className="h-5 w-5 text-slate-600" />
            <span>{status.bankCode}</span>
            <Badge variant="outline" className="font-mono text-xs">
              {status.channel.toUpperCase()}
            </Badge>
          </CardTitle>
          {sourceBadge(status.source)}
        </div>
        {status.fieldsSet.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>الحقول المعطاة:</span>
            {status.fieldsSet.map((f) => (
              <Badge key={f} variant="secondary" className="font-mono">
                {f}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {specs.map((s) => {
            const id = `${status.bankCode}-${s.name}`;
            const inputType = s.secret ? "password" : "text";
            return (
              <div key={s.name} className="space-y-1">
                <Label htmlFor={id} className="text-sm">
                  {s.label}
                  {s.required && <span className="text-red-600"> *</span>}
                </Label>
                {s.multiline ? (
                  <Textarea
                    id={id}
                    rows={4}
                    placeholder={status.fieldsSet.includes(s.name) ? "محفوظ — اتركه فارغاً للإبقاء" : ""}
                    value={values[s.name] ?? ""}
                    onChange={(e) => setField(s.name, e.target.value)}
                    className="font-mono text-xs"
                  />
                ) : (
                  <Input
                    id={id}
                    type={inputType}
                    placeholder={status.fieldsSet.includes(s.name) ? "محفوظ — اتركه فارغاً للإبقاء" : ""}
                    value={values[s.name] ?? ""}
                    onChange={(e) => setField(s.name, e.target.value)}
                  />
                )}
                {s.help && <p className="text-xs text-slate-500">{s.help}</p>}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <KeyRound className="h-3.5 w-3.5" />
            <span>القيم الفارغة تُتجاهَل عند الحفظ. لإزالة جميع القيم استخدم زر الحذف.</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !status.configured || status.source !== "db"}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4 ml-1" />
              حذف
            </Button>
            <Button size="sm" disabled={busy} onClick={save}>
              <Save className="h-4 w-4 ml-1" />
              حفظ
            </Button>
          </div>
        </div>
      </CardContent>

      {/* GAP_MATRIX P1 UI-unification §6.2 — ConfirmActionDialog replaces raw AlertDialog */}
      <ConfirmActionDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        variant="destructive"
        title={`حذف بيانات اعتماد ${status.bankCode}؟`}
        description="ستحاول التسليمات التالية استخدام متغيرات البيئة بدلاً من هذه القيم. يمكن إعادة الإدخال في أي وقت."
        confirmLabel="تأكيد الحذف"
        onConfirm={clearRow}
      />
    </Card>
  );
}

export default function WpsBankCredentialsSettings() {
  const path = "/hr/saudi/wps/credentials";
  const { data, isLoading, error } = useApiQuery<CredentialsResponse>(
    ["hr", "saudi", "wps", "credentials"],
    path,
  );
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "hr" && q.queryKey[3] === "credentials",
    });

  const banks = useMemo(() => data?.data ?? [], [data]);
  const specs = useMemo(() => data?.fieldSpecs ?? {}, [data]);

  return (
    <PageShell
      title="إعدادات قنوات بنوك WPS"
      subtitle="إدارة بيانات اعتماد التسليم المباشر (SFTP / HTTPS) لكل بنك. تُحفظ مشفّرة على مستوى الشركة، ويرجع النظام تلقائياً إلى متغيرات البيئة عند عدم توفّرها."
    >
      <HrTabsNav />
      {isLoading && <LoadingSpinner />}
      {error && <ErrorState onRetry={refresh} error={error} />}
      {!isLoading && !error && banks.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-slate-500">
            لا يوجد بنك مهيأ بقناة تسليم مباشرة.
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 gap-4">
        {banks.map((b) => (
          <BankCard
            key={b.bankCode}
            status={b}
            specs={specs[b.format] ?? []}
            onSaved={refresh}
            onCleared={refresh}
          />
        ))}
      </div>
    </PageShell>
  );
}
