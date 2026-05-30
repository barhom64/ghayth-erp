# فهرس الكيانات — ENTITY_CATALOG

> **النوع:** جرد ثابت — المرحلة 1 من **Ghaith Operating Foundation** (Issue #1418).
> **التاريخ:** 2026-05-29 · **الفرع:** `claude/ghaith-foundation-audit-wdIUf`
> **القاعدة:** كل كيان له **مسار مالك** و**دورة حياة** و**أثر**. هذا الفهرس يرصد الموجود؛ مصفوفات الملكية والقرار والأثر تُفصَّل في المرحلة 2.
> **مصادر يُبنى عليها (لا تُكرَّر):** `lib/db/src/schema/index.ts` (Drizzle) · `lib/dbTypes.ts` · `lib/entityRegistry.ts` (61 كيانًا تشغيليًا) · `docs/entity-action-matrix.md` · `docs/system-master-registry.md` · `docs/audit/inventory/*.md`.

---

## 0. الغرض

غيث منصة متعددة المسارات؛ كل بيان فيه "كيان" يملكه مسار واحد وله دورة حياة وأثر. هذا الفهرس يجيب: ما الكيانات؟ من يملكها؟ هل لها دورة حياة؟ هل لها أثر مالي؟ ما الخدمات المشتركة التي تستهلكها؟ — كأساس لمصفوفات المرحلة 2 (`ENTITY_OWNERSHIP_MATRIX`, `ENTITY_LIFECYCLE_CATALOG`, `IMPACT_CATALOG`).

---

## 1. مصدر المخطط والأرقام

| المقياس | القيمة | المصدر |
|---|---|---|
| مخطط Drizzle الأساسي | `lib/db/src/schema/index.ts` (~27 جدول نواة) | تحقق وكيل |
| أسماء أنواع الصفوف | `lib/dbTypes.ts` | تحقق وكيل |
| الكيانات التشغيلية المُعلَنة | **61** (`entityRegistry.ts`) — ملف تعريف تشغيلي (طباعة/اعتماد/دورة حياة) | تحقق وكيل |
| تقدير إجمالي الجداول (نواة + مهاجرات) | **~200+** | المهاجرات `src/migrations/` (164 مُطبَّق) |
| المهاجرات المُطبَّقة فعليًا | 164 (`src/migrations/`) — المجلد العلوي (93) **غير مُطبَّق/ميت** (FND-001) | `docs/audit/inventory/SCOPE_MAP.md:118-119` |

> **تنبيه دقة:** الأعداد التفصيلية مأخوذة من استكشاف الوكيل وتقارير الجرد السابقة؛ ما يحتاج عدًّا دقيقًا للأعمدة يُحال إلى المخطط الفعلي. هذا فهرس، لا مرجع أعمدة.

---

## 2. الكيانات حسب المسار المالك

> العمود "أثر مالي" = هل ينشئ قيد GL (نمط Finance-first الحاجز)؟ "دورة حياة" = هل له عمود status متعدد المراحل؟

### 2.1 الأساس / العرضي (Foundation)
المالك: الطبقة العرضية. **لا أثر GL مباشر** (لكنها شرط لكل شيء).

| الكيان | دورة حياة | ملاحظة |
|---|---|---|
| `companies`, `branches`, `departments`, `positions` | status (active/inactive) | الهيكل التنظيمي؛ يُزرَع عبر `companyBootstrap()` عند إنشاء الشركة |
| `employees`, `employee_assignments` | active/terminated | الشخص التشغيلي (#1413: الموظف هو الأصل) |
| `users`, `rbac_user_roles`, `rbac_roles`, `rbac_role_grants` | active/inactive | حساب الدخول + الأدوار (انظر `RBAC_EXISTING_ASSETS_AUDIT.md`) |
| `numbering_schemes/counters/assignments` | active | مركز الترقيم المقفول (`docs/architecture/numbering-center.md`) |

### 2.2 الموارد البشرية (HR)
| الكيان | دورة حياة | أثر مالي |
|---|---|---|
| `employee_contracts`, `salary_history`, `employee_salary_components` | active/expired | — |
| `hrLeaveRequests`, `hrLeaveBalances` | pending→approved/rejected | — |
| `attendance`, `shifts` | — | — |
| `payrollRuns`, `payrollLines` | draft→posted | **نعم** (راتب ذرّي → GL) |
| `employeeViolations`, `hr_inquiry_memos` (تأديب) | pending_inquiry→…→decision→appeal | جزئي (خصومات) |
| `exit_requests`, `hr_employee_loans`, `hr_overtime` | pending→approved | جزئي |

### 2.3 المالية والمحاسبة (Finance) — **حاجزة لكل المعاملات**
| الكيان | دورة حياة | أثر مالي |
|---|---|---|
| `journalEntries`, `journalLines`, `chartOfAccounts` | draft→posted→reversed/failed | **المصدر** |
| `invoices`, `credit_memos`, `debit_memos` | draft→posted→paid | **نعم** (DR AR / CR Revenue + VAT) |
| `purchase_requests`, `purchase_orders`, `suppliers`, `vendor_contracts` | draft→approved→posted | **نعم** |
| `budgets`, `cost_centers`, `payment_vouchers`, `expense_claims`, `salary_advances`, `customer_advances` | متعدد | **نعم** |
| `financial_posting_failures`, `bank_statements`, `recurring_journals` | — | تدقيق فشل GL |

### 2.4 النقل / الأسطول (Fleet)
| الكيان | دورة حياة | أثر مالي |
|---|---|---|
| `fleet_vehicles`, `fleet_drivers` | available/on_trip/maintenance | — |
| `fleet_trips` | in_progress→completed/cancelled | **نعم** (إغلاق الرحلة → قيد 4 أسطر) |
| `fleet_fuel_logs`, `fleet_maintenance`, `fleet_preventive_plans` | — | نعم (⚠️ عيب احتمال ازدواج عدّ الوقود — يحتاج تحقق) |
| `fleet_traffic_violations`, `fleet_insurance`, `fleet_gps_tracking`, `fleet_alerts` | متعدد | جزئي |

### 2.5 العمرة (Umrah)
| الكيان | دورة حياة | أثر مالي |
|---|---|---|
| `umrah_seasons`, `umrah_groups`, `umrah_agents`, `umrah_sub_agents` | draft→active | — |
| `umrah_sales_invoices`, `umrah_agent_invoices`, `umrah_payments` | draft→posted→paid→settled | **نعم** (GL-حاجز + أبعاد agentId/seasonId) |
| `umrah_pricing`, `umrah_penalties`, `umrah_violations`, `umrah_pilgrim_lists`, `employee_commission_calculations` | متعدد | نعم (العمولة تُحسب بعد الرواتب) |

### 2.6 العقارات (Properties)
| الكيان | دورة حياة | أثر مالي |
|---|---|---|
| `property_buildings`, `property_units`, `property_owners` | vacant/rented/maintenance | — |
| `rental_contracts`, `contract_payment_schedule` | draft→active→expired/terminated | **نعم** (التوقيع → جدول → GL) |
| `rent_payments`, `property_owner_payouts`, `maintenance_requests`, `late_rent_actions` | متعدد | **نعم** (DR Cash / CR AR) |

### 2.7 القانوني (Legal)
| الكيان | دورة حياة | أثر مالي |
|---|---|---|
| `legal_cases`, `legal_sessions` | pending→scheduled→completed/closed | — |
| `legal_judgments`, `legal_judgment_appeals` | issued→appealed | **نعم** (حكم بمبلغ → قيد تسوية) |
| `legal_contracts`, `legal_correspondence` | متعدد | جزئي |

### 2.8 العلاقات (CRM) والدعم (Support)
| الكيان | دورة حياة | أثر مالي |
|---|---|---|
| `clients`, `crm_opportunities`, `client_rfm_scores`, `client_portal_accounts` | active/won/lost/blacklisted | عند الفوز → فاتورة |
| `support_tickets`, `sla_definitions`, `ticket_csat_ratings` | open→in_progress→resolved→closed | — (SLA + تصعيد) |

### 2.9 المستودعات (Warehouse)
| الكيان | دورة حياة | أثر مالي |
|---|---|---|
| `products`, `warehouse_stock_lots`, `warehouse_stock_serials` | active/obsolete/reorder | **نعم** (تقييم مخزون → GL) |
| `warehouse_cycle_counts(_lines)`, `product_abc_classification`, `warehouse_movements` | متعدد | نعم |

### 2.10 الوثائق والاتصالات (Documents & Communications)
| الكيان | دورة حياة | ملاحظة |
|---|---|---|
| `documents`, `document_entity_links`, `document_versions`, `document_folders` | draft/active/archived | **خدمة مشتركة** (entityType+entityId) |
| `employee_documents`, `umrah_attachments` | — | ⚠️ تكرار مرفقات لكل مسار (انظر `CORE_SERVICES_INVENTORY` DOC-VIOLATION) |
| `message_log`, `outbound_queue`, `mailbox_accounts`, `pbx_*`, `digital_signature_logs` | متعدد | توحيد الاتصالات (`communications-unification.md`) |

---

## 3. أنماط دورة الحياة (موجزة)

النمط القياسي العابر للمسارات: `draft → submitted → approved → posted → [completed/reversed/cancelled/failed]`.

أنماط خاصة موثّقة في المخططات (`docs/blueprints/*`):
- **إجازة HR:** pending → approved/rejected.
- **تأديب HR:** pending_inquiry → justified → recommendation → gm_decision → appeal → completed/dismissed (5 مراحل).
- **عقد عقاري:** draft → active → expired/terminated (آلة حالة تمنع وحدتين نشطتين على نفس الوحدة).
- **فاتورة عمرة:** draft → posted (حاجز GL) → paid → settled.
- **رحلة أسطول:** in_progress → completed (تجميع التكلفة عند الحالة النهائية).
- **قضية قانونية:** pending → scheduled → completed → appealed → closed.

التفصيل الكامل لكل دورة → المرحلة 2: `ENTITY_LIFECYCLE_CATALOG.md`.

---

## 4. خريطة الكيان ↔ الخدمات المشتركة (موجزة)

كل كيان تقريبًا يستهلك خدمات مشتركة عبر نمط `entityType + entityId` (لا نسخ لكل مسار — انظر `CORE_SERVICES_INVENTORY`):

| الخدمة | يستهلكها |
|---|---|
| التدقيق `audit_logs` | كل الكيانات (إلزامي عبر `createAuditLog`) |
| الأحداث `event_outbox` | كل الكيانات (`eventBus.emit`) |
| التعليقات `entity_comments` | كل الكيانات (مكوّن `EntityComments`) |
| الوثائق `documents` | كل الكيانات (عدا تكرار umrah/employee) |
| المهام `tasks` | كل الكيانات (`linkedEntityType/Id`) |
| الإشعارات `notifications` | كل الكيانات |
| الترقيم `numbering_assignments` | الكيانات الرسمية (فواتير/عقود/قيود…) |
| الاعتماد `approval_actions` | الكيانات القابلة للاعتماد |
| الطباعة/التصدير | الكيانات ذات المستندات |

---

## 5. الملاحظات والقرارات (جرد لا تنفيذ)

- **كل مسار يملك كياناته بوضوح** — لا تكرار كيانات أعمال بين المسارات (جيد، أساس صلب لمصفوفة الملكية).
- **استثناء التكرار الوحيد:** مرفقات `umrah_attachments` و`employee_documents` تتوازى مع `documents` المشتركة → يُدمَج (يُفصَّل في `CORE_SERVICES_INVENTORY`).
- **المجلد الميت `migrations/` العلوي (93 ملفًا)** — يُرصد للحذف بعد توثيق (FND-001)، لا يؤثر على الكيانات الحيّة.
- **يحتاج تحقق تشغيلي:** عيب ازدواج عدّ الوقود في إغلاق الرحلة (مذكور في تقارير الجرد) — يُتحقَّق في مرحلة الاختبار 7.

**المرحلة التالية (2):** `ENTITY_OWNERSHIP_MATRIX` · `ENTITY_LIFECYCLE_CATALOG` · `IMPACT_CATALOG` تبني فوق هذا الفهرس.
</content>
