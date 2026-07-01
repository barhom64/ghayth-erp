import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { PageShell, DataTable, type DataTableColumn } from "@workspace/ui-core";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TextAreaField, FormFieldWrapper } from "@/components/shared/form-field-wrapper";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { Send, Users, MessageSquare, Mail, Phone } from "lucide-react";

interface Campaign { id: number; name: string; channel: string | null; status: string | null; }
interface WhatsAppTemplate { id: number; name: string; language: string; status: string; bodyText: string; variableCount: number; }
interface Recipient {
  id: number; recipientName: string | null; recipient: string | null;
  status: string; errorMessage: string | null; createdAt: string;
}

const CHANNELS = [
  { value: "whatsapp", label: "واتساب", icon: MessageSquare },
  { value: "email", label: "بريد إلكتروني", icon: Mail },
  { value: "sms", label: "رسالة نصية", icon: Phone },
];
const CLIENT_FIELDS = [
  { value: "name", label: "اسم العميل" },
  { value: "code", label: "كود العميل" },
  { value: "nationality", label: "الجنسية" },
  { value: "classification", label: "التصنيف" },
];
const RECIPIENT_STATUS: Record<string, { label: string; tone: string }> = {
  queued: { label: "بالانتظار", tone: "bg-status-neutral-surface text-status-neutral-foreground" },
  sent: { label: "تم الإرسال", tone: "bg-status-success-surface text-status-success-foreground" },
  failed: { label: "فشل", tone: "bg-status-error-surface text-status-error-foreground" },
  skipped: { label: "متخطى", tone: "bg-status-warning-surface text-status-warning-foreground" },
};

