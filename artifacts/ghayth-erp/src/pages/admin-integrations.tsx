import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  PageShell,
  FormShell,
  FormTextField,
  FormTextareaField,
  FormSelectField,
  FormGrid,
  PageStatusBadge,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { useApiQuery, useApiMutation, asList } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { GuardedButton } from "@/components/shared/permission-gate";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  Plug, Mail, MessageSquare, Webhook, Phone, Plus, X, Play,
  RefreshCw, AlertCircle, CheckCircle, Clock, Settings, Github,
} from "lucide-react";

const CHANNEL_LABELS: Record<string, string> = {
  email: "بريد إلكتروني",
  sms: "رسائل نصية",
  whatsapp: "واتساب",
  webhook: "ويب هوك",
  github: "GitHub",
};

const CHANNEL_ICONS: Record<string, any> = {
  email: Mail,
  sms: Phone,
  whatsapp: MessageSquare,
  webhook: Webhook,
  github: Github,
};

// Zod schema enforces JSON validity BEFORE submit (the old flow only
// caught syntax errors with a try/catch around JSON.parse — and only
// after the user had clicked the button). `z.string().refine()` runs
// at validation time so the operator sees the error inline next to
// the textarea.
// github uses the simple token/repo fields below — a non-technical operator
// never types JSON — while every other type keeps the raw `config` JSON. The
// superRefine enforces the right requirement per type: github → token present,
// others → valid JSON.
const integrationFormSchema = z
  .object({
    name: z.string().trim().min(1, "الاسم مطلوب"),
    type: z.enum(["email", "sms", "whatsapp", "webhook", "github"]),
    config: z.string().optional(),
    githubToken: z.string().optional(),
    githubRepo: z.string().optional(),
    status: z.enum(["active", "inactive", "error"]),
  })
  .superRefine((val, ctx) => {
    if (val.type === "github") {
      if (!val.githubToken || !val.githubToken.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["githubToken"], message: "التوكن مطلوب" });
      }
    } else {
      try {
        JSON.parse(val.config ?? "");
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["config"], message: "صيغة JSON غير صالحة" });
      }
    }
  });
type IntegrationForm = z.infer<typeof integrationFormSchema>;
const defaultIntegrationForm: IntegrationForm = {
  name: "",
  type: "email",
  config: "{}",
  githubToken: "",
  githubRepo: "barhom64/ghayth-erp",
  status: "inactive",
};

// Config fields that adapt to the selected type. github → a single masked
// «رمز الوصول» field + a prefilled repo, so a non-technical owner just pastes
// the token; all other types keep the JSON config textarea unchanged.
function IntegrationConfigFields() {
  const { control } = useFormContext<IntegrationForm>();
  const type = useWatch({ control, name: "type" });
  if (type === "github") {
    return (
      <>
        <FormTextField
          name="githubToken"
          label="رمز الوصول (Token)"
          placeholder="ghp_..."
          type="password"
          autoComplete="off"
          required
          className="md:col-span-2"
        />
        <FormTextField
          name="githubRepo"
          label="المستودع"
          placeholder="barhom64/ghayth-erp"
          className="md:col-span-2"
        />
      </>
    );
  }
  return (
    <FormTextareaField
      name="config"
      label="الإعدادات (بصيغة JSON)"
      description="JSON صالح. مثال البريد: host, port, user, password, from"
      rows={5}
      className="md:col-span-2"
    />
  );
}

