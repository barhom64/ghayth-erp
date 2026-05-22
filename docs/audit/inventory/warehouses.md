# جرد المسار — المستودعات (Warehouses)

جرد ثابت مستقل لمسار المستودعات في نظام Ghayth ERP، يغطي ملف المسار الخلفي `routes/warehouse.ts` (1574 سطراً، 27 نقطة نهاية)، وصفحات الواجهة وإنشاء/تفاصيل الكيانات، ومخطط قاعدة البيانات. تم التحقق من كل بند مقابل الشيفرة الفعلية الحالية (file:line)، وتم فحص دعوى F1 في PR #752 (commit `22e0770`) ودعوى F13.

ملاحظة منهجية: التحقق ثابت فقط — لم يُشغَّل النظام. المسارات والجداول والدوال بالإنجليزية، والشرح بالعربية.

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| P1 | `/warehouse` (+ `/warehouse/movements`, `/categories`, `/suppliers`) | `pages/warehouse.tsx` | شغّال | `GET /warehouse/stats`, `GET /warehouse/products`, `GET /warehouse/movements`, `GET /warehouse/categories`, `GET /warehouse/suppliers`, `PATCH/DELETE /warehouse/products/:id` (تحرير سطري) | لا عيب وظيفي؛ التبويبات الأربعة مربوطة بكل المكوّن `Warehouse` فقط (الحالة تُدار محلياً، لا يقرأ الـ route) |
| P2 | `/warehouse/create` | `pages/create/warehouse-create.tsx` | شغّال | `GET /warehouse/categories`, `POST /warehouse/products` | لا عيب — الحقول تطابق `createProductSchema` |
| P3 | `/warehouse/movements/create` | `pages/create/warehouse/movements-create.tsx` | شغّال | `GET /warehouse/products`, `POST /warehouse/movements` | يرسل أنواع `transfer_in/transfer_out/adjustment` بينما المسار يقبلها لكن لا يُعالج `adjustment` فعلياً (WH-004) |
| P4 | `/warehouse/categories/create` | `pages/create/warehouse/categories-create.tsx` | شغّال | `POST /warehouse/categories` | يرسل `form` خاماً ({name} فقط)؛ لا يدعم `parentId` رغم وجوده في المخطط والـ schema |
| P5 | `/warehouse/suppliers/create` | `pages/create/warehouse/suppliers-create.tsx` | شغّال | `POST /warehouse/suppliers` | يرسل `paymentTerms` كسلسلة فارغة `""` عند عدم الاختيار → `z.coerce.number()` تُحوّلها إلى 0 لا 30 (WH-005) |
| P6 | `/warehouse/products/:id` | `pages/details/warehouse-product-detail.tsx` | مكسور جزئياً | `GET /warehouse/products/:id` | يقرأ حقولاً غير موجودة: `unitCost`, `sellingPrice`, `barcode`, `supplierId`, `supplierName` (WH-001) — زر «تعديل» → route ميت (WH-002) |
| P7 | `/warehouse/movements/:id` | `pages/details/warehouse-movement-detail.tsx` | مكسور جزئياً | `GET /warehouse/movements/:id` | يقرأ حقولاً غير موجودة: `totalValue`, `fromWarehouseId`, `toWarehouseId`, `ref`, `reason`, `date`, `performedByName`, `updatedAt` (WH-003) — زر «تعديل» → route ميت (WH-002) |
| P8 | `/warehouse/categories/:id` | `pages/details/warehouse-category-detail.tsx` | مكسور جزئياً | `GET /warehouse/categories/:id` | يقرأ `productsCount`, `totalStockValue`, `parentName`, `icon`, `color` غير المُرجَعة من الـ handler (WH-006) — زر «تعديل» → route ميت |
| P9 | `/warehouse/suppliers/:id` | `pages/details/warehouse-supplier-detail.tsx` | مكسور جزئياً | `GET /warehouse/suppliers/:id` | يقرأ `productsCount`, `totalPurchased`, `notes` غير المُرجَعة من الـ handler — زر «تعديل» → route ميت |
| P10 | `/warehouse/inventory-count` | `pages/warehouse/inventory-count.tsx` | شغّال | `GET/POST /warehouse/inventory-counts`, `GET/POST /warehouse/inventory-counts/:id/items`, `POST /warehouse/inventory-counts/:id/approve` | لا عيب وظيفي؛ الصفحة كاملة الدورة (إنشاء/إدخال/اعتماد) |

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| P1 ProductsTab | «منتج جديد» / «إضافة منتج» | الانتقال لصفحة الإنشاء | — (تنقّل) | شغّال | — |
| P1 ProductsTab | «حركة جديدة» / «إضافة حركة» | الانتقال لإنشاء حركة | — (تنقّل) | شغّال | — |
| P1 ProductsTab | تحرير سطري (RowActions) | تعديل المنتج inline | `PATCH /warehouse/products/:id` | شغّال | — |
| P1 ProductsTab | حذف سطري (RowActions) | حذف المنتج | `DELETE /warehouse/products/:id` | شغّال | — |
| P1 ProductsTab | نقر على صف | الانتقال لتفاصيل المنتج | — (تنقّل) | شغّال | — |
| P1 | تصدير CSV | تصدير محلي | — (محلي) | شغّال | — |
| P6 product-detail | «تعديل» | فتح صفحة تحرير المنتج | تنقّل إلى `/warehouse/products/:id/edit` | مكسور | dead |
| P6 product-detail | «طباعة ملصق / باركود» | طباعة | محرّك الطباعة | غير قابل للتحقق | — |
| P7 movement-detail | «تعديل» | فتح صفحة تحرير الحركة | تنقّل إلى `/warehouse/movements/:id/edit` | مكسور | dead |
| P8 category-detail | «تعديل» | فتح صفحة تحرير التصنيف | تنقّل إلى `/warehouse/categories/:id/edit` | مكسور | dead |
| P9 supplier-detail | «تعديل» | فتح صفحة تحرير المورد | تنقّل إلى `/warehouse/suppliers/:id/edit` | مكسور | dead |
| P2/P3/P4/P5 | «إضافة» / «حفظ» | إرسال نموذج الإنشاء | `POST` المقابل | شغّال | — |
| P10 inventory-count | «جلسة جرد جديدة» | إنشاء جلسة | `POST /warehouse/inventory-counts` | شغّال | — |
| P10 inventory-count | «حفظ» (لكل منتج) | تسجيل عدّ فعلي | `POST /warehouse/inventory-counts/:id/items` | شغّال | — |
| P10 inventory-count | «اعتماد» | اعتماد الجرد وتعديل المخزون | `POST /warehouse/inventory-counts/:id/approve` | شغّال | — |

