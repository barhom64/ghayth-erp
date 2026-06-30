// رابط «الملف الموحّد 360°» يُدرج في صفحة تفاصيل أي كيان مرتبط بطرف.
// يحلّ (entityTable, entityId) → partyId عبر GET /parties/resolve، ويظهر فقط
// إذا كان الكيان مربوطًا فعلًا بطرف (parties، هجرة 249) — لا ضوضاء على الكيانات
// غير المسجَّلة بعد.
import { Link } from "wouter";
import { useApiQuery } from "@/lib/api";
import { Users } from "lucide-react";

export function PartyProfileLink({
  entityTable,
  entityId,
}: {
  entityTable: string;
  entityId: number | string | null | undefined;
}) {
  const hasId = entityId !== null && entityId !== undefined && String(entityId).trim() !== "";
  const { data } = useApiQuery<{ partyId: number | null }>(
    ["party-resolve", entityTable, String(entityId ?? "")],
    hasId ? `/parties/resolve?entityTable=${entityTable}&entityId=${entityId}` : null,
    { enabled: hasId },
  );
  const partyId = data?.partyId;
  if (!partyId) return null;
  return (
    <Link
      href={`/settings/party/${partyId}`}
      className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
    >
      <Users className="h-3.5 w-3.5" />
      <span>الملف الموحّد (360°)</span>
    </Link>
  );
}
