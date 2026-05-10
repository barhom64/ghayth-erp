import { useMemo } from "react";
import { useLocation, useRoute } from "wouter";
import { useApiQuery } from "@/lib/api";
import { DetailPageLayout, type RelatedEntity } from "@/components/shared/detail-page-layout";
import { GuardedButton } from "@/components/shared/permission-gate";
import { EntityPrintButton, type PrintSection } from "@/components/shared/entity-print";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Edit, Gavel } from "lucide-react";
import { formatDateAr } from "@/lib/formatters";
import { EntityComments } from "@/components/shared/entity-comments";
import { EntityTags } from "@/components/shared/entity-tags";

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
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/legal/sessions/:id");
  const id = params?.id ? Number(params.id) : null;

  const { data, isLoading, error, refetch } = useApiQuery<any>(
    ["legal-session", String(id)],
    id ? `/legal/sessions/${id}` : null,
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

  const printSections: PrintSection[] = useMemo(() => {
    if (!session) return [];
    const sections: PrintSection[] = [
      {
        kind: "info-grid",
        items: [
          { label: "رقم الجلسة", value: `SESS-${id}` },
          ...(session.caseReference
            ? [{ label: "مرجع القضية", value: session.caseReference }]
            : []),
          ...(session.sessionType
            ? [{ label: "نوع الجلسة", value: SESSION_TYPE_LABELS[session.sessionType] || session.sessionType }]
            : []),
          ...(session.courtName
            ? [{ label: "المحكمة", value: session.courtName }]
            : []),
          ...(session.judge
            ? [{ label: "القاضي", value: session.judge }]
            : []),
          ...(session.sessionDate
            ? [{ label: "تاريخ الجلسة", value: formatDateAr(session.sessionDate) }]
            : []),
          ...(session.sessionTime
            ? [{ label: "وقت الجلسة", value: session.sessionTime }]
            : []),
          ...(session.location
            ? [{ label: "مكان الانعقاد", value: session.location }]
            : []),
          ...(session.subject
            ? [{ label: "موضوع الجلسة", value: session.subject }]
            : []),
          ...(session.nextSessionDate
            ? [{ label: "تاريخ الجلسة القادمة", value: formatDateAr(session.nextSessionDate) }]
            : []),
          { label: "الحالة", value: STATUS_LABELS[session.status] || session.status || "-" },
        ],
      },
    ];
    if (session.outcome || session.result) {
      sections.push({
        kind: "text",
        title: "نتيجة الجلسة",
        body: session.outcome || session.result,
      });
    }
    if (session.attendees) {
      sections.push({
        kind: "text",
        title: "الحضور",
        body: Array.isArray(session.attendees)
          ? session.attendees.join("، ")
          : session.attendees,
      });
    }
    if (session.notes) {
      sections.push({ kind: "text", title: "ملاحظات", body: session.notes });
    }
    sections.push({
      kind: "signature",
      parties: [
        { label: "مُعد المحضر", name: session.createdByName || "" },
        { label: "القاضي", name: session.judge || "" },
      ],
    });
    return sections;
  }, [session, id]);

  const handleEdit = () => {
    setLocation(`/legal/sessions/${id}/edit`);
  };

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
            <Gavel className="h-4 w-4 text-gray-500" />
            بيانات الجلسة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {session?.caseNumber && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">مرجع القضية</p>
                <span className="text-gray-800 font-mono text-xs">{session.caseNumber}</span>
              </div>
            )}
            {session?.caseTitle && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">عنوان القضية</p>
                <span className="text-gray-800">{session.caseTitle}</span>
              </div>
            )}
            {session?.judge && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">القاضي</p>
                <span className="text-gray-800">{session.judge}</span>
              </div>
            )}
            {session?.sessionDate && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الجلسة</p>
                <span className="text-gray-800">{formatDateAr(session.sessionDate)}</span>
              </div>
            )}
            {session?.sessionTime && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">وقت الجلسة</p>
                <span className="text-gray-800">{session.sessionTime}</span>
              </div>
            )}
            {session?.location && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">مكان الانعقاد</p>
                <span className="text-gray-800">{session.location}</span>
              </div>
            )}
            {session?.nextSessionDate && (
              <div className="col-span-2">
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الجلسة القادمة</p>
                <Badge variant="secondary">{formatDateAr(session.nextSessionDate)}</Badge>
              </div>
            )}
          </div>

          {session?.subject && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">موضوع الجلسة</p>
              <p className="text-gray-800 whitespace-pre-wrap">{session.subject}</p>
            </div>
          )}

          {(session?.outcome || session?.result) && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">نتيجة الجلسة</p>
              <p className="text-gray-800 whitespace-pre-wrap">
                {session.outcome || session.result}
              </p>
            </div>
          )}

          {attendeesDisplay && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">الحضور</p>
              <p className="text-gray-800 whitespace-pre-wrap">{attendeesDisplay}</p>
            </div>
          )}

          {session?.notes && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500 mb-1">ملاحظات</p>
              <p className="text-gray-800 whitespace-pre-wrap">{session.notes}</p>
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
                <p className="text-xs text-gray-500 mb-0.5">تاريخ الإنشاء</p>
                <span className="text-gray-800">{formatDateAr(session.createdAt)}</span>
              </div>
            )}
            {session?.createdByName && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">أنشئ بواسطة</p>
                <span className="text-gray-800">{session.createdByName}</span>
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
      actions={
        <>
          {session && (
            <EntityPrintButton
              branchId={session.branchId}
              title={
                session.subject
                  ? `جلسة: ${session.subject}`
                  : `جلسة SESS-${id}`
              }
              ref={`SESS-${id}`}
              date={formatDateAr(session.sessionDate || session.createdAt)}
              sections={printSections}
            />
          )}
          <GuardedButton
            perm="legal:update"
            variant="outline"
            size="sm"
            onClick={handleEdit}
            disabled={!session || ["cancelled", "held"].includes(session?.status)}
          >
            <Edit className="h-4 w-4 ms-1" />
            تعديل
          </GuardedButton>
        </>
      }
    />
  );
}