---

## جدول 3 — APIs

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| `/warehouse/products` | GET | `warehouse.ts:263` | — (query) | P1, P3, P10 | `warehouse_products` | شغّال | — |
| `/warehouse/products` | POST | `warehouse.ts:298` | `createProductSchema:36` | P2 | `warehouse_products` | شغّال | — |
| `/warehouse/products/:id` | GET | `warehouse.ts:360` | — | P6 | `warehouse_products` | شغّال | الواجهة تقرأ حقولاً غير مُرجَعة (WH-001) |
| `/warehouse/products/:id` | PATCH | `warehouse.ts:370` | `patchProductSchema:51` | P1 (inline) | `warehouse_products` | شغّال | — |
| `/warehouse/products/:id` | DELETE | `warehouse.ts:507` | — | P1 (inline) | `warehouse_products` | شغّال | — |
| `/warehouse/movements` | GET | `warehouse.ts:547` | — (query) | P1 | `warehouse_movements` | شغّال | فلتر `enforceBranchScope` يُخفي حركات `branchId=NULL` (WH-007) |
| `/warehouse/movements/:id` | GET | `warehouse.ts:569` | — | P7 | `warehouse_movements` | شغّال | الواجهة تقرأ حقولاً غير موجودة بالمخطط (WH-003) |
| `/warehouse/movements` | POST | `warehouse.ts:585` | `createMovementSchema:117` | P3 | `warehouse_movements` | شغّال | لا يكتب `branchId` في الـ INSERT (WH-007)؛ نوع `adjustment` يُسجَّل كحركة سالبة دون منطق مستقل (WH-004) |
| `/warehouse/transfers` | POST | `warehouse.ts:847` | `createTransferSchema:65` | — | `warehouse_movements` | مكسور | لا واجهة تستدعيه — endpoint ميت (WH-008)؛ لا يكتب `branchId` (WH-007) |
| `/warehouse/categories` | GET | `warehouse.ts:935` | — (query) | P1, P2 | `warehouse_categories` | شغّال | — |
| `/warehouse/categories/:id` | GET | `warehouse.ts:967` | — | P8 | `warehouse_categories` | شغّال | الواجهة تقرأ حقولاً غير مُرجَعة (WH-006) |
| `/warehouse/categories` | POST | `warehouse.ts:980` | `createCategorySchema:75` | P4 | `warehouse_categories` | شغّال | — |
| `/warehouse/categories/:id` | PATCH | `warehouse.ts:1102` | `patchCategorySchema:80` | — | `warehouse_categories` | مكسور | لا واجهة تستدعيه (لا route تحرير) — endpoint ميت (WH-009) |
| `/warehouse/categories/:id` | DELETE | `warehouse.ts:1133` | — | — | `warehouse_categories` | مكسور | لا واجهة تستدعيه — endpoint ميت (WH-009) |
| `/warehouse/suppliers` | GET | `warehouse.ts:1017` | — (query) | P1 | `suppliers` | شغّال | — |
| `/warehouse/suppliers/:id` | GET | `warehouse.ts:1049` | — | P9 | `suppliers` | شغّال | الواجهة تقرأ حقولاً غير مُرجَعة (WH-006) |
| `/warehouse/suppliers` | POST | `warehouse.ts:1062` | `createSupplierSchema:85` | P5 | `suppliers` | شغّال | — |
| `/warehouse/suppliers/:id` | PATCH | `warehouse.ts:1183` | `patchSupplierSchema:95` | — | `suppliers` | مكسور | لا واجهة تستدعيه — endpoint ميت (WH-009) |
| `/warehouse/suppliers/:id` | DELETE | `warehouse.ts:1220` | — | — | `suppliers` | مكسور | لا واجهة تستدعيه — endpoint ميت (WH-009) |
| `/warehouse/stats` | GET | `warehouse.ts:1245` | — | P1 | `warehouse_products`, `warehouse_movements` | شغّال | لا فلترة فرع — قيمة المخزون مجمّعة على الشركة (WH-010) |
| `/warehouse/inventory-counts` | GET | `warehouse.ts:1262` | — (query) | P10 | `inventory_counts` | شغّال | — |
| `/warehouse/inventory-counts` | POST | `warehouse.ts:1281` | `createInventoryCountSchema:105` | P10 | `inventory_counts` | شغّال | يستخدم `scope.employeeId` لـ `conductedBy`؛ NULL إن لم يكن المستخدم موظفاً (WH-011) |
| `/warehouse/inventory-counts/:id/items` | GET | `warehouse.ts:1313` | — | P10 | `inventory_count_items` | شغّال | — |
| `/warehouse/inventory-counts/:id/items` | POST | `warehouse.ts:1358` | `createCountItemSchema:111` | P10 | `inventory_count_items` | شغّال | — |
| `/warehouse/inventory-counts/:id/approve` | POST | `warehouse.ts:1418` | — | P10 | `inventory_counts`, `warehouse_movements`, `warehouse_products` | شغّال | حركات تسوية الجرد بلا `branchId` (WH-007) |

