import { ModuleTabsNav } from "./module-tabs-nav";

// مرآة مشتقّة مباشرة من مجموعات قسم «المالية والمحاسبة» في navigation.registry
// (المستوى الأول = المجموعات، الثاني = أبناء المجموعة النشطة). لا قائمة يدوية
// تنحرف عن الجانبية. انظر module-tabs-nav.tsx.
export function FinanceTabsNav() {
  return <ModuleTabsNav section="المالية والمحاسبة" />;
}
