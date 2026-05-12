# client-portal — بوابة العميل (Client Portal)

> هذه البوابة لا تملك صفحات في تطبيق `ghayth-erp` الرئيسي.
> هي تطبيق منفصل تخدمه نقطة النهاية `artifacts/api-server/src/routes/clientPortal.ts`.

## النطاق

- **خادم API:** `artifacts/api-server/src/routes/clientPortal.ts`
- **هجرات DB:** `artifacts/api-server/migrations/021_client_portal_accounts.sql`, `artifacts/api-server/migrations/034_portal_account_client_unique.sql`
- **اختبارات Smoke:** `artifacts/api-server/tests/unit/portalsDashboardsSmoke.test.ts`

## مرجع المراجعة

ملف المراجعة الرسمي للبوابة:
- [`PORTALS_TEST_MATRIX.md`](../../../../PORTALS_TEST_MATRIX.md)
- [`PORTALS_BUGS.md`](../../../../PORTALS_BUGS.md)

## التوصية

عند الحاجة إلى مراجعة صفحة-صفحة لواجهة البوابة، تُستخدم نفس منهجية
`audit/system-review/methodology.md` على مستودع البوابة الخارجي (إن وُجد)،
ويُضاف الملف هنا كرابط بعد ذلك.