ملاحظة: «27 نقطة نهاية» في النطاق تشمل أزواج list/detail/create/patch/delete؛ الجدول يغطي 24 مساراً متمايزاً + توابع متفرعة (transfers، items GET/POST، approve)، وكلها مُعدَّدة أعلاه.

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله/تقرأه الواجهة | ما يتوقّعه/يُرجِعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| `warehouse-product-detail.tsx:56-57` | تقرأ `product.unitCost` و`product.sellingPrice` و`product.barcode` و`product.supplierId/supplierName` | المخطط: `costPrice`, `sellPrice` فقط؛ لا `barcode`/`supplierId` على `warehouse_products` | الواجهة تعرض «تكلفة الوحدة 0» و«سعر البيع 0» دائماً لأن أسماء الحقول خاطئة | استبدال القراءات بـ `costPrice`/`sellPrice`؛ حذف بطاقات المورد/الباركود أو إضافة الأعمدة للمخطط |
| `warehouse-movement-detail.tsx:56,70-83,95-106` | تقرأ `totalValue`, `fromWarehouseId`, `toWarehouseId`, `ref`, `reason`, `date`, `performedByName` | المخطط `warehouse_movements`: لا يحوي أياً منها؛ المتاح `fromLocation`/`toLocation`/`reference`/`createdAt`/`createdBy` | كل الكيانات المرتبطة بالمستودع المصدر/الوجهة لا تظهر؛ `totalValue` يُحسب بديلاً من `qty*unitCost` فقط | تصحيح القراءات للأسماء الفعلية؛ أو إثراء الـ handler بـ JOIN لأسماء المستخدم/المواقع |
| `warehouse-category-detail.tsx:33-34,40` | تقرأ `productsCount`, `totalStockValue`, `parentName`, `icon`, `color` | `GET /categories/:id` يُرجِع `SELECT *` من `warehouse_categories` فقط (لا تجميع، لا JOIN للأب) | عدّ المنتجات وقيمة المخزون يظهران 0 دائماً؛ اسم التصنيف الأب فارغ | إثراء الـ handler بـ subqueries للعدّ/القيمة و JOIN ذاتي لاسم الأب |
| `warehouse-supplier-detail.tsx:48-50` | تقرأ `productsCount`, `totalPurchased`, `notes` | `GET /suppliers/:id` يُرجِع `SELECT *` من `suppliers` (لا `notes`، لا تجميع مشتريات) | بطاقات إحصاء المورد تظهر 0؛ الملاحظات لا تُعرَض | إثراء الـ handler أو حذف الحقول من الواجهة |
| `suppliers-create.tsx:32` | يرسل `form` كاملاً مع `paymentTerms:""` (سلسلة فارغة عند عدم الاختيار) | `createSupplierSchema:92` = `z.coerce.number().optional()` | `Number("")` = 0 → يُكتب 0 يوم بدل القيمة الافتراضية 30 المقصودة في الـ INSERT (`b.paymentTerms || 30`) — صفر قيمة صحيحة فلا يُفعَّل الافتراضي | حذف `paymentTerms` من الـ payload إن كانت سلسلة فارغة، أو جعل الحقل صريحاً non-zero |
| `categories-create.tsx:29` | يرسل `{name}` فقط، لا `parentId` | `createCategorySchema:75` يقبل `parentId` اختيارياً، والمخطط يدعم التسلسل الهرمي | لا يمكن إنشاء فئة فرعية من الواجهة رغم دعم الباك-إند والمخطط للأب | إضافة حقل اختيار التصنيف الأب لنموذج الإنشاء |
| `movements-create.tsx:104-109` | قائمة النوع تشمل `adjustment` | `createMovementSchema` يقبل `adjustment` لكن `POST /movements` لا يفرّعه: يُعامَل كـ `sign=-1` (إخراج) دون GL ودون منطق فائض/عجز | حركة `adjustment` تنقص المخزون دائماً ولا تستطيع زيادته، ولا تُرحَّل محاسبياً | فصل منطق `adjustment` (اتجاه قابل للموجب والسالب) أو إزالته من قائمة الواجهة |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| حساب التكلفة المرجّحة المتحرّكة | `updateWeightedAverageCost` helper — `warehouse.ts:167` | inline داخل `POST /movements` — `warehouse.ts:677` | duplicate (محلول) — كلاهما الآن يستدعي `runningWeightedAverageCost` المشترك في `lib/inventory/valuation/running-average.ts:30` بعد PR #752؛ لا تباعُد في الصيغة | لا إجراء — F1 مُغلق. يبقى تحفّظ: الـ helper `updateWeightedAverageCost` نفسه غير مُستدعى من أي مسار داخل `warehouse.ts` (helper شبه ميت — WH-012) |
| كتابة حركة مخزون + تحديث `currentStock` | `POST /movements` — `warehouse.ts:663-687` | `POST /inventory-counts/:id/approve` `onApply` — `warehouse.ts:1486-1497` | conflict جزئي — مساران يكتبان `warehouse_movements` ويعدّلان `currentStock` بقواعد مختلفة: مسار الحركة يحدّث `costPrice` المرجّح ويتعامل مع الدفعات `warehouse_stock_batches`؛ مسار الجرد لا يلمس الدفعات ولا يعيد حساب التكلفة المرجّحة | توحيد مسار التسوية ليمرّ عبر منطق الحركة نفسه (تحديث الدفعات + التكلفة) أو توثيق الفرق صراحةً |
| تحديد `branchId` للحركة | `POST /movements` INSERT — `warehouse.ts:664` (لا يكتبه) | `GET /movements` فلتر — `warehouse.ts:552` (`enforceBranchScope:true`) | conflict — الكتابة تُهمل العمود والقراءة تفرضه | كتابة `branchId: scope.branchId` في كل INSERT لحركة (movements + transfers + approve) |
| تحوّلات حالة الكيان | `PRODUCT_TRANSITIONS`/`COUNT_TRANSITIONS` inline — `warehouse.ts:127-137` | محرّك `lifecycleEngine` (`applyTransition`) | duplicate خفيف — جداول التحوّل مُعرَّفة inline لكن تُمرَّر للمحرّك؛ نمط مقبول ومتسق مع F13 في `store.ts` | لا إجراء عاجل — تسجيل الجداول مركزياً تحسين تجميلي |

