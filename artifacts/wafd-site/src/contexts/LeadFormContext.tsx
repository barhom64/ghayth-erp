/**
 * LeadFormContext — يسمح لأي قسم داخل شجرة الموقع (مثل بطاقات الحملات) بفتح
 * نموذج طلب الاستشارة مع تمرير سياق الحملة (slug + label) لعزو العميل المحتمل.
 * الحالة الفعلية (open/campaign) تبقى في App.tsx؛ هذا مجرد جسر خفيف يتجنّب
 * تمرير الـ props عبر عدة طبقات.
 */
import { createContext, useContext } from "react";

export interface LeadCampaign {
  slug: string;
  label: string;
}

interface LeadFormApi {
  open: (campaign?: LeadCampaign | null) => void;
}

export const LeadFormContext = createContext<LeadFormApi>({ open: () => {} });

export function useLeadForm(): LeadFormApi {
  return useContext(LeadFormContext);
}
