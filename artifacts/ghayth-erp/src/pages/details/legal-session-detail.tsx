import { useMemo } from "react";
import { useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import {
  DetailPageLayout,
  type RelatedEntity,
  EntityComments,
} from "@workspace/entity-kit";
import { GuardedButton } from "@/components/shared/permission-gate";
import { PrintButton } from "@/components/shared/print-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Gavel } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { EntityTags } from "@/components/shared/entity-tags";
import { useRegistryTabs } from "@/hooks/use-registry-tabs";

const STATUS_LABELS: Record<string, string> = {
  scheduled: "مجدولة",
  held: "عُقدت",
  postponed: "مؤجلة",
  cancelled: "ملغاة",
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  hearing: "جلسة استماع",
  trial: "محاكمة",
  mediation: "وساطة",
  arbitration: "تحكيم",
  pre_trial: "ما قبل المحاكمة",
};

function statusTone(status?: string | null) {
  if (!status) return "default" as const;
  if (status === "held") return "success" as const;
  if (status === "cancelled") return "destructive" as const;
  if (status === "postponed") return "warning" as const;
  if (status === "scheduled") return "info" as const;
  return "default" as const;
}

export default function LegalSessionDetail() {
  const [, params] = useRoute("/legal/sessions/:id");
  const id = params?.id ? Number(params.id) : null;
  const { extraTabs, hideTabs } = useRegistryTabs("legal-session", id ?? 0);

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["legal-session", String(id)],
    `/legal/sessions/${id}`,
    !!id
  );

  const session = data;

  const relatedEntities: RelatedEntity[] = useMemo(() => {
    const out: RelatedEntity[] = [];
    if (!session) return out;
    if (session.caseId) {
      out.push({
        type: "legal-case",
        id: session.caseId,
        label: session.caseTitle || session.caseReference || `قضية #${session.caseId}`,
        sublabel: "القضية المرتبطة",
        href: `/legal/cases/${session.caseId}`,
      });
    }
    return out;
  }, [session]);


  const attendeesDisplay = useMemo(() => {
    if (!session?.attendees) return null;
    if (Array.isArray(session.attendees)) return session.attendees.join("، ");
    return String(session.attendees);
  }, [session?.attendees]);

  const overview = (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Gavel className="h-4 w-4 text-muted-foreground" />
            بيانات الجلسة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {session?.caseNumber && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">مرجع القضية</p>
                <span className="text-status-neutral-foreground font-mono text-xs">{session.caseNumber}</span>
              </div>
            )}
            {session?.caseTitle && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">عنوان القضية</p>
                <span className="text-status-neutral-foreground">{session.caseTitle}</span>
              </div>
            )}
            {session?.judge && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">القاضي</p>
                <span className="text-status-neutral-foreground">{session.judge}</span>
              </div>
            )}
            {session?.sessionDate && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الجلسة</p>
                <span className="text-status-neutral-foreground">{formatDateAr(session.sessionDate)}</span>
              </div>
            )}
            {session?.sessionTime && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">وقت الجلسة</p>
                <span className="text-status-neutral-foreground">{session.sessionTime}</span>
              </div>
            )}
            {session?.location && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">مكان الانعقاد</p>
                <span className="text-status-neutral-foreground">{session.location}</span>
              </div>
            )}
            {session?.nextSessionDate && (
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الجلسة القادمة</p>
                <Badge variant="secondary">{formatDateAr(session.nextSessionDate)}</Badge>
              </div>
            )}
          </div>

          {session?.subject && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">موضوع الجلسة</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{session.subject}</p>
            </div>
          )}

          {(session?.outcome || session?.result) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">نتيجة الجلسة</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">
                {session.outcome || session.result}
              </p>
            </div>
          )}

          {attendeesDisplay && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">الحضور</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{attendeesDisplay}</p>
            </div>
          )}

          {session?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
              <p className="text-status-neutral-foreground whitespace-pre-wrap">{session.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">معلومات إضافية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {session?.createdAt && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">تاريخ الإنشاء</p>
                <span className="text-status-neutral-foreground">{formatDateAr(session.createdAt)}</span>
              </div>
            )}
            {session?.createdByName && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">أنشئ بواسطة</p>
                <span className="text-status-neutral-foreground">{session.createdByName}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {id && <EntityComments entityType="legal-session" entityId={id} />}
      {id && <EntityTags entityType="legal-session" entityId={id} />}
    </div>
  );

  return (
    <DetailPageLayout
      title={
        session?.subject
          ? `جلسة: ${session.subject}`
          : session?.caseReference
          ? `جلسة ${session.caseReference}`
          : "تفاصيل الجلسة"
      }
      subtitle={
        session?.sessionType
          ? SESSION_TYPE_LABELS[session.sessionType] || session.sessionType
          : undefined
      }
      backPath="/legal/sessions"
      refNumber={id ? `SESS-${id}` : undefined}
      status={
        session
          ? { label: STATUS_LABELS[session.status] || session.status || "-", tone: statusTone(session.status) }
          : undefined
      }
      typeLabel={
        session?.sessionType
          ? SESSION_TYPE_LABELS[session.sessionType] || session.sessionType
          : undefined
      }
      createdAt={session?.createdAt}
      updatedAt={session?.updatedAt}
      createdByName={session?.createdByName}
      relatedEntities={relatedEntities}
      entityType="legal-session"
      entityId={id ?? 0}
      overview={overview}
      isLoading={isLoading}
      error={error}
      onRetry={refetch}
      extraTabs={extraTabs}
      hideTabs={hideTabs}
      actions={
        <>
          {session && (
            <PrintButton
              entityType="legal_session"
              entityId={id ?? 0}
             />
          )}
        </>
      }
    />
  );
}