---

## يحتاج Runtime Verification

- زر «طباعة ملصق / باركود» في `warehouse-product-detail.tsx` وزر طباعة الحركة — يعتمدان على `EntityPrintButton` ومحرّك الطباعة خارج النطاق؛ لا يمكن تأكيد سلامة القوالب ثابتاً.
- ترحيل GL لحركات المخزون عبر `warehouseEngine.postMovementGL` (`warehouse.ts:252`) — يُستورَد ديناميكياً من `lib/engines/index.js`؛ صحة القيود المحاسبية وأرقام الحسابات تتطلب فحص بيئة تشغيل.
- مسار `triggerMinStockPipeline` (`warehouse.ts:810`) — ينشئ `purchase_requests` تلقائياً عند انخفاض المخزون؛ سلوكه عبر شركات/فروع متعددة وصحة `effectiveAssignmentId` يحتاج تشغيلاً.
- تطبيق هجرة `172z_warehouse_base_tables.sql` فعلياً قبل `173` — الترتيب الأبجدي يضمنه نظرياً، لكن نجاح الإنشاء على قاعدة حيّة يحتاج تأكيداً.
- قيمة `scope.employeeId` و`scope.activeAssignmentId` المحقونة من `authMiddleware` — غير مُعرَّفة على نوع `Scope` ويُتوصَّل إليها عبر `as any`؛ توفّرها وقت التشغيل غير مؤكَّد ثابتاً (يخص WH-011).

