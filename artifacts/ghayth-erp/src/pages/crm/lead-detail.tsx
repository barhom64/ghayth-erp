/**
 * lead-detail — مُوحَّد (CRM route consolidation).
 *
 * لا يوجد كيان `crm_lead` منفصل في النظام؛ العميل المحتمل والفرصة البيعية
 * كيان واحد في جدول `crm_opportunities`. كان هذا المسار `/crm/leads/:id`
 * يعرض صفحة تفصيلية ثانية لنفس الكيان الذي يعرضه `/crm/:id`
 * (`opportunity-detail`) = ازدواج وتشويش.
 *
 * التوحيد: المسار الكنسي الوحيد لتفاصيل الفرصة هو `/crm/:id`
 * (`opportunity-detail`) — وهو المسار المُعلَن في entityRegistry وهدف
 * actionUrl للإشعارات. ميزتا «التحويل» و«الصفقات المرتبطة» نُقلتا إلى
 * الصفحة الكنسية، فلم تُفقد أي وظيفة.
 *
 * هذا الملف يبقى لإبقاء كل الروابط القديمة (`/crm/leads/:id` —
 * المراجع، الإشارات المرجعية) تعمل عبر إعادة توجيه تحفظ المُعرِّف،
 * بدل حذف عنيف قد يُنتج 404.
 */
import { useRoute, Redirect } from "wouter";

export default function LeadDetailRedirect() {
  const [, params] = useRoute("/crm/leads/:id");
  const id = params?.id;
  // إعادة توجيه تحفظ المُعرِّف إلى المسار الكنسي. عند غياب المُعرِّف
  // نعود لقائمة CRM بدل صفحة معطوبة.
  return <Redirect to={id ? `/crm/${id}` : "/crm"} replace />;
}
