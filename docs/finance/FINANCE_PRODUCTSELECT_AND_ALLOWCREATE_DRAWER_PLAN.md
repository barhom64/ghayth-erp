# FINANCE_PRODUCTSELECT_AND_ALLOWCREATE_DRAWER_PLAN

> الموجة 0.2 من الحزمة — وثيقة تصميم **جاهزة للتنفيذ**. لم تُنفَّذ بعد لأن
> سلوك `snap-to-catalog` حسّاس ويتطلّب **تحقّقًا بالرندرة** (اختبار مكوّن
> jsdom + testing-library)، و**harness رندرة React غير موجود في المستودع**
> اليوم (لا vitest/jsdom/@testing-library في `artifacts/ghayth-erp`). تُنفَّذ
> هذه الخطة في بيئة/فرع فيه harness المكوّنات، أو بعد إضافته (القسم 4).
>
> القطعة العرضية `AllowCreateDrawer` تخصّ **المالية والمستودع معًا** — تُبنى
> مرّة وتُعاد، بتنسيق مع مسار المستودع.

## 1) المشكلة (من الكود الفعلي)
- منتقي المنتج مكرّر بنسختين مختلفتين: `invoices-create.tsx` (مع
  snap-to-catalog: عند اختيار منتج يُملأ الوصف + سعر الوحدة من الكتالوج) و
  `purchase-orders-create.tsx` (منتقٍ أبسط). لا `ProductSelect` مشترك.
- `allowCreate` في `entity-selects.tsx` اليوم يفتح **`QuickCreateDialog`
  مصغّرًا** — يخالف الحزمة («`allowCreate` تُركّب النموذج الموحّد نفسه، لا
  مودالًا مصغّرًا»).

## 2) تصميم `AllowCreateDrawer` (القطعة العرضية — تُبنى مرّة)
ملف مقترح: `artifacts/ghayth-erp/src/components/shared/allow-create-drawer.tsx`

- **الغرض:** عند «إنشاء جديد» في أي محدِّد كيان، يفتح **درجًا** يُركّب **نموذج
  الإنشاء الموحّد الكامل** لذلك الكيان (نفس مكوّن صفحة الإنشاء، بكل محرّكاته
  وأحداثه وAudit) لا نموذجًا مصغّرًا؛ وعند الحفظ يعيد **معرّف الكيان** للأب
  فيُحدَّد تلقائيًا. «لا كيان نصف منشأ».
- **العقد (Embedded mode):** كل نموذج إنشاء يدعم وضعًا مُضمَّنًا:
  - يقبل `embedded?: boolean` + `onCreated?: (id: number) => void`.
  - في الوضع المُضمَّن: يرسم محتواه بلا تنقّل (`setLocation`) — بدله يستدعي
    `onCreated(id)` بعد نجاح الحفظ؛ ويكتم chrome الصفحة إن لزم.
- **السجلّ:** خريطة `ENTITY_CREATE_FORMS: Record<EntityKind, LazyComponent>`
  (client / vendor / supplier / **product** / account / cost-center …) تُحمَّل
  كسولًا (`React.lazy`) داخل الدرج.
- **إعادة الاستخدام:** يُستهلَك من كل `*-select` (لا يعيد كل محدِّد بناء
  منطق إنشاء). يحلّ محلّ `QuickCreateDialog` تدريجيًا (نماذج كثيرة — PR
  مستقل لكل دفعة، بعد بناء الدرج).
- **تنسيق المستودع:** نموذج إنشاء المنتج يعيش في مسار المستودع؛ يجب أن يدعم
  `embedded`/`onCreated` بنفس العقد — يُتّفق عليه مع مسار المستودع لبناء
  الدرج مرّة واحدة لكل الكيانات.

## 3) تصميم `ProductSelect`
ملف مقترح: مكوّن مشترك (في `entity-selects.tsx` أو `components/shared/product-select.tsx`).

```ts
interface ProductSelectProps {
  value: string;                                   // productId
  onChange: (productId: string, product?: Product) => void;
  /** عند true: onChange يُعيد المنتج كاملًا ليملأ الأب الوصف/السعر. */
  snapToCatalog?: boolean;
  allowFree?: boolean;                             // «بند حر» (الفاتورة)
  allowCreate?: boolean;                           // → AllowCreateDrawer("product")
  placeholder?: string;
}
```
- يحمّل `/warehouse/products?limit=500&isActive=true` (نفس المصدر الحالي).
- `snapToCatalog`: السلوك يبقى في **الأب** (هو من يملأ `description`/`unitPrice`
  من `product.name`/`salePrice ?? price`) — المكوّن يكتفي بإعادة المنتج. هذا
  يحفظ سلوك الفاتورة الحالي حرفيًا دون فرضه على أمر الشراء.
- `allowCreate` → يفتح `AllowCreateDrawer` بنوع `"product"`، ويُحدِّد المعرّف
  العائد.
- **التبنّي:** `invoices-create` (مع `snapToCatalog`) و`purchase-orders-create`
  يستبدلان منتقيَيهما المضمَّنين بالمكوّن المشترك.

## 4) بوّابة التحقّق (إلزامية — لأن السلوك حسّاس)
**التحقّق = اختبار مكوّن، لا typecheck وحده، ولا تطبيق حيّ.**

- **المتطلّب المفقود:** إضافة harness رندرة للواجهة:
  `vitest` + `jsdom` (أو `happy-dom`) + `@testing-library/react` +
  `@testing-library/jest-dom`، وملف `vitest.config` بـ`environment: "jsdom"`،
  وسكربت `test` لحزمة `ghayth-erp`، **وربطه في `guard`/CI** ليكون بوّابة.
  (PR بنية تحتية مستقل — قرار المالك.)
- **الاختبار المطلوب:** `ProductSelect.test.tsx`
  - يصيّر `ProductSelect` بقائمة منتجات وهمية.
  - يختار منتجًا → يؤكّد استدعاء `onChange(productId, product)`.
  - في سياق `snapToCatalog`: أبٌ اختباري يؤكّد امتلاء `description`/`unitPrice`
    من المنتج المختار.
  - حالة «بند حر» (allowFree) → onChange بمعرّف فارغ بلا snap.

## 5) التسلسل المقترح
1. **(بنية تحتية)** إضافة harness اختبار المكوّنات للواجهة + ربطه بـ`guard`.
2. **(عرضي)** بناء `AllowCreateDrawer` + عقد `embedded` (تنسيق مع المستودع).
3. **(0.2)** استخراج `ProductSelect` (snapToCatalog + allowCreate→Drawer)
   وتبنّيه في الفاتورة وأمر الشراء، **ببوّابة اختبار المكوّن**.
4. لاحقًا: استبدال `QuickCreateDialog` ببقية المحدِّدات عبر الدرج (دفعات صغيرة).

## القيود
- لا تُنفَّذ 0.2 قبل وجود harness المكوّنات (القسم 4) — وإلا فالتحقّق
  بـtypecheck وحده، وهو ممنوع لسلوك snap-to-catalog الحسّاس.
- `AllowCreateDrawer` كبير ويمسّ نماذج كثيرة — يبقى للبيئة + تنسيق المستودع.
