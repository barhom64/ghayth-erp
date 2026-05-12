# careers-portal — بوابة التوظيف (Careers Portal)

> هذه البوابة لا تملك صفحات في تطبيق `ghayth-erp` الرئيسي.
> هي تطبيق منفصل تخدمه نقطة النهاية `artifacts/api-server/src/routes/careersPortal.ts`.

## النطاق

- **خادم API:** `artifacts/api-server/src/routes/careersPortal.ts`
- **هجرات DB:** `artifacts/api-server/migrations/055_recruitment_portal.sql`
- **اختبارات Smoke:** `artifacts/api-server/tests/unit/portalsDashboardsSmoke.test.ts`

## مرجع المراجعة

ملف المراجعة الرسمي للبوابة:
- [`PORTALS_TEST_MATRIX.md`](../../../../PORTALS_TEST_MATRIX.md)
- [`PORTALS_BUGS.md`](../../../../PORTALS_BUGS.md)

## التوصية

عند الحاجة إلى مراجعة صفحة-صفحة لواجهة البوابة، تُستخدم نفس منهجية
`audit/system-review/methodology.md` على مستودع البوابة الخارجي (إن وُجد)،
ويُضاف الملف هنا كرابط بعد ذلك.