---

## العيوب المُرقّمة (Defect Register)

- **WH-001** · mismatch · impairing · narrow — `warehouse-product-detail.tsx` يقرأ `unitCost`/`sellingPrice`/`barcode`/`supplierId` غير الموجودة بالمخطط فتظهر الأسعار صفراً دائماً. الدليل: `warehouse-product-detail.tsx:56-57` مقابل `schema_pre.sql warehouse_products` (الأعمدة `costPrice`/`sellPrice`). التبعية: لا.
- **WH-002** · dead · impairing · narrow — أزرار «تعديل» في صفحات تفاصيل المنتج/الحركة/التصنيف/المورد تنتقل إلى `/warehouse/products|movements|categories|suppliers/:id/edit` وهي routes غير معرّفة في `miscRoutes.tsx`. الدليل: `warehouse-product-detail.tsx:134`, `warehouse-movement-detail.tsx:126`, `warehouse-category-detail.tsx:53`, `warehouse-supplier-detail.tsx:88` مقابل `miscRoutes.tsx:97-109` (لا entry `/edit`). التبعية: لا.
- **WH-003** · mismatch · impairing · narrow — `warehouse-movement-detail.tsx` يقرأ `totalValue`/`fromWarehouseId`/`toWarehouseId`/`ref`/`reason`/`date`/`performedByName`/`updatedAt` غير الموجودة بجدول `warehouse_movements`. الدليل: `warehouse-movement-detail.tsx:56,70-83,95-106` مقابل `schema_pre.sql warehouse_movements`. التبعية: لا.
- **WH-004** · dead · impairing · structural — نوع الحركة `adjustment` متاح بقائمة الواجهة ويقبله الـ schema، لكن `POST /movements` لا يفرّعه: يُعامَل كإخراج `sign=-1` دون منطق فائض/عجز ودون ترحيل GL، فلا يستطيع زيادة المخزون. الدليل: `warehouse.ts:662` (تحديد `sign`) و`warehouse.ts:703-755` (فروع GL لا تشمل `adjustment`)؛ القائمة في `movements-create.tsx:109`. التبعية: لا.
- **WH-005** · mismatch · cosmetic · narrow — `suppliers-create.tsx` يرسل `paymentTerms:""`؛ `z.coerce.number()` تُحوّلها إلى 0، وصفر قيمة صحيحة فلا يُفعَّل افتراضي 30 في `b.paymentTerms || 30`. الدليل: `suppliers-create.tsx:32` + `INITIAL:12` مقابل `warehouse.ts:1080` و`createSupplierSchema:92`. التبعية: لا.
- **WH-006** · mismatch · impairing · narrow — صفحات تفاصيل التصنيف/المورد تقرأ حقولاً تجميعية (`productsCount`/`totalStockValue`/`totalPurchased`/`parentName`/`notes`) لا يُرجِعها الـ handler الذي يكتفي بـ `SELECT *`. الدليل: `warehouse.ts:967-977` و`warehouse.ts:1049-1059` مقابل `warehouse-category-detail.tsx:33-34` و`warehouse-supplier-detail.tsx:48-50`. التبعية: لا.
- **WH-007** · conflict · blocking · structural — `POST /movements` و`POST /transfers` و`approve.onApply` تُدرِج صفوف `warehouse_movements` دون تعيين `branchId`، بينما `GET /movements` يفرض `enforceBranchScope:true` على `m."branchId"`؛ النتيجة: كل الحركات المُنشأة من الواجهة تكون `branchId=NULL` وتختفي عن المستخدمين المقيّدين بفرع. الدليل: `warehouse.ts:664` و`warehouse.ts:879/886` و`warehouse.ts:1492` (INSERTs بلا `branchId`) مقابل `warehouse.ts:552` (الفلتر) و`scopedQuery.ts:108-116` (الشرط يستبعد NULL). التبعية: لا.
- **WH-008** · dead · impairing · narrow — `POST /warehouse/transfers` لا تستدعيه أي صفحة في الواجهة؛ التحويلات تُنفَّذ عبر `POST /movements` بنوعَي `transfer_in/transfer_out`. الدليل: `grep 'warehouse/transfers'` في `artifacts/ghayth-erp/src` = لا نتائج؛ الـ handler `warehouse.ts:847`. التبعية: لا.
- **WH-009** · dead · impairing · narrow — `PATCH/DELETE /warehouse/categories/:id` و`PATCH/DELETE /warehouse/suppliers/:id` لا تستدعيها أي واجهة (لا توجد routes تحرير، ولا حذف من جداول التصنيفات/الموردين). الدليل: handlers `warehouse.ts:1102/1133/1183/1220`؛ `warehouse.tsx` يعرض التصنيفات/الموردين للقراءة فقط، و`miscRoutes.tsx` بلا `/edit`. التبعية: WH-002.
- **WH-010** · scaling · impairing · structural — `GET /warehouse/stats` يجمّع `totalValue`/`lowStock`/`todayMovements` على مستوى الشركة كاملةً بلا فلترة فرع، فتعرض الـ KPIs أرقاماً غير دقيقة لمستخدم فرع واحد، وتتضخّم مع تعدّد الفروع. الدليل: `warehouse.ts:1245-1255` (لا `buildScopedWhere`، فقط `companyId`). التبعية: WH-007.
- **WH-011** · mismatch · impairing · narrow — `POST /inventory-counts` يكتب `conductedBy = scope.employeeId` و`approve` يكتب `approvedBy = scope.employeeId`؛ إن كان المستخدم غير مرتبط بسجل موظف تُكتب NULL ويظهر «بواسطة —» في الواجهة. الدليل: `warehouse.ts:1290` و`warehouse.ts:1453` مقابل `inventory-count.tsx:182` (`conductedByName`). التبعية: لا.
- **WH-012** · duplicate · cosmetic · narrow — الدالة المساعدة `updateWeightedAverageCost` (`warehouse.ts:149`) موحَّدة الصيغة مع المسار بعد PR #752، لكنها غير مُستدعاة من أي مكان داخل `warehouse.ts` — كود شبه ميت يحمل تعليقاً يدّعي استخدام «callers خارج مسار الحركة». الدليل: `warehouse.ts:149` (تعريف) — لا استدعاء داخلي؛ المسار يستخدم `runningWeightedAverageCost` مباشرة في `warehouse.ts:677`. التبعية: لا.

