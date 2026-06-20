import { ModuleTabsNav } from "./module-tabs-nav";

// HR-REV — الشريط الأفقي للموارد البشرية مرآةٌ مشتقّة مباشرة من مجموعات القسم
// «الموارد البشرية» في navigation.registry (المستوى الأول = المجموعات، المستوى
// الثاني = أبناء المجموعة النشطة). لا تسميات مكرّرة هنا، فيستحيل أن ينحرف عن
// القائمة الجانبية. انظر module-tabs-nav.tsx.
export function HrTabsNav() {
  return <ModuleTabsNav section="الموارد البشرية" />;
}