function IntegrationsList() {
  const { data: intResp, isLoading, isError } = useApiQuery<any>(["admin-integrations"], "/admin/integrations");
  const [showForm, setShowForm] = useState(false);
  const { toast } = useToast();
  const integrations = asList(intResp);

  const createMut = useApiMutation<any, Record<string, any>>(
    "/admin/integrations",
    "POST",
    [["admin-integrations"]],
    { successMessage: "تم إنشاء التكامل" },
  );
  const toggleMut = useApiMutation<any, { id: number; status: string }>(
    (body) => `/admin/integrations/${body.id}`,
    "PATCH",
    [["admin-integrations"]]
  );
  const testMut = useApiMutation<any, { id: number }>(
    (body) => `/admin/integrations/${body.id}/test`,
    "POST",
    [["admin-integrations"]],
    {
      successMessage: false,
      onSuccess: (result: any) => {
        if (result?.success) toast({ title: "نجح الاختبار" });
        else toast({ variant: "destructive", title: "فشل الاختبار", description: result?.error });
      },
    }
  );
  const deleteMut = useApiMutation<any, { id: number }>(
    (body) => `/admin/integrations/${body.id}`,
    "DELETE",
    [["admin-integrations"]],
    { successMessage: "تم الحذف" }
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const handleToggleStatus = (id: number, currentStatus: string) => {
    toggleMut.mutate({ id, status: currentStatus === "active" ? "inactive" : "active" });
  };
  const handleTest = (id: number) => testMut.mutate({ id });
  const handleDelete = (id: number) => deleteMut.mutate({ id });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed">
        <span className="font-medium text-foreground">ما وظيفة هذه الصفحة؟</span>{" "}
        الربط التقني الخارجي: استقبال رسائل <span className="font-medium">واتساب</span> الواردة (ربط رقم المعرّف بالشركة)،
        و<span className="font-medium">الويب هوك</span> و<span className="font-medium">GitHub</span>، بالإضافة إلى بدائل تقنية للبريد والرسائل النصية.
        <br />
        لتشغيل/إيقاف القنوات لكل شركة استخدم «<span className="font-medium">قنوات الاتصال</span>» في الإعدادات،
        ولمفاتيح المزوّدين (SMTP، تويليو، السنترال، SIEM) استخدم «<span className="font-medium">إعدادات المزوّدات الخارجية</span>».
      </div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">التكاملات المُعدّة</h3>
        <GuardedButton perm="admin:create" size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <><X className="h-4 w-4 me-1" />إلغاء</> : <><Plus className="h-4 w-4 me-1" />إضافة تكامل</>}
        </GuardedButton>
      </div>
      {showForm && (
        <Card>
          <CardContent className="p-4">
            <FormShell
              schema={integrationFormSchema}
              defaultValues={defaultIntegrationForm}
              submitLabel="حفظ التكامل"
              secondaryActions={
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
              }
              onSubmit={async (values, ctx) => {
                // github → build {token, repo} from the simple fields; others →
                // parse the JSON config (the schema already validated per type).
                const config =
                  values.type === "github"
                    ? { token: (values.githubToken ?? "").trim(), repo: (values.githubRepo ?? "").trim() || "barhom64/ghayth-erp" }
                    : JSON.parse(values.config ?? "{}");
                // Send only real columns — githubToken/githubRepo are UI-only helpers.
                await createMut.mutateAsync({
                  name: values.name,
                  type: values.type,
                  status: values.status,
                  config,
                });
                ctx.reset();
                setShowForm(false);
              }}
            >
              <FormGrid cols={2}>
                <FormTextField name="name" label="الاسم" placeholder="اسم التكامل" required />
                <FormSelectField
                  name="type"
                  label="النوع"
                  options={[
                    { value: "email", label: "بريد إلكتروني" },
                    { value: "sms", label: "رسائل نصية" },
                    { value: "whatsapp", label: "واتساب" },
                    { value: "webhook", label: "خطاف استدعاء" },
                    { value: "github", label: "GitHub" },
                  ]}
                />
                <IntegrationConfigFields />
              </FormGrid>
            </FormShell>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((intg: any) => {
          const Icon = CHANNEL_ICONS[intg.type] || Plug;
          return (
            <Card key={intg.id} className={cn("border", intg.status === "active" ? "border-status-success-surface" : intg.status === "error" ? "border-status-error-surface" : "border-border")}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center",
                      intg.status === "active" ? "bg-status-success-surface" : intg.status === "error" ? "bg-status-error-surface" : "bg-surface-subtle"
                    )}>
                      <Icon className={cn("w-5 h-5",
                        intg.status === "active" ? "text-status-success-foreground" : intg.status === "error" ? "text-status-error-foreground" : "text-muted-foreground"
                      )} />
                    </div>
                    <div>
                      <h4 className="font-semibold">{intg.name}</h4>
                      <p className="text-xs text-muted-foreground">{CHANNEL_LABELS[intg.type] || intg.type}</p>
                    </div>
                  </div>
                  <PageStatusBadge status={intg.status} />
                </div>

                <div className="text-xs text-muted-foreground space-y-1 mb-3">
                  {intg.lastSuccessAt && <p className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-status-success" />آخر نجاح: {formatDateAr(intg.lastSuccessAt)}</p>}
                  {intg.lastFailureAt && <p className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-status-error" />آخر فشل: {formatDateAr(intg.lastFailureAt)}</p>}
                  {intg.lastError && <p className="text-status-error truncate">{intg.lastError}</p>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <GuardedButton perm="admin:create" variant="outline" size="sm" onClick={() => handleToggleStatus(intg.id, intg.status)}>
                    {intg.status === "active" ? "تعطيل" : "تفعيل"}
                  </GuardedButton>
                  <GuardedButton perm="admin:create" variant="outline" size="sm" onClick={() => handleTest(intg.id)}>
                    <Play className="h-3 w-3 me-1" />اختبار
                  </GuardedButton>
                  <GuardedButton perm="admin:create" variant="ghost" size="sm" className="text-status-error hover:text-status-error-foreground" onClick={() => handleDelete(intg.id)}>حذف</GuardedButton>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {integrations.length === 0 && !isLoading && (
          <div className="col-span-2 text-center py-12 text-muted-foreground">
            <Plug className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>لا توجد تكاملات مُعدّة</p>
            <GuardedButton perm="admin:create" variant="outline" size="sm" className="mt-3" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 me-1" />إضافة تكامل
            </GuardedButton>
          </div>
        )}
      </div>
    </div>
  );
}

function IntegrationLogs() {
  const { data: logsResp, isLoading, isError, error, refetch } = useApiQuery<any>(["admin-int-logs"], "/admin/integration-logs");
  const logs = asList(logsResp);
  const { toast } = useToast();

  const retryMut = useApiMutation<any, Record<string, never>>(
    "/admin/integration-logs/retry",
    "POST",
    [["admin-int-logs"]],
    {
      successMessage: false,
      onSuccess: (result: any) => {
        toast({ title: `تمت إعادة المحاولة: ${result?.retried ?? 0} رسالة, نجح: ${result?.succeeded ?? 0}` });
      },
    }
  );
  const handleRetry = () => retryMut.mutate({});

  const statusIcon = (status: string) => {
    switch (status) {
      case "sent": case "delivered": return <CheckCircle className="w-4 h-4 text-status-success" />;
      case "failed": return <AlertCircle className="w-4 h-4 text-status-error" />;
      case "retrying": return <RefreshCw className="w-4 h-4 text-status-warning animate-spin" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const columns: DataTableColumn<any>[] = [
    { key: "channel", header: "القناة", render: (log) => <Badge variant="outline">{CHANNEL_LABELS[log.channel] || log.channel}</Badge> },
    { key: "recipient", header: "المستلم", render: (log) => <span className="max-w-[150px] truncate inline-block">{log.recipient || "-"}</span> },
    { key: "subject", header: "الموضوع", render: (log) => <span className="max-w-[200px] truncate inline-block">{log.subject || "-"}</span> },
    {
      key: "status", header: "الحالة",
      render: (log) => (
        <div>
          <div className="flex items-center gap-1">
            {statusIcon(log.status)}
            <PageStatusBadge status={log.status} />
          </div>
          {log.errorMessage && <p className="text-xs text-status-error mt-1 truncate max-w-[200px]">{log.errorMessage}</p>}
        </div>
      ),
    },
    { key: "retryAttempt", header: "المحاولة", render: (log) => log.retryAttempt || 0 },
    { key: "createdAt", header: "التاريخ", render: (log) => <span className="text-xs">{formatDateAr(log.createdAt)}</span> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">سجل الإرسال</h3>
        <GuardedButton perm="admin:create" variant="outline" size="sm" onClick={handleRetry}>
          <RefreshCw className="h-4 w-4 me-1" />إعادة المحاولة للفاشلة
        </GuardedButton>
      </div>
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={logs}
            isLoading={isLoading}
            isError={isError}
            error={error as Error | null}
            onRetry={() => refetch()}
            emptyMessage="لا توجد سجلات إرسال"
            emptyIcon={<Mail className="h-6 w-6 text-slate-400" />}
            noToolbar
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminIntegrations() {
  return (
    <PageShell
      title="مركز التكاملات"
      breadcrumbs={[
        { href: "/dashboard", label: "لوحة التحكم" },
        { label: "مركز التكاملات" },
      ]}
      subtitle="الربط التقني الخارجي: استقبال واتساب، الويب هوك، GitHub، وبدائل البريد/الرسائل"
    >
      <Tabs defaultValue="integrations" dir="rtl">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="integrations">التكاملات</TabsTrigger>
          <TabsTrigger value="logs">سجل الإرسال</TabsTrigger>
        </TabsList>
        <TabsContent value="integrations"><IntegrationsList /></TabsContent>
        <TabsContent value="logs"><IntegrationLogs /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
