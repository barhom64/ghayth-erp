/**
 * البند ٢ / م٦ — توحيد إنشاء القيد المباشر: «قوالب قيود سريعة» دُمجت داخل صفحة «قيد
 * يومية» (/finance/journal/create) كمنتقي «قالب جاهز». بياناتها صارت مصدر حقيقة واحدًا
 * في lib/journal-templates.ts. هذه الصفحة مُحوَّلة بـredirect (§٨: تحويل لا حذف) فلا
 * يكسر أي رابط/مرجعية قديمة. قيد المسودة/الاعتماد (journal-manual) يبقى مستقلًّا (§١١.٢:
 * الروح المحاسبية لا تُبنى من جديد — دورة الاعتماد maker-checker مصونة بلا مساس).
 */
import { redirectTo } from "@/components/shared/redirect-to";

export default redirectTo("/finance/journal/create");
