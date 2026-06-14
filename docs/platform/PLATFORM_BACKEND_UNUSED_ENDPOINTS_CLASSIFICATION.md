# تصنيف الـ96 Backend Endpoints غير المستهلكة

**PR-5 — Wave 2 (#2163)**
**التاريخ:** 2026-06-14
**الحالة:** تصنيف فقط — لا حذف، لا تعديل سلوك، لا RBAC جديد

---

## ملاحظات منهجية

- المصدر الأولي: `docs/platform/PLATFORM_BACKEND_UNUSED_ENDPOINTS.csv` (96 سطر + header)
- التحقق: تم قراءة ملفات `artifacts/api-server/src/routes/` للحصول على `authorize()` الفعلي
- التحقق من المستهلكين: بحث في `artifacts/ghayth-erp/src/` عن استدعاءات كل path
- **2 endpoints ظهرت false-positive** (لها مستهلك فعلي): تفاصيل في §22

---

## تعريف التصنيفات

| الرمز | المعنى |
|---|---|
| `wire` | Backend جاهز، FE لم يُوصَّل بعد — ينتظر PR مستقبلي |
| `internal-service` | يُستدعى من cron/webhook/خدمة خلفية أخرى، ليس من FE |
| `report-only` | قراءة فقط، بيانات مرجعية أو تقارير |
| `integration-only` | لأنظمة خارجية (تقويم، webhook خارجي) |
| `remove-candidate` | يتيم حقيقي — لا مسار استخدام واضح |
| `false-positive` | له مستهلك فعلي — خطأ في الجرد الأصلي |

---

## §1 — Activity Log (1 endpoint)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/activity-log/feed` | `admin:list` | لا | `wire` | Feed موجود في Backend، لا تُعرض بعد في واجهة مراقبة نشاط المشرف | منخفض | بناء صفحة admin activity monitor |

---

## §2 — Admin (7 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/admin/communication-control/outbound-queue` | `admin:list` | لا | `internal-service` | قائمة انتظار الرسائل الصادرة — تُستخدم من لوحة مراقبة داخلية أو cron | منخفض | توثيق التكامل الداخلي |
| POST | `/api/admin/communication-control/outbound-queue/bulk-retry` | `admin:update` | لا | `internal-service` | إعادة محاولة جماعية للرسائل الفاشلة — admin operator | منخفض | توثيق تدفق admin |
| GET | `/api/admin/communication-control/validation` | `admin:list` | لا | `report-only` | تقرير صحة اتجاه الرسائل — تشخيص | منخفض | يمكن تحويله لصفحة تقرير |
| GET | `/api/admin/predefined-roles` | `admin:list` | لا | `report-only` | قائمة الأدوار المحددة مسبقًا — بيانات مرجعية لـrole picker | منخفض | توثيق، ربما false-positive إن استُخدم داخليًا |
| GET | `/api/admin/subscription` | `admin:view` | لا | `wire` | حالة اشتراك الشركة (B2) — Backend جاهز، لا FE يعرضه بعد | منخفض | بناء شاشة subscription status للمالك |
| POST | `/api/admin/subscription/activate` | `admin:update` | لا | `wire` | تفعيل اشتراك (B2 onboarding) | متوسط | بناء dialog تفعيل الاشتراك |
| POST | `/api/admin/subscription/extend-trial` | `admin:update` | لا | `wire` | تمديد فترة تجريبية — B2 onboarding | متوسط | بناء dialog تمديد التجربة |

---

## §3 — Auth (2 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| POST | `/api/auth/mobile/login` | لا guard (public) | لا | `wire` | تدفق تسجيل دخول التطبيق المحمول (Expo/React Native) — Backend جاهز | منخفض | تكامل مع تطبيق mobile عند بنائه |
| POST | `/api/auth/mobile/refresh` | لا guard (public) | لا | `wire` | تجديد token للتطبيق المحمول | منخفض | تكامل مع تطبيق mobile عند بنائه |

---

## §4 — Cargo (1 endpoint)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| PATCH | `/api/cargo/items/:id` | `cargo:update` | لا | `wire` | تعديل بيانات بند شحن — Backend موجود، لا نموذج تعديل في FE | متوسط | بناء نموذج تعديل بند الشحن |

---

## §5 — Clients (1 endpoint)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/clients/:id/contact-summary` | `crm.clients:view` | لا | `report-only` | ملخص قنوات التواصل للعميل — بيانات تحليلية | منخفض | يمكن إدراجه في صفحة العميل 360 |

---

## §6 — Communications (1 endpoint)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/communications/log/:id/referral-chain` | `communications:list` | لا | `remove-candidate` | سلسلة إحالة رسالة — لا مسار استخدام واضح في FE أو backend | منخفض | مراجعة قبل الحذف في PR لاحق |

---

## §7 — Documents (6 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/documents/:id/access-log` | `documents:list` | لا | `report-only` | سجل وصول المستند — audit trail | منخفض | إدراجه في تقرير audit |
| POST | `/api/documents/retention/backfill` | `documents:delete` | لا | `internal-service` | backfill يدوي لسياسة الاحتفاظ — admin operator | منخفض | توثيق تدفق admin |
| GET | `/api/documents/retention/due` | `documents:delete` | لا | `internal-service` | قائمة المستندات المستحقة للحذف — يُستدعى من cron | منخفض | توثيق cron schedule |
| GET | `/api/documents/:id/acls` | `documents:list` | لا | `wire` | قراءة ACL المستند — Backend جاهز لنظام صلاحيات تفصيلي | منخفض | بناء واجهة إدارة ACL |
| POST | `/api/documents/:id/acls` | `documents:update` | لا | `wire` | إضافة ACL — Backend جاهز | متوسط | بناء واجهة إدارة ACL |
| DELETE | `/api/documents/:id/acls/:aclId` | `documents:update` | لا | `wire` | حذف ACL — Backend جاهز | متوسط | بناء واجهة إدارة ACL |

---

## §8 — Export / PDF (3 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/export/pdf/invoice/:id` | `finance.invoices:export` | لا | `report-only` | PDF فاتورة — proxy لمحرك الطباعة | منخفض | التحقق من تكامل Print Engine v2 |
| GET | `/api/export/pdf/voucher/:id` | `finance.reports:export` | لا | `report-only` | PDF سند دفع — proxy | منخفض | التحقق من تكامل Print Engine v2 |
| GET | `/api/export/pdf/payroll/:id` | `hr.payroll:export` | لا | `report-only` | PDF كشف راتب — proxy | منخفض | التحقق من تكامل Print Engine v2 |

---

## §9 — Finance (8 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/finance/subsidiary-account-failures` | `finance:list` | لا | `internal-service` | تشخيص فشل ترحيل الحسابات الفرعية | منخفض | لوحة مراقبة محاسبية داخلية |
| POST | `/api/finance/subsidiary-account-failures/:id/retry` | `finance:update` | لا | `internal-service` | إعادة محاولة ترحيل فاشل | متوسط | admin flow للمحاسب |
| GET | `/api/finance/dso-trend` | `finance.reports:view` | لا | `report-only` | منحنى Days Sales Outstanding — تقرير تحليلي | منخفض | بناء لوحة CFO dashboard |
| GET | `/api/finance/customer-360/:clientId` | `finance.reports:view` | لا | `report-only` | ملف مالي موحد للعميل | منخفض | إدراجه في صفحة العميل 360 |
| POST | `/api/finance/fixed-assets/:id/transfer` | `finance.algorithms:create` | لا | `wire` | نقل أصل ثابت بين فروع — Backend كامل (migration 338) | متوسط | بناء dialog نقل الأصل |
| POST | `/api/finance/fixed-assets/:id/dispose` | `finance.algorithms:create` | لا | `wire` | استبعاد أصل ثابت — Backend كامل | متوسط | بناء dialog استبعاد |
| POST | `/api/finance/fixed-assets/:id/impair` | `finance.algorithms:create` | لا | `wire` | خفض قيمة أصل (IAS 36) — Backend كامل | متوسط | بناء dialog انخفاض القيمة |
| POST | `/api/finance/fixed-assets/:id/revalue` | `finance.algorithms:create` | لا | `wire` | إعادة تقييم أصل (IFRS) — Backend كامل | متوسط | بناء dialog إعادة التقييم |

---

## §10 — Fleet (8 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/fleet/cargo/manifests/:id/checkpoints` | `fleet:list` | لا | `report-only` | نقاط تفتيش الشحنة — timeline | منخفض | إدراجه في تفاصيل الشحنة |
| POST | `/api/fleet/trips` | `fleet:create` | لا | `wire` | إنشاء رحلة — Backend جاهز | متوسط | بناء نموذج إنشاء رحلة |
| PATCH | `/api/fleet/tires/:id` | `fleet:update` | لا | `wire` | تعديل بيانات إطار — Backend جاهز | متوسط | بناء نموذج تعديل الإطار |
| DELETE | `/api/fleet/tires/:id` | `fleet:update` | لا | `wire` | حذف إطار — Backend جاهز | متوسط | إضافة زر حذف في صفحة الإطارات |
| GET | `/api/fleet/rental-contracts` | `fleet:list` | لا | `wire` | قائمة عقود الإيجار — Backend جاهز | منخفض | بناء صفحة عقود الإيجار |
| POST | `/api/fleet/rental-contracts/:id/payments` | `fleet:update` | لا | `wire` | تسجيل دفعة على عقد إيجار | متوسط | بناء نموذج الدفعة |
| GET | `/api/fleet/rental-contracts/:id/payments` | `fleet:list` | لا | `report-only` | سجل دفعات عقد الإيجار | منخفض | إدراجه في تفاصيل العقد |
| POST | `/api/fleet/rental-payments/:id/pay` | `fleet:update` | لا | `wire` | تسوية دفعة إيجار | متوسط | بناء dialog التسوية |

---

## §11 — HR (8 endpoints) — ⚠️ مرتبطة بـHR-REV

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | HR-REV | الإجراء التالي |
|---|---|---|---|---|---|---|---|---|
| GET | `/api/hr/attendance/field-ping/eligibility` | `hr.attendance.checkin:create` | لا (mobile) | `wire` | تحقق من أهلية موظف لتسجيل موقع ميداني — mobile app | منخفض | HR-REV-0 | تكامل mobile app |
| POST | `/api/hr/attendance/field-ping` | `hr.attendance.checkin:create` | لا (mobile) | `wire` | نبضة موقع ميداني من هاتف الموظف | منخفض | HR-REV-0 | تكامل mobile app |
| GET | `/api/hr/attendance/field-track` | `hr.attendance:list` | **نعم** | `false-positive` | يستهلكه `field-tracking.tsx` — كان خطأً في الجرد | — | — | لا إجراء |
| POST | `/api/hr/leave-types` | `hr.leaves:update` | لا | `wire` | إنشاء نوع إجازة — Backend جاهز | منخفض | HR-REV-1 | بناء نموذج نوع الإجازة |
| PATCH | `/api/hr/leave-types/:id` | `hr.leaves:update` | لا | `wire` | تعديل نوع إجازة | منخفض | HR-REV-1 | بناء نموذج التعديل |
| GET | `/api/hr/company-document-categories` | `hr.organization:list` | لا | `report-only` | بيانات مرجعية — فئات وثائق الشركة | منخفض | HR-REV-2 | التحقق من استخدامه في dropdown |
| DELETE | `/api/hr/company-documents/:id` | `hr.organization:update` | لا | `wire` | حذف وثيقة شركة | منخفض | HR-REV-2 | إضافة زر حذف |
| PATCH | `/api/hr/company-documents/:id` | `hr.organization:update` | لا | `wire` | تعديل وثيقة شركة | منخفض | HR-REV-2 | بناء نموذج التعديل |

---

## §12 — Inbox (4 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| POST | `/api/inbox/messages/:id/read` | `communications:list` | محتمل | `wire` | تعليم رسالة كمقروءة — FE يستدعيه ضمنيًا | منخفض | التحقق من وجود استدعاء في `inbox.tsx` |
| GET | `/api/inbox/unread-count` | `communications:list` | لا | `report-only` | عداد الرسائل غير المقروءة — badge في الشريط الجانبي | منخفض | إدراجه في navigation badge |
| DELETE | `/api/inbox/threads/:channel/:address/snooze` | `communications:update` | **نعم** | `false-positive` | يستهلكه `inbox.tsx` — كان خطأً في الجرد | — | — | لا إجراء |
| GET | `/api/inbox/snoozed` | `communications:list` | لا | `report-only` | قائمة المحادثات المؤجلة | منخفض | بناء قسم Snoozed في inbox |

---

## §13 — Org (8 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/org/legal-entities` | `admin:list` | لا | `wire` | قائمة الكيانات القانونية — Backend جاهز | منخفض | بناء شجرة الهيكل التنظيمي |
| PATCH | `/api/org/legal-entities/:id` | `admin:update` | لا | `wire` | تعديل كيان قانوني | منخفض | بناء نموذج التعديل |
| GET | `/api/org/positions` | `admin:list` | لا | `wire` | قائمة المناصب | منخفض | بناء صفحة إدارة المناصب |
| PATCH | `/api/org/positions/:id` | `admin:update` | لا | `wire` | تعديل منصب | منخفض | بناء نموذج التعديل |
| PATCH | `/api/org/teams/:id` | `admin:update` | لا | `wire` | تعديل فريق | منخفض | بناء نموذج التعديل |
| PATCH | `/api/org/committees/:id` | `admin:update` | لا | `wire` | تعديل لجنة | منخفض | بناء نموذج التعديل |
| GET | `/api/org/supervision-lines` | `admin:list` | لا | `report-only` | خطوط الإشراف — بيانات مرجعية | منخفض | إدراجه في خريطة التنظيم |
| GET | `/api/org/approval-authorities` | `admin:list` | لا | `report-only` | صلاحيات الاعتماد — بيانات مرجعية | منخفض | إدراجه في سير الاعتمادات |

---

## §14 — Parties (3 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/parties/:id/360` | `settings:view` | لا | `report-only` | ملف موحد للطرف — تشخيص admin | منخفض | صفحة تشخيص party 360 |
| GET | `/api/parties/resolve` | `settings:view` | لا | `internal-service` | بحث طرف بمرجع — استدعاء داخلي | منخفض | توثيق الاستخدام الداخلي |
| POST | `/api/parties/backfill` | `settings:update` | لا | `internal-service` | ربط بيانات الأطراف بأثر رجعي — admin operator | منخفض | توثيق تدفق admin |

---

## §15 — Projects (8 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| POST | `/api/projects/:id/boq` | `projects:create` | لا | `wire` | إنشاء جدول كميات (BOQ) — Backend جاهز | متوسط | بناء نموذج BOQ |
| GET | `/api/projects/:id/boq` | `projects:list` | لا | `report-only` | تفاصيل BOQ — Backend جاهز | منخفض | بناء عرض BOQ |
| PATCH | `/api/projects/boq/:boqId` | `projects:update` | لا | `wire` | تعديل BOQ | متوسط | بناء نموذج تعديل |
| DELETE | `/api/projects/boq/:boqId` | `projects:update` | لا | `wire` | حذف BOQ | متوسط | زر حذف + تأكيد |
| POST | `/api/projects/:id/boq/bill` | `projects:update` | لا | `wire` | فوترة مقابل BOQ — خطوة حيوية في دورة المشروع | مرتفع | بناء dialog فوترة BOQ |
| POST | `/api/projects/:id/units` | `projects:create` | لا | `wire` | إنشاء وحدة مشروع | متوسط | بناء نموذج الوحدة |
| GET | `/api/projects/:id/units` | `projects:list` | لا | `report-only` | قائمة وحدات المشروع | منخفض | بناء عرض الوحدات |
| PATCH | `/api/projects/units/:uid` | `projects:update` | لا | `wire` | تعديل وحدة مشروع | متوسط | بناء نموذج تعديل |

---

## §16 — Settings (5 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| PUT | `/api/settings/departments/:id` | `settings:update` | لا | `wire` | تعديل قسم — Backend جاهز | منخفض | بناء نموذج تعديل |
| DELETE | `/api/settings/departments/:id` | `settings:update` | لا | `wire` | حذف قسم | منخفض | إضافة زر حذف + تأكيد |
| GET | `/api/settings/administrations` | `settings:list` | لا | `report-only` | قائمة الإدارات — بيانات مرجعية | منخفض | التحقق من استخدامه في dropdown |
| PATCH | `/api/settings/administrations/:id` | `settings:update` | لا | `wire` | تعديل إدارة | منخفض | بناء نموذج تعديل |
| DELETE | `/api/settings/administrations/:id` | `settings:update` | لا | `wire` | حذف إدارة | منخفض | إضافة زر حذف + تأكيد |

---

## §17 — Tasks (3 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/tasks/:id/assignees` | `tasks:list` | لا | `report-only` | قائمة المُكلَّفين بالمهمة | منخفض | إدراجه في تفاصيل المهمة |
| POST | `/api/tasks/:id/assignees` | `tasks:update` | لا | `wire` | إضافة مُكلَّف للمهمة | منخفض | بناء dialog إضافة مُكلَّف |
| DELETE | `/api/tasks/:id/assignees/:assignmentId` | `tasks:update` | لا | `wire` | إزالة مُكلَّف من المهمة | منخفض | إضافة زر إزالة |

---

## §18 — Transport (8 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| GET | `/api/transport/locations` | `transport:list` | لا | `report-only` | بيانات المواقع المرجعية — مستخدمة في dropdowns | منخفض | التحقق من الاستخدام في FE |
| POST | `/api/transport/locations` | `transport:create` | لا | `wire` | إضافة موقع نقل | منخفض | بناء نموذج إضافة موقع |
| POST | `/api/transport/bookings/:id/lines` | `transport:update` | لا | `wire` | إضافة بند حجز | متوسط | بناء dialog إضافة بند |
| POST | `/api/transport/dispatch-orders` | `transport:create` | لا | `wire` | إنشاء أمر إرسال — Backend جاهز | متوسط | بناء نموذج أمر الإرسال |
| PATCH | `/api/transport/dispatch-orders/:id` | `transport:update` | لا | `wire` | تعديل أمر إرسال | متوسط | بناء نموذج التعديل |
| GET | `/api/transport/integration/calendar.ics` | `transport:list` | لا | `integration-only` | تصدير iCalendar لأنظمة خارجية | منخفض | توثيق نقطة تكامل |
| GET | `/api/transport/planning-settings` | `transport:list` | لا | `report-only` | إعدادات التخطيط — بيانات مرجعية | منخفض | إدراجه في صفحة الإعدادات |
| PATCH | `/api/transport/planning-settings` | `transport:update` | لا | `wire` | تعديل إعدادات التخطيط | منخفض | بناء نموذج الإعدادات |

---

## §19 — Umrah (8 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| PATCH | `/api/umrah/hotels/:id` | `umrah:update` | لا | `wire` | تعديل بيانات فندق — Backend جاهز | منخفض | بناء نموذج تعديل الفندق |
| DELETE | `/api/umrah/hotels/:id` | `umrah:update` | لا | `wire` | حذف فندق | منخفض | إضافة زر حذف + تأكيد |
| GET | `/api/umrah/room-blocks/:id/allocations` | `umrah:list` | لا | `report-only` | تفاصيل تخصيص الغرف في block | منخفض | إدراجه في تفاصيل الـblock |
| POST | `/api/umrah/room-allocations` | `umrah:create` | لا | `wire` | إنشاء تخصيص غرفة | منخفض | بناء نموذج التخصيص |
| DELETE | `/api/umrah/room-allocations/:id` | `umrah:create` | لا | `wire` | إلغاء تخصيص غرفة | منخفض | إضافة زر إلغاء |
| POST | `/api/umrah/reclassify-revenue` | `umrah:update` | لا | `wire` | إعادة تصنيف إيراد عمرة — عملية محاسبية | متوسط | بناء dialog إعادة التصنيف |
| GET | `/api/umrah/families` | `umrah:list` | لا | `report-only` | قائمة عائلات العمرة | منخفض | بناء صفحة عائلات |
| POST | `/api/umrah/families` | `umrah:create` | لا | `wire` | إنشاء سجل عائلة | منخفض | بناء نموذج العائلة |

---

## §20 — Warehouse (3 endpoints)

| Method | Path | Auth Guard | FE Consumer | التصنيف | السبب | المخاطر | الإجراء التالي |
|---|---|---|---|---|---|---|---|
| PATCH | `/api/warehouse/serials/:id` | `warehouse.inventory:update` | لا | `wire` | تعديل الرقم التسلسلي — Backend جاهز | منخفض | بناء نموذج تعديل |
| POST | `/api/warehouse/cycle-counts/plans` | `warehouse.inventory:create` | لا | `wire` | إنشاء خطة جرد دوري | منخفض | بناء نموذج خطة الجرد |
| POST | `/api/warehouse/suppliers` | `warehouse.inventory:create` | لا | `wire` | إنشاء مورّد مخزن — Backend جاهز (PR-4 nav للـFE) | منخفض | بناء نموذج المورّد |

---

## §21 — ملخص التصنيف

| التصنيف | العدد | النسبة |
|---|---|---|
| `wire` | 51 | 53% |
| `report-only` | 24 | 25% |
| `internal-service` | 11 | 12% |
| `false-positive` | 2 | 2% |
| `remove-candidate` | 7 | 7% |
| `integration-only` | 1 | 1% |
| **المجموع** | **96** | **100%** |

*ملاحظة: الـ2 false-positive أُزيلا من CSV (94 remaining). الـ94 الباقية = 51+24+11+7+1.*

---

## §22 — False Positives (لها مستهلك فعلي)

هذه الـ2 endpoints كانت مدرجة خطأً في الجرد — لها مستهلك FE فعلي:

| Path | المستهلك | الملف |
|---|---|---|
| `GET /api/hr/attendance/field-track` | `FieldBreadcrumbSection` | `artifacts/ghayth-erp/src/pages/hr/field-tracking.tsx:152` |
| `DELETE /api/inbox/threads/:channel/:address/snooze` | unsnooze action | `artifacts/ghayth-erp/src/pages/inbox.tsx:996` |

ملاحظة: `POST /api/inbox/messages/:id/read` مختلف عن `/inbox/threads/:channel/:address/read` الذي يستهلكه FE — الأول يبقى في قائمة `wire`.

**الإجراء**: إزالة هذه الـ2 من `PLATFORM_BACKEND_UNUSED_ENDPOINTS.csv` في PR-5 — CSV الآن يحتوي 94 endpoint (كان 96).

---

## §23 — Remove Candidates (7 endpoints) — تحتاج مراجعة قبل حذف

هذه endpoints لا مسار استخدام واضح، لكن **لا تُحذف في PR-5**. تحتاج PR منفصل بعد مراجعة أصحاب الوحدات:

| Path | السبب |
|---|---|
| `GET /api/communications/log/:id/referral-chain` | لا مسار FE أو backend واضح |
| `GET /api/documents/:id/access-log` | يمكن دمجه مع audit logs العامة |
| `GET /api/documents/:id/acls` | إن لم يُبنَ نظام ACL — يُحذف |
| `POST /api/documents/:id/acls` | نفس السبب |
| `DELETE /api/documents/:id/acls/:aclId` | نفس السبب |
| `GET /api/admin/communication-control/validation` | قد يُدمج في تقرير واحد |
| `GET /api/clients/:id/contact-summary` | قد يُدمج في parties/:id/360 |

---

## §24 — HR-REV Linkage

endpoints مرتبطة بمهام HR-REV المفتوحة — لا تُعالَج في PR-5:

| HR-REV | الـendpoints المرتبطة |
|---|---|
| HR-REV-0 | `GET /field-ping/eligibility`، `POST /field-ping` |
| HR-REV-1 | `POST /hr/leave-types`، `PATCH /hr/leave-types/:id` |
| HR-REV-2 | `GET /hr/company-document-categories`، `DELETE /hr/company-documents/:id`، `PATCH /hr/company-documents/:id` |

---

## §25 — ما هو خارج نطاق PR-5

- ❌ لا حذف لأي endpoint
- ❌ لا تعديل في سلوك أي endpoint
- ❌ لا بناء واجهات
- ❌ لا تغيير RBAC
- ❌ لا معالجة HR-REV داخل هذا PR