export default function CampaignBroadcastPage() {
  const [, params] = useRoute("/marketing/campaigns/:id/broadcast");
  const id = params?.id;
  const { toast } = useToast();

  const { data: campaign } = useApiQuery<Campaign>(
    ["mkt-campaign", String(id ?? "")], id ? `/marketing/campaigns/${id}` : null,
  );
  const { data: tplData } = useApiQuery<{ data: WhatsAppTemplate[] }>(["mkt-wa-templates"], "/marketing/whatsapp-templates");
  const templates = asList<WhatsAppTemplate>(tplData).filter((t) => t.status === "approved");

  const [channel, setChannel] = useState("whatsapp");
  const [templateId, setTemplateId] = useState<string>("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [segType, setSegType] = useState("");
  const [segClassification, setSegClassification] = useState("");
  const [segSource, setSegSource] = useState("");
  const [paramMap, setParamMap] = useState<{ source: "field" | "text"; value: string }[]>([]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => String(t.id) === templateId) || null,
    [templates, templateId],
  );

  useEffect(() => {
    const n = selectedTemplate?.variableCount ?? 0;
    setParamMap((prev) => {
      const next: { source: "field" | "text"; value: string }[] = [];
      for (let i = 0; i < n; i++) next.push(prev[i] ?? { source: "field", value: "name" });
      return next;
    });
  }, [selectedTemplate]);

  const previewQs = useMemo(() => {
    const q = new URLSearchParams({ channel });
    if (segType.trim()) q.set("type", segType.trim());
    if (segClassification.trim()) q.set("classification", segClassification.trim());
    if (segSource.trim()) q.set("source", segSource.trim());
    return q.toString();
  }, [channel, segType, segClassification, segSource]);

  const { data: preview, isFetching: previewLoading } = useApiQuery<{ count: number }>(
    ["mkt-audience", previewQs], `/marketing/audience/preview?${previewQs}`,
  );
  const audienceCount = preview?.count ?? 0;

  const recipientsQuery = useApiQuery<{ data: Recipient[] }>(
    ["mkt-recipients", String(id ?? "")], id ? `/marketing/campaigns/${id}/recipients?page=1&limit=20` : null,
  );
  const recipients = asList<Recipient>(recipientsQuery.data);

  const sendMut = useApiMutation<{ queued: number; total: number }, any>(
    `/marketing/campaigns/${id}/send`, "POST", [["mkt-recipients", String(id ?? "")]],
  );

  const canSend = (() => {
    if (audienceCount <= 0 || sendMut.isPending) return false;
    if (channel === "whatsapp") return !!selectedTemplate;
    return !!body.trim() && (channel !== "email" || !!subject.trim());
  })();

  const handleSend = async () => {
    const payload: any = {
      channel,
      segment: {
        ...(segType.trim() ? { type: segType.trim() } : {}),
        ...(segClassification.trim() ? { classification: segClassification.trim() } : {}),
        ...(segSource.trim() ? { source: segSource.trim() } : {}),
      },
    };
    if (channel === "whatsapp") {
      payload.templateId = Number(templateId);
      payload.language = selectedTemplate?.language;
      payload.paramMapping = paramMap.map((p) => ({ source: p.source, value: p.value }));
    } else {
      payload.body = body.trim();
      if (channel === "email") payload.subject = subject.trim();
    }
    try {
      const res = await sendMut.mutateAsync(payload);
      toast({
        title: "تمت جدولة الإرسال الجماعي",
        description: `تمت إضافة ${res.queued} مستلم للطابور من أصل ${res.total}`,
      });
      recipientsQuery.refetch();
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر بدء الإرسال", description: err?.fix ?? err?.message });
    }
  };

  const columns: DataTableColumn<Recipient>[] = [
    { key: "recipientName", header: "المستلم", render: (r) => <span className="font-medium">{r.recipientName || "-"}</span> },
    { key: "recipient", header: "وسيلة التواصل", render: (r) => <span className="text-muted-foreground" dir="ltr">{r.recipient || "-"}</span> },
    { key: "status", header: "الحالة", render: (r) => { const s = RECIPIENT_STATUS[r.status] || { label: r.status, tone: "" }; return <Badge className={s.tone}>{s.label}</Badge>; } },
    { key: "errorMessage", header: "الخطأ", render: (r) => <span className="text-xs text-status-error-foreground">{r.errorMessage || ""}</span> },
    { key: "createdAt", header: "التاريخ", render: (r) => formatDateAr(r.createdAt) },
  ];

  return (
    <PageShell
      title={`الإرسال الجماعي — ${campaign?.name ?? "حملة"}`}
      subtitle="إرسال رسائل جماعية لجمهور مستهدف عبر واتساب أو البريد أو الرسائل النصية"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { href: "/marketing", label: "التسويق" },
        { label: "الإرسال الجماعي" },
      ]}
      actions={<Link href="/marketing"><Button variant="outline">رجوع للحملات</Button></Link>}
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">القناة والمحتوى</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <FormFieldWrapper label="قناة الإرسال">
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormFieldWrapper>

              {channel === "whatsapp" ? (
                <>
                  <FormFieldWrapper label="القالب المعتمد" required error={templates.length === 0 ? "لا توجد قوالب معتمدة — أنشئ قالباً واعتمده أولاً" : undefined}>
                    <Select value={templateId} onValueChange={setTemplateId}>
                      <SelectTrigger><SelectValue placeholder="اختر قالباً معتمداً" /></SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name} ({t.language === "en" ? "EN" : "AR"})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormFieldWrapper>
                  {selectedTemplate && (
                    <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed">
                      {selectedTemplate.bodyText}
                    </div>
                  )}
                  {paramMap.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">تعبئة المتغيّرات</p>
                      {paramMap.map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground w-12">{`{{${i + 1}}}`}</span>
                          <Select value={p.source} onValueChange={(v) => setParamMap((arr) => arr.map((x, j) => j === i ? { source: v as "field" | "text", value: v === "field" ? "name" : "" } : x))}>
                            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="field">حقل من العميل</SelectItem>
                              <SelectItem value="text">نص ثابت</SelectItem>
                            </SelectContent>
                          </Select>
                          {p.source === "field" ? (
                            <Select value={p.value} onValueChange={(v) => setParamMap((arr) => arr.map((x, j) => j === i ? { ...x, value: v } : x))}>
                              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {CLIENT_FIELDS.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input className="flex-1" value={p.value} placeholder="نص ثابت" onChange={(e) => setParamMap((arr) => arr.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {channel === "email" && (
                    <FormFieldWrapper label="الموضوع" required>
                      <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="موضوع الرسالة" />
                    </FormFieldWrapper>
                  )}
                  <TextAreaField label="نص الرسالة" required value={body} onChange={setBody} placeholder="اكتب نص الرسالة المرسلة لكل العملاء..." />
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">الجمهور المستهدف</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormFieldWrapper label="نوع العميل (اختياري)">
                <Input value={segType} onChange={(e) => setSegType(e.target.value)} placeholder="مثال: company" />
              </FormFieldWrapper>
              <FormFieldWrapper label="التصنيف (اختياري)">
                <Input value={segClassification} onChange={(e) => setSegClassification(e.target.value)} placeholder="مثال: vip" />
              </FormFieldWrapper>
              <FormFieldWrapper label="المصدر (اختياري)">
                <Input value={segSource} onChange={(e) => setSegSource(e.target.value)} placeholder="مثال: website" />
              </FormFieldWrapper>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="sticky top-4">
            <CardHeader><CardTitle className="text-base">ملخّص الإرسال</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg bg-status-info-surface/40 px-4 py-3">
                <Users className="h-5 w-5 text-status-info-foreground" />
                <div>
                  <p className="text-2xl font-bold text-status-info-foreground">{previewLoading ? "…" : audienceCount}</p>
                  <p className="text-xs text-muted-foreground">عدد المستلمين المطابقين للفلاتر</p>
                </div>
              </div>
              <Button className="w-full" onClick={handleSend} disabled={!canSend} rateLimitAware>
                <Send className="h-4 w-4 me-1.5" />
                {sendMut.isPending ? "جاري الجدولة..." : "بدء الإرسال الجماعي"}
              </Button>
              {audienceCount <= 0 && <p className="text-xs text-muted-foreground text-center">لا يوجد مستلمون مطابقون — عدّل الفلاتر</p>}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">سجل المستلمين</CardTitle></CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={recipients}
            isLoading={recipientsQuery.isLoading}
            isError={recipientsQuery.isError}
            error={recipientsQuery.error as Error | null}
            onRetry={() => recipientsQuery.refetch()}
            emptyMessage="لم يتم إرسال أي رسائل جماعية بعد"
            emptyIcon={<Send className="h-6 w-6 text-slate-400" />}
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
