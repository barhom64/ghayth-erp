import { ModuleTabsNav } from "./module-tabs-nav";

// مرآة مشتقّة من مجموعة «إدارة العمرة» في قسم «العمرة». المستوى الأول = المجموعات
// العشر، الثاني = أبناء المجموعة النشطة. انظر module-tabs-nav.tsx.
export function UmrahTabsNav() {
  return <ModuleTabsNav section="العمرة" wrap="إدارة العمرة" />;
}
