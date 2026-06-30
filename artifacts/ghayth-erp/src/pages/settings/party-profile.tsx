// الملف الموحّد (360°) — يعرض هوية طرف واحدة (parties، هجرة 249) وكل
// السجلات التي يظهر فيها نفس الشخص/الجهة عبر النظام. يحلّ شكوى «الشخص الواحد
// عبر كل الجداول»: موظف هو أيضًا سائق هو أيضًا عميل = طرف واحد، ملف واحد.
import { useParams, Link } from "wouter";
import { useApiQuery, useApiMutation } from "@/lib/api";
import { PageShell } from "@workspace/ui-core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GuardedButton } from "@/components/shared/permission-gate";
import { useToast } from "@/hooks/use-toast";
import {
  User, Building2, Phone, Mail, IdCard, ArrowLeft, Link2, Briefcase,
} from "lucide-react";

interface Party360 {
  party: {
    id: number;
    companyId: number;
    kind: string;
    displayName: string;
    nationalId: string | null;
    phone: string | null;
    email: string | null;
  };
  links: Array<{ entityTable: string; entityId: number; role: string; displayName?: string | null }>;
}

// role → (Arabic label, deep-link to that entity's detail page). Roles map 1:1
// to the PartyRole union in lib/partyService.ts.
const ROLE_META: Record<string, { label: string; href?: (id: number) => string }> = {
  employee: { label: "موظف", href: (id) => `/employees/${id}` },
  customer: { label: "عميل", href: (id) => `/clients/${id}` },
  supplier: { label: "مورد", href: (id) => `/warehouse/suppliers/${id}` },
  agent: { label: "وكيل عمرة", href: (id) => `/umrah/agents/${id}` },
  sub_agent: { label: "وكيل فرعي", href: (id) => `/umrah/sub-agents/${id}` },
  pilgrim: { label: "معتمر", href: (id) => `/umrah/pilgrims/${id}` },
  owner: { label: "مالك عقار", href: (id) => `/properties/owners/${id}` },
  driver: { label: "سائق", href: (id) => `/fleet/drivers/${id}` },
  tenant: { label: "مستأجر", href: (id) => `/properties/tenants/${id}` },
};

export default function PartyProfile() {
  const params = useParams();
  const id = params.id;
  const { data, isLoading, error, refetch } = useApiQuery<Party360>(
    ["party-360", String(id ?? "")],
    id ? `/parties/${id}/360` : null,
  );
  const { toast } = useToast();

  // Operator-triggered backfill: links the EXISTING (pre-wiring) entity rows
  // into the registry, so the registry covers historical data too — not only
  // entities created after the create-path wiring. Idempotent (fills gaps only).
  const backfill = useApiMutation<{ totals: { scanned: number; linked: number } }>(
    "/parties/backfill",
    "POST",
    [["party-360", String(id ?? "")]],
    {
      onSuccess: (res) => {
        toast({
          title: "اكتملت تعبئة السجل الموحّد",
          description: `رُبط ${res?.totals?.linked ?? 0} سجلًا جديدًا (مسح ${res?.totals?.scanned ?? 0}).`,
        });
        refetch();
      },
      onError: () => toast({ title: "تعذّرت تعبئة السجل", variant: "destructive" }),
    },
  );

  const party = data?.party;
  const isOrg = party?.kind === "organization";

  return (
    <PageShell
      title="الملف الموحّد (360°)"
      subtitle="هوية واحدة عبر كل سجلات النظام — نفس الشخص/الجهة أينما ظهر"
      actions={
        <GuardedButton
          perm="settings:update"
          size="sm"
          variant="outline"
          onClick={() => backfill.mutate({})}
          disabled={backfill.isPending}
          deniedTooltip="يتطلب صلاحية إعدادات"
        >
          {backfill.isPending ? "جاري التعبئة…" : "تعبئة السجل للبيانات السابقة"}
        </GuardedButton>
      }
    >
      {isLoading && (
        <div className="text-sm text-muted-foreground">جاري التحميل…</div>
      )}
      {error && !isLoading && (
        <div className="text-sm text-status-error-foreground">
          تعذّر تحميل الملف الموحّد — تأكد من المعرّف أو الصلاحية.
        </div>
      )}
      {data && party && (
        <div className="space-y-4">
          {/* ── هوية الطرف ── */}
          <Card className="border-indigo-200 bg-indigo-50/40">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-indigo-100">
                {isOrg ? (
                  <Building2 className="h-5 w-5 text-indigo-600" />
                ) : (
                  <User className="h-5 w-5 text-indigo-600" />
                )}
                <span className="font-semibold text-base">{party.displayName}</span>
                <Badge variant="outline" className="text-xs">
                  {isOrg ? "جهة" : "شخص"}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <InfoCell icon={IdCard} label="رقم الهوية / السجل" value={party.nationalId || "—"} />
                <InfoCell icon={Phone} label="الهاتف" value={party.phone || "—"} ltr />
                <InfoCell icon={Mail} label="البريد" value={party.email || "—"} ltr />
              </div>
            </CardContent>
          </Card>

          {/* ── مسجَّل في النظام كـ ── */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span>مسجَّل في النظام كـ ({data.links.length})</span>
              </div>
              {data.links.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  لا توجد سجلات مرتبطة بهذا الطرف بعد.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.links.map((l) => {
                    const meta = ROLE_META[l.role] ?? { label: l.role };
                    const chip = (
                      <span className="inline-flex items-center gap-1.5 rounded border border-border bg-white px-2.5 py-1.5 text-sm">
                        <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="font-medium">{l.displayName || `#${l.entityId}`}</span>
                        <span className="text-xs text-muted-foreground">({meta.label})</span>
                        {meta.href && <ArrowLeft className="h-3 w-3 text-indigo-500" />}
                      </span>
                    );
                    return meta.href ? (
                      <Link
                        key={`${l.entityTable}-${l.entityId}`}
                        href={meta.href(l.entityId)}
                        className="hover:opacity-80"
                      >
                        {chip}
                      </Link>
                    ) : (
                      <span key={`${l.entityTable}-${l.entityId}`}>{chip}</span>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

function InfoCell({
  icon: Icon,
  label,
  value,
  ltr,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <div className="bg-white rounded p-2 border border-border">
      <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
        <Icon className="h-3 w-3" />
        <span>{label}</span>
      </p>
      <p className="text-sm font-semibold text-gray-800" dir={ltr ? "ltr" : undefined}>
        {value}
      </p>
    </div>
  );
}
