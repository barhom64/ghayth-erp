/**
 * PDPL (Saudi Personal Data Protection Law) compliance dashboard.
 *
 * Wires the five PDPL endpoints exposed by the server:
 *   GET  /pdpl/privacy-notice               — current published privacy notice (versioned)
 *   GET  /pdpl/retention-policies           — list of data-retention policies and their cron schedule
 *   GET  /pdpl/processing-log               — audit log of personal-data processing events (Article 18)
 *   GET  /pdpl/employee-data-export/:id     — DSAR export for a single employee (download)
 *   POST /pdpl/data-request                 — record a subject access / deletion request (Article 4)
 *
 * Designed for the DPO (data protection officer) role — surfaces what
 * the platform is doing with personal data and lets them respond to
 * data-subject requests from the same screen.
 */

import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { useApiQuery, apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GuardedButton } from "@/components/shared/permission-gate";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { formatDateAr } from "@/lib/formatters";
import { Shield, FileText, History, UserCheck, Mail } from "lucide-react";

export default function AdminPdplPage() {
  const { toast } = useToast();

  const privacyQ = useApiQuery<any>(["pdpl-privacy-notice"], "/pdpl/privacy-notice");
  const retentionQ = useApiQuery<any>(["pdpl-retention-policies"], "/pdpl/retention-policies");
  const processingQ = useApiQuery<any>(["pdpl-processing-log"], "/pdpl/processing-log?limit=50");

  const [exportEmpId, setExportEmpId] = useState("");
  const exportQ = useApiQuery<any>(
    ["pdpl-employee-data-export", exportEmpId],
    exportEmpId ? `/pdpl/employee-data-export/${exportEmpId}` : null,
    { enabled: !!exportEmpId },
  );

  // Schema enums match the PDPL article numbers — see
  // artifacts/api-server/src/routes/pdpl.ts:39 for the canonical list.
  const [reqKind, setReqKind] = useState<"access" | "rectification" | "erasure" | "portability" | "objection">("access");
  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqNotes, setReqNotes] = useState("");
  const submitDataRequest = async () => {
    if (!reqName.trim() && !reqEmail.trim()) {
      toast({ variant: "destructive", title: "أضف اسم أو بريد مقدّم الطلب" });
      return;
    }
    try {
      await apiFetch("/pdpl/data-request", {
        method: "POST",
        body: JSON.stringify({
          requestType: reqKind,
          requesterName: reqName || undefined,
          requesterEmail: reqEmail || undefined,
          notes: reqNotes.trim() || undefined,
        }),
      });
      toast({ title: "تم تسجيل الطلب" });
      setReqName(""); setReqEmail(""); setReqNotes("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "تعذّر التسجيل", description: err?.message || "خطأ" });
    }
  };

  const retentionPolicies: any[] = retentionQ.data?.data ?? retentionQ.data?.policies ?? [];
  const processingLog: any[] = processingQ.data?.data ?? processingQ.data?.events ?? [];

  return (
    <PageShell
      title="حماية البيانات الشخصية (PDPL)"
      subtitle="لوحة الإشراف على الامتثال — إشعار الخصوصية، سياسات الاحتفاظ، سجل المعالجة، طلبات أصحاب البيانات"
      breadcrumbs={[{ label: "الإدارة" }, { label: "حماية البيانات" }]}
    >
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-status-info" />
              إشعار الخصوصية المنشور
            </CardTitle>
          </CardHeader>
          <CardContent>
            {privacyQ.isLoading ? <LoadingSpinner /> : privacyQ.isError ? <ErrorState /> : (
              <div className="text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">v{privacyQ.data?.version ?? "—"}</Badge>
                  {privacyQ.data?.effectiveDate && (
                    <span className="text-xs text-muted-foreground">سارٍ منذ {formatDateAr(privacyQ.data.effectiveDate)}</span>
                  )}
                </div>
                {privacyQ.data?.summary && (
                  <p className="text-xs text-muted-foreground">{privacyQ.data.summary}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-status-info" />
              سياسات الاحتفاظ ({retentionPolicies.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-xs">
              {retentionPolicies.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">لا توجد سياسات</p>
              ) : (
                retentionPolicies.slice(0, 30).map((p: any, i: number) => (
                  <div key={p.id ?? i} className="px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xs">{p.dataCategory ?? p.entity ?? "—"}</p>
                      <p className="text-muted-foreground text-[10px]">{p.legalBasis ?? p.basis ?? ""}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {p.retentionDays ?? p.days ?? "—"} يوم
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-status-info" />
              سجل معالجة البيانات الشخصية ({processingLog.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {processingQ.isLoading ? <LoadingSpinner /> : processingQ.isError ? <ErrorState /> : (
              <div className="divide-y text-xs max-h-64 overflow-y-auto">
                {processingLog.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">لا توجد أحداث مسجلة</p>
                ) : (
                  processingLog.slice(0, 50).map((e: any, i: number) => (
                    <div key={e.id ?? i} className="px-3 py-2 flex items-center justify-between">
                      <div>
                        <p className="font-mono text-[10px]">{e.action ?? "—"}</p>
                        <p className="text-muted-foreground text-[10px]">{e.entity ?? "—"} #{e.entityId ?? "?"}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{e.createdAt ? formatDateAr(e.createdAt) : ""}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-status-success" />
                تصدير بيانات موظف (DSAR)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                ينشئ تقريراً كاملاً بكل بيانات الموظف المخزّنة (المادة 11 من نظام حماية البيانات).
              </p>
              <input
                value={exportEmpId}
                onChange={(e) => setExportEmpId(e.target.value)}
                placeholder="رقم الموظف"
                dir="ltr"
                className="w-full h-8 px-2 text-xs border rounded"
              />
              {exportEmpId && exportQ.data && (
                <div className="text-xs p-2 bg-surface-subtle rounded max-h-32 overflow-y-auto">
                  <p className="font-semibold mb-1">تقرير #{exportEmpId}</p>
                  <pre className="text-[10px]">
                    {JSON.stringify(exportQ.data, null, 2).slice(0, 500)}
                    {JSON.stringify(exportQ.data, null, 2).length > 500 && "…"}
                  </pre>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(exportQ.data, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `dsar-employee-${exportEmpId}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    تنزيل JSON
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Mail className="h-4 w-4 text-status-warning" />
                تسجيل طلب صاحب بيانات
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                يُسجّل الطلب لمتابعته خلال المهلة النظامية (30 يوماً).
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">نوع الطلب</label>
                  <select
                    value={reqKind}
                    onChange={(e) => setReqKind(e.target.value as typeof reqKind)}
                    className="w-full h-7 text-xs border rounded px-2 bg-white"
                  >
                    <option value="access">اطلاع على البيانات</option>
                    <option value="rectification">تصحيح</option>
                    <option value="erasure">حذف</option>
                    <option value="portability">نقل</option>
                    <option value="objection">اعتراض</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">اسم مقدّم الطلب</label>
                  <input
                    value={reqName}
                    onChange={(e) => setReqName(e.target.value)}
                    className="w-full h-7 px-2 text-xs border rounded"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">بريد مقدّم الطلب</label>
                  <input
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    className="w-full h-7 px-2 text-xs border rounded"
                    dir="ltr"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">ملاحظات / تفاصيل الطلب</label>
                  <textarea
                    value={reqNotes}
                    onChange={(e) => setReqNotes(e.target.value)}
                    className="w-full h-16 px-2 py-1 text-xs border rounded"
                  />
                </div>
              </div>
              <GuardedButton perm="admin.pdpl:create" size="sm" rateLimitAware onClick={submitDataRequest}>
                تسجيل الطلب
              </GuardedButton>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
