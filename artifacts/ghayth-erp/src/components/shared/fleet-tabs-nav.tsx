import { ModuleTabsNav } from "./module-tabs-nav";

// مرآة مشتقّة من مجموعة «إدارة الأسطول» في قسم «الأسطول والنقل». المستوى الأول =
// المجموعات السبع، الثاني = أبناء المجموعة النشطة (ومنها صفحات النقل تحت «النقل
// والإرسال»، فتُغني عن شريط النقل المتخصّص). انظر module-tabs-nav.tsx.
export function FleetTabsNav() {
  return <ModuleTabsNav section="الأسطول والنقل" wrap="إدارة الأسطول" />;
}
