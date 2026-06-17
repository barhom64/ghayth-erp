/**
 * Company Email ("بريد الشركة") — per-company outbound SMTP (migration 388).
 *
 * Lets a company admin set THEIR OWN outbound mailbox with structured fields
 * (host/port/user/password/from/…) + a real connectivity test, instead of the
 * raw-JSON integrations path. When active, it overrides the platform system
 * mailbox for this company only (resolveSystemSmtpConfig step 0). Scoped to
 * the caller's company server-side — no companyId is ever sent from here.
 */
import { useState, useEffect } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageStateWrapper } from "@/components/shared/page-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Mail, Save, FlaskConical, CheckCircle2, AlertOctagon } from "lucide-react";

interface CompanySmtp {
  configured: boolean;
  status: "active" | "disabled";
  config: Record<string, string>;
}

const FIELDS: Array<{ key: string; label: string; type?: string; placeholder?: string; hint?: string }> = [
  { key: "host", label: "خادم SMTP", placeholder: "smtp.hostinger.com" },
  { key: "port", label: "المنفذ", type: "number", placeholder: "465" },
  { key: "user", label: "اسم المستخدم (البريد الكامل)", placeholder: "info@company.sa" },
  { key: "password", label: "كلمة المرور", type: "password", hint: "تُشفَّر في قاعدة البيانات ولا تُعرض مرة أخرى." },
  { key: "from", label: "بريد المرسل", placeholder: "info@company.sa" },
  { key: "fromName", label: "اسم المرسل الظاهر", placeholder: "اسم الشركة" },
  { key: "secure", label: "تشفير TLS (true/false)", placeholder: "true (SSL :465) أو false (STARTTLS :587)" },
];

const HOSTINGER_PRESET: Record<string, string> = {
  host: "smtp.hostinger.com", port: "465", secure: "true",
};

export default function CompanyEmail() {
  const { data, isLoading, error, refetch } = useApiQuery<{ data: CompanySmtp }>(
    ["company-smtp"], "/admin/vendor-settings/company/smtp",
  );
  const current = data?.data;

  const [form, setForm] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"active" | "disabled">("disabled");

  useEffect(() => {
    if (current) {
      // Never prefill the masked password ("*****") back into the field.
      const cfg = { ...current.config };
      if (cfg.password === "*****") delete cfg.password;
      setForm(cfg);
      setStatus(current.status);
    }
  }, [current]);

  const save = useApiMutation("/admin/vendor-settings/company/smtp", "PATCH", [["company-smtp"]], {
    onSuccess: () => { toast({ title: "حُفظ بريد الشركة" }); refetch(); },
    onError: (e: any) => toast({ title: "تعذّر الحفظ", description: e?.message, variant: "destructive" }),
  });
  const test = useApiMutation<{ ok: boolean; message: string }>("/admin/vendor-settings/company/smtp/test", "POST", undefined, {
    onSuccess: (r) => toast({ title: r.ok ? "نجح الاتصال" : "فشل الاتصال", description: r.message, variant: r.ok ? "default" : "destructive" }),
    onError: (e: any) => toast({ title: "فشل الاختبار", description: e?.message, variant: "destructive" }),
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <PageShell
      title="بريد الشركة"
      breadcrumbs={[{ href: "/dashboard", label: "لوحة التحكم" }, { label: "بريد الشركة" }]}
      subtitle="إعداد بريد صادر خاص بشركتك. عند تفعيله يتقدّم على بريد النظام العام لرسائل شركتك فقط."
    >
      <PageStateWrapper isLoading={isLoading} error={error} onRetry={refetch}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2"><Mail className="w-5 h-5" /> SMTP خاص بالشركة</CardTitle>
            <Badge variant={status === "active" ? "default" : "secondary"}>
              {status === "active" ? <><CheckCircle2 className="w-3 h-3 me-1" />مفعّل</> : <><AlertOctagon className="w-3 h-3 me-1" />معطّل</>}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setForm((f) => ({ ...f, ...HOSTINGER_PRESET }))}>
                Hostinger preset
              </Button>
              <Button type="button" variant={status === "active" ? "secondary" : "default"} size="sm"
                onClick={() => setStatus((s) => (s === "active" ? "disabled" : "active"))}>
                {status === "active" ? "تعطيل" : "تفعيل"}
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((fld) => (
                <div key={fld.key} className="space-y-1">
                  <Label htmlFor={fld.key}>{fld.label}</Label>
                  <Input
                    id={fld.key}
                    type={fld.type ?? "text"}
                    placeholder={fld.placeholder}
                    value={form[fld.key] ?? ""}
                    onChange={(e) => set(fld.key, e.target.value)}
                  />
                  {fld.hint && <p className="text-xs text-muted-foreground">{fld.hint}</p>}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => save.mutate({ status, config: form })} disabled={save.isPending}>
                <Save className="w-4 h-4 me-1" />حفظ
              </Button>
              <Button variant="outline" onClick={() => test.mutate({})} disabled={test.isPending}>
                <FlaskConical className="w-4 h-4 me-1" />اختبر الاتصال
              </Button>
            </div>
          </CardContent>
        </Card>
      </PageStateWrapper>
    </PageShell>
  );
}
