import { useState } from "react";
import { useApiQuery } from "@/lib/api";
import { LoadingSpinner, ErrorState } from "@/components/shared/loading-error-states";
import {
  PageShell,
  DataTable,
  type DataTableColumn,
} from "@workspace/ui-core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/formatters";
import { Fingerprint, Globe, User, Calendar, Shield, RefreshCw } from "lucide-react";

interface SignatureLog {
  id: number;
  userId: number | null;
  userName: string | null;
  documentId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  signatureRef: string;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  userAgent: string | null;
  otpRef: number | null;
  createdAt: string;
}

export default function DigitalSignatureLogsPage() {
  const [entityType, setEntityType] = useState<string>("");
  const [entityId, setEntityId] = useState<string>("");

  const qs: string[] = [];
  if (entityType) qs.push(`entityType=${encodeURIComponent(entityType)}`);
  if (entityId)   qs.push(`entityId=${encodeURIComponent(entityId)}`);
  const url = `/digital-signature/logs${qs.length ? "?" + qs.join("&") : ""}`;

  const { data, isLoading, isError, refetch, isFetching } = useApiQuery<{ data: SignatureLog[] }>(
    ["digital-signature-logs", entityType, entityId],
    url,
  );

  if (isLoading) return <LoadingSpinner />;
  if (isError) return <ErrorState />;

  const rows = data?.data ?? [];

  const uniqueUsers = new Set(rows.map((r) => r.userId).filter(Boolean)).size;
  const uniqueIPs = new Set(rows.map((r) => r.ipAddress).filter(Boolean)).size;
  const uniqueEntities = new Set(rows.map((r) => `${r.entityType}#${r.entityId}`)).size;

  const cols: DataTableColumn<SignatureLog>[] = [
    {
      key: "createdAt",
      header: "الوقت",
      render: (l) => (
        <span className="text-xs font-mono whitespace-nowrap">
          {new Date(l.createdAt).toLocaleString("ar-SA")}
        </span>
      ),
    },
    {
      key: "userName",
      header: "المستخدم",
      render: (l) => (
        <div className="flex items-center gap-1.5">
          <User className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs">{l.userName ?? `#${l.userId ?? "?"}`}</span>
        </div>
      ),
    },
    {
      key: "entity",
      header: "الكيان",
      render: (l) => (
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">{l.entityType}</Badge>
          <span className="font-mono text-[10px] text-muted-foreground">#{l.entityId}</span>
        </div>
      ),
    },
    {
      key: "action",
      header: "الإجراء",
      render: (l) => <Badge className="bg-purple-100 text-purple-800 text-[10px]">{l.action}</Badge>,
    },
    {
      key: "signatureRef",
      header: "مرجع التوقيع",
      render: (l) => <span className="font-mono text-[10px]">{l.signatureRef}</span>,
    },
    {
      key: "ipAddress",
      header: "IP",
      render: (l) => l.ipAddress
        ? (
          <span className="font-mono text-[10px] inline-flex items-center gap-1">
            <Globe className="h-2.5 w-2.5 text-muted-foreground" />
            {l.ipAddress}
          </span>
        )
        : <span className="text-muted-foreground italic text-xs">—</span>,
    },
    {
      key: "deviceFingerprint",
      header: "البصمة الجهازية",
      render: (l) => l.deviceFingerprint
        ? (
          <span className="font-mono text-[10px] text-muted-foreground" title={l.deviceFingerprint}>
            {l.deviceFingerprint.slice(0, 12)}…
          </span>
        )
        : <span className="text-muted-foreground italic">—</span>,
    },
  ];

  return (
    <PageShell
      title="سجل التوقيعات الرقمية"
      subtitle="digital_signature_logs — كل عملية توقيع OTP تمت في النظام، مع IP والبصمة الجهازية للتدقيق الجنائي"
      breadcrumbs={[
        { href: "/admin", label: "الإدارة" },
        { label: "التوقيعات الرقمية" },
      ]}
      actions={
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 me-1 ${isFetching ? "animate-spin" : ""}`} />
          تحديث
        </Button>
      }
    >
      <Card className="mb-4 border-status-info-surface bg-status-info-surface/30">
        <CardContent className="p-4 text-sm">
          <p className="font-semibold mb-1 flex items-center gap-2">
            <Shield className="h-4 w-4" /> لماذا هذا السجل؟
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            كل إجراء مهم في النظام (اعتماد عقد، صرف، إقفال فترة، ...) ممكن يطلب
            OTP عبر <code className="bg-muted px-1 rounded">POST /digital-signature/request-otp</code> ثم
            تحقق عبر <code className="bg-muted px-1 rounded">POST /verify</code>. كل نجاح يحفظ
            هنا مع <strong>signatureRef</strong> + <strong>IP</strong> + <strong>device
            fingerprint</strong> — للمراجع الخارجي والتحقيق الجنائي.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Fingerprint className="h-3 w-3" /> توقيعات
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(rows.length)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <User className="h-3 w-3" /> مستخدمون مختلفون
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(uniqueUsers)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Globe className="h-3 w-3" /> IPs مختلفة
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(uniqueIPs)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <Calendar className="h-3 w-3" /> كيانات
            </p>
            <p className="text-lg font-bold font-mono">{formatNumber(uniqueEntities)}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-3">
        <CardContent className="p-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">نوع الكيان</Label>
              <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="مثال: invoice / journal" className="h-8" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">معرّف الكيان</Label>
              <Input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="ID" className="h-8" />
            </div>
            {(entityType || entityId) && (
              <Button variant="ghost" size="sm" onClick={() => { setEntityType(""); setEntityId(""); }}>
                مسح الفلاتر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">السجلات ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={cols} data={rows}
            pageSize={50}
            emptyMessage={
              entityType || entityId
                ? "لا توجد توقيعات بهذي الفلاتر"
                : "لم يُسجَّل أي توقيع رقمي بعد"
            }
          />
        </CardContent>
      </Card>
    </PageShell>
  );
}
