/**
 * Saudi HR compliance hub — wires the 6 stubs added in PR #1377:
 *
 *   GET   /hr/saudi/banks                       — Saudi bank catalog
 *   GET   /hr/saudi/wps/runs                    — historical WPS runs
 *                                                 (sourced from payroll_runs)
 *   GET   /hr/saudi/wps/runs/:id                — run + per-employee lines
 *   GET   /hr/saudi/mudad/settlements           — Mudad settlement log
 *   GET   /hr/saudi/wps/credentials/:bankCode   — config for a bank
 *   PUT   /hr/saudi/wps/credentials/:bankCode   — save bank API config
 *
 * Intended for the payroll + treasury teams to inspect WPS history and
 * keep bank-API credentials current.
 */

import { useState } from "react";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useApiQuery, apiFetch } from "@/lib/api";
import { STATUSES } from "@/lib/constants";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDateAr } from "@/lib/formatters";
import { Banknote, FileCheck, Receipt, Lock } from "lucide-react";

import { HrTabsNav } from "@/components/shared/hr-tabs-nav";
import { PrintButton } from "@/components/shared/print-button";
interface SaudiBank { code: string; name: string; swift: string }

export default function HrSaudiCompliancePage() {
  const { toast } = useToast();
  const [selectedBank, setSelectedBank] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const banksQ = useApiQuery<{ data: SaudiBank[] }>(
    ["hr-saudi-banks"],
    "/hr/saudi/banks",
  );
  const banks: SaudiBank[] = banksQ.data?.data ?? [];

  const runsQ = useApiQuery<{ data: any[] }>(
    ["hr-saudi-wps-runs"],
    "/hr/saudi/wps/runs",
  );
  const runs: any[] = runsQ.data?.data ?? [];

  const runDetailQ = useApiQuery<any>(
    ["hr-saudi-wps-run", String(selectedRunId)],
    selectedRunId ? `/hr/saudi/wps/runs/${selectedRunId}` : null,
    !!selectedRunId,
  );

  const mudadQ = useApiQuery<{ data: any[]; note?: string }>(
    ["hr-saudi-mudad"],
    "/hr/saudi/mudad/settlements",
  );
  const mudad: any[] = mudadQ.data?.data ?? [];

  const credentialsQ = useApiQuery<any>(
    ["hr-saudi-wps-credentials", selectedBank ?? ""],
    selectedBank ? `/hr/saudi/wps/credentials/${selectedBank}` : null,
    !!selectedBank,
  );

  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiSecretDraft, setApiSecretDraft] = useState("");

  const handleSaveCredentials = async () => {
    if (!selectedBank) return;
    try {
      await apiFetch(`/hr/saudi/wps/credentials/${selectedBank}`, {
        method: "PUT",
        body: JSON.stringify({ apiKey: apiKeyDraft, apiSecret: apiSecretDraft }),
      });
      toast({ title: "تم حفظ إعدادات البنك" });
      credentialsQ.refetch();
      setApiKeyDraft("");
      setApiSecretDraft("");
    } catch (err: any) {
      toast({ variant: "destructive", title: "فشل الحفظ", description: err?.message });
    }
  };

  return (
    <PageShell
      title="الامتثال السعودي — WPS / مدد"
      subtitle="بنوك سعودية، تواريخ WPS، تسويات مدد، إعدادات APIs البنوك"
      breadcrumbs={[{ label: "الموارد البشرية" }, { label: "الامتثال السعودي" }]}
      actions={
        <PrintButton
          entityType="report_hr_saudi_compliance"
          entityId="list"
          size="icon"
          payload={{
            entity: { title: "WPS — السجل التاريخي", total: runs.length },
            items: runs.map((r: any) => ({
              "الرقم": r.id,
              "الفترة": r.period || "—",
              "البنك": r.bankName || r.bankCode || "—",
              "عدد الموظفين": r.employeeCount ?? "—",
              "الإجمالي": Number(r.totalAmount ?? 0),
              "تاريخ الإرسال": r.submittedAt || "—",
              "الحالة": r.status || "—",
            })),
          }}
        />
      }
    >
      <HrTabsNav />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* البنوك السعودية + اختيار بنك لإعداد بيانات WPS */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Banknote className="h-4 w-4 text-status-info" />
              البنوك السعودية ({banks.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {banksQ.isLoading ? <LoadingSpinner /> : banksQ.isError ? <ErrorState /> : (
              <div className="divide-y text-xs">
                {banks.map((b) => (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => setSelectedBank(b.code)}
                    className={`w-full px-3 py-2 flex items-center justify-between hover:bg-surface-subtle ${
                      selectedBank === b.code ? "bg-status-info-surface/40" : ""
                    }`}
                  >
                    <span className="text-start">
                      <span className="font-medium">{b.name}</span>
                      <span className="text-muted-foreground ms-2 font-mono text-[10px]">{b.code}</span>
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px]">{b.swift}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* إعدادات WPS لكل بنك */}
        <Card className={selectedBank ? "" : "opacity-60"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              إعدادات WPS — {selectedBank ?? "اختر بنكاً"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {!selectedBank ? (
              <p className="text-muted-foreground">اختر بنكاً من القائمة لعرض إعداداته.</p>
            ) : credentialsQ.isLoading ? <LoadingSpinner /> : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">الحالة:</span>
                  <Badge variant={credentialsQ.data?.configured ? "default" : "outline"}>
                    {credentialsQ.data?.configured ? "مُعَدّ" : "غير مُعَدّ"}
                  </Badge>
                  {credentialsQ.data?.lastTestedAt && (
                    <span className="text-muted-foreground ms-2">
                      آخر اختبار: {formatDateAr(credentialsQ.data.lastTestedAt)}
                    </span>
                  )}
                </div>
                {credentialsQ.data?.message && (
                  <p className="text-muted-foreground">{credentialsQ.data.message}</p>
                )}
                <div className="space-y-2 pt-2 border-t">
                  <div>
                    <Label className="text-[10px]">مفتاح API</Label>
                    <Input
                      value={apiKeyDraft}
                      onChange={(e) => setApiKeyDraft(e.target.value)}
                      dir="ltr"
                      className="h-7 text-xs font-mono"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px]">سر API</Label>
                    <Input
                      value={apiSecretDraft}
                      onChange={(e) => setApiSecretDraft(e.target.value)}
                      dir="ltr"
                      type="password"
                      className="h-7 text-xs font-mono"
                      placeholder="••••••••"
                    />
                  </div>
                  <GuardedButton
                    perm="hr:update"
                    size="sm"
                    rateLimitAware
                    onClick={handleSaveCredentials}
                    disabled={!apiKeyDraft || !apiSecretDraft}
                  >
                    حفظ الإعدادات
                  </GuardedButton>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* تواريخ WPS */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-status-info" />
              تواريخ WPS ({runs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {runsQ.isLoading ? <LoadingSpinner /> : (
              <div className="divide-y text-xs max-h-96 overflow-y-auto">
                {runs.length === 0 ? (
                  <p className="p-3 text-muted-foreground text-center">لا توجد تواريخ.</p>
                ) : (
                  runs.map((r: any) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRunId(r.id)}
                      className={`w-full px-3 py-2 flex items-center justify-between hover:bg-surface-subtle ${
                        selectedRunId === r.id ? "bg-status-info-surface/40" : ""
                      }`}
                    >
                      <span className="text-start">
                        <span className="font-mono">{r.period}</span>
                        {r.reference && <span className="text-muted-foreground ms-2">{r.reference}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{STATUSES[r.status] ?? r.status}</Badge>
                        <span className="font-mono">{formatCurrency(Number(r.totalNet || 0))}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* تفاصيل أحد التواريخ المختارة */}
        <Card className={selectedRunId ? "" : "opacity-60"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              تفاصيل التاريخ — {selectedRunId ? `#${selectedRunId}` : "اختر من القائمة"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!selectedRunId ? (
              <p className="px-3 py-2 text-muted-foreground text-xs">اختر تاريخاً لعرض البنود.</p>
            ) : runDetailQ.isLoading ? <LoadingSpinner /> : (
              <div className="divide-y text-xs max-h-96 overflow-y-auto">
                {(runDetailQ.data?.lines || []).slice(0, 50).map((l: any, i: number) => (
                  <div key={l.id ?? i} className="px-3 py-2 flex items-center justify-between">
                    <span>
                      <span className="font-medium">{l.employeeName ?? `موظف #${l.employeeId}`}</span>
                      {l.empNumber && <span className="text-muted-foreground ms-2 font-mono">#{l.empNumber}</span>}
                    </span>
                    <span className="font-mono">{formatCurrency(Number(l.net || l.amount || 0))}</span>
                  </div>
                ))}
                {(runDetailQ.data?.lines || []).length === 0 && (
                  <p className="px-3 py-2 text-muted-foreground">لا توجد بنود.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* تسويات مدد */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Receipt className="h-4 w-4 text-status-info" />
              تسويات مدد ({mudad.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {mudadQ.isLoading ? <LoadingSpinner /> : (
              <div className="divide-y text-xs">
                {mudad.length === 0 ? (
                  <p className="p-3 text-muted-foreground text-center">
                    {mudadQ.data?.note || "لم يتم تكوين تكامل مدد بعد."}
                  </p>
                ) : (
                  mudad.slice(0, 30).map((m: any, i: number) => (
                    <div key={m.id ?? i} className="px-3 py-2 flex items-center justify-between">
                      <span className="font-mono">{m.period ?? "—"}</span>
                      <span className="text-muted-foreground">
                        {m.status} · {m.totalAmount != null ? formatCurrency(Number(m.totalAmount)) : "—"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