---

## خلاف مع تقارير سابقة

1. **F1 (تكرار حساب التكلفة المرجّحة) — مُغلق، خلافاً لتصنيفه 🔴 High «مفتوح» في `UNVERIFIED_PATHS_ARCHITECTURE_MAP.md:151` و«P0 لاحق» في خطة المعالجة (`:200`).**
   التحقق المباشر: PR #752 (commit `22e0770`) استخرج الصيغة فعلياً إلى `runningWeightedAverageCost` في `lib/inventory/valuation/running-average.ts:30`، وكلا مسارَي الكتابة يستدعيانها الآن: المسار `POST /movements` في `warehouse.ts:677` والـ helper `updateWeightedAverageCost` في `warehouse.ts:167`. لم يعد هناك صيغة inline مكرّرة في `:679`، فلا إمكانية تباعُد. **F1 لا يجب أن يبقى في قائمة P0؛ يُنزَّل إلى «محلول».** التحفّظ الوحيد المتبقّي (WH-012) هو أن الـ helper الموحَّد نفسه أصبح شبه ميت.

2. **F13 — صحيح كوصف، لكن تصنيفه عيباً مبالَغ فيه.** `UNVERIFIED_PATHS:163` يصف إعادة تعريف `VALID_ORDER_TRANSITIONS` inline في `store.ts:15` و`:356` (تأكَّد ثابتاً: `store.ts:15` تعريف، `:356` استخدام). لكن مسار المستودعات يتبع النمط نفسه تماماً: `PRODUCT_TRANSITIONS`/`COUNT_TRANSITIONS` معرّفة inline في `warehouse.ts:127-137` ثم تُمرَّر لمحرّك `lifecycleEngine`. بما أن التقرير لا يَعُدّ تعريفات warehouse عيباً، فاعتبار نظيرتها في `store.ts` عيباً 🟢 Low منفصلاً غير متسق — إمّا أن يكون النمط مقبولاً في الموضعين أو معيباً فيهما. التقييم المستقل: نمط inflow + محرّك مقبول، والبند تجميلي لا أكثر.

3. **خلاف على «نتائج سليمة» في `UNVERIFIED_PATHS:166`** التي تنصّ «لا orphan APIs» داخل النطاق المفحوص. هذا الجرد يثبت وجود **endpoints فعلياً بلا واجهة مُستهلِكة** في مسار المستودعات: `POST /transfers` (WH-008) و`PATCH/DELETE /categories/:id` و`PATCH/DELETE /suppliers/:id` (WH-009) — أي 5 نقاط نهاية يتيمة. وإن كان مسار `warehouse.ts` خارج عيّنة الواجهة العشرة في ذلك التقرير، فإن إطلاق «لا orphan APIs» كنتيجة عامة غير دقيق لهذا المسار.
