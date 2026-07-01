# خطة إزالة تكرار المكوّنات (قديم/جديد) — اعتماد إبراهيم: «كلها على التوالي»

> المبدأ: عند وجود مكوّن جديد بديل لمكوّن قديم لنفس الغرض → استبدال الاستخدامات وحذف القديم مباشرة. لا تعايُش.
> المرجع الدستوري: المادة 15 (لا تكرار) + §5 (نمط AllowCreateDrawer، لا QuickCreateDialog مصغّر).

## المسار 1 (الأنظف، واجهة فقط) — تقاعُد `QuickCreateDialog`

**الوضع:** سطحان لإنشاء كيان من المحدِّد:
- `AllowCreateDrawer` (جديد، معتمد §5) — درج يستضيف نموذجًا كاملًا. 12 محدِّدًا يستخدمه عبر `createEntityKind`.
- `QuickCreateDialog` (قديم، داخلي في `entity-selects.tsx`) — Dialog مصغّر مدفوع بـ`createFields`. يستخدمه 10 محدِّدات بلا `createEntityKind`:
  Supplier · Unit · JobTitle · Position · Team · Committee · UmrahAgent · UmrahSeason · Building · PropertyOwner.

**القرار المعماري:** لا نبني 10 نماذج كاملة عبر 5 مسارات (refactor واسع، يخالف القاعدة 15 ويمسّ العمرة المتنازَعة). بدلًا: **توحيد على مكوّن إنشاء واحد** — نوسّع `AllowCreateDrawer` بوضع «نموذج حقول عام» يمتصّ جسم `QuickCreateDialog` (نفس `createFields`/endpoint، داخل الدرج)، فيصير كل سطح الإنشاء عبر `AllowCreateDrawer`، ثم **نحذف `QuickCreateDialog`**.

### الدفعة 1 (هذه) — التوحيد + حذف القديم
- `allow-create-drawer.tsx`: `kind` يصير اختياريًّا، وتُضاف `genericConfig?: {title, fields, apiPath, invalidateKey}` + مكوّن داخلي `GenericCreateForm` (FormShell + zod-from-fields + mutation) يحقّق نفس عقد `EmbeddedCreateFormProps`.
- `entity-selects.tsx`: فرع الإنشاء يستخدم `AllowCreateDrawer` دائمًا (kind أو genericConfig). **حذف `QuickCreateDialog`** + إزالة الاستيرادات التي صارت بلا استخدام (`z`, `useApiMutation`, `FormShell`, `FormTextField`, `useToast`, `Button`).
- صفر تغيير سلوك: نفس الحقول/الـendpoint/الإبطال؛ العرض درج بدل Dialog (مطلوب §5).
- تحقّق: typecheck + lint + اختبارات + المجلس.

### دفعات لاحقة (واجهة، اختيارية تحسينية، كلٌّ في مسارها المالك)
- ترقية الكيانات التي يبتر فيها quick-add حقولًا جوهرية (Unit، Supplier) إلى نموذج كامل مسجَّل في الـregistry — PR لكل مسار مالك.

## المسار 2 (معماري، يمسّ backend) — توحيد لوحات الكيان-مرفقات
- ثلاث لوحات متوازية: `EntityDocuments` (/api/documents) · `EntityAttachmentPanel` (/api/storage+documents) · `UmrahAttachmentsPanel` (/api/umrah/attachments). تخدم نفس الغرض بثلاثة backends.
- يلزم مواءمة backend + يمسّ العمرة المتنازَعة ⇒ خطة منفصلة تُعرض قبل التنفيذ (تصعيد لإبراهيم: قرار + احتمال migration). لا يُنفَّذ في هذه الدفعة.

## التتبّع
- [x] المسار 1: توحيد AllowCreateDrawer + حذف QuickCreateDialog — **مُدمَج #2991**.
- [x] المسار 2 / الدفعة A (واجهة): توحيد `EntityDocuments` + حذف `EntityAttachmentPanel` (نفس `/documents`، props اختيارية رجعية، quickUpload + مصغّرات + تصنيفات أملاك). ترحيل contract-detail + unit-detail. مجلس: يُعتمد.
- [ ] المسار 2 / الدفعة B (backend، العمرة المتنازَعة): توحيد `UmrahAttachmentsPanel` ⇒ **هجرة `umrah_attachments → documents`** — تُعرض كتصميم + بيان ضرورة لتوقيع إبراهيم الصريح قبل كتابة الـmigration (المادة 3).
