# جرد المسار — العمرة (Umrah)

جردٌ ثابتٌ مستقلٌّ لوحدة العمرة في نظام غيث — يفحص كل صفحة وزر وendpoint مقابل الكود والمخطط والـ Zod schemas، ويتحقق من حالة الثغرات الخمس الحرجة C1–C5 والثغرات المتوسطة M1–M12 بعد دمج 7 طلبات سحب (PR #757, #759, #760, #761, #764, #766, #768). الحكم العام: **الوحدة حقيقية ومتصلة، ومعظم الكسور التي رصدها التقرير الوظيفي السابق (2026-05-21) أُصلحت فعليًا** — والتقرير السابق أصبح **مُتقادمًا (stale)** على النقاط C1/C2/C3/C4/C5/M1/M6/M8/M11. التدقيق يوثّق هذا الخلاف صراحةً في القسم الأخير.

---

## جدول 1 — الصفحات (Pages)

| المعرّف | route | الملف | الحالة | APIs المستدعاة | عيب رئيسي |
|---|---|---|---|---|---|
| P-01 | `/umrah` | `pages/umrah/dashboard.tsx` | شغّال | `GET /umrah/dashboard` | — |
| P-02 | `/umrah/pilgrims` | `pages/umrah/pilgrims.tsx` | شغّال | `GET /umrah/pilgrims` | — |
| P-03 | `/umrah/pilgrims/create` | `pages/umrah/pilgrim-create.tsx` | ناقص | `POST /umrah/pilgrims` | مرفقات `FileDropZone` تُلتقط ولا تُرفع (UMR-009) |
| P-04 | `/umrah/pilgrims/:id` | `pages/umrah/pilgrim-detail.tsx` | شغّال | `GET/PATCH /umrah/pilgrims/:id` | — |
| P-05 | `/umrah/agents` | `pages/umrah/agents.tsx` | شغّال | `GET/POST /umrah/agents`, `PATCH/DELETE /umrah/agents/:id` | — |
| P-06 | `/umrah/agents/:id` | `pages/details/umrah-agent-detail.tsx` | شغّال | `GET /umrah/agents/:id` | — |
| P-07 | `/umrah/seasons` | `pages/umrah/seasons.tsx` | شغّال | `GET/POST /umrah/seasons` | — |
| P-08 | `/umrah/seasons/:id` | `pages/details/umrah-season-detail.tsx` | ناقص | `GET/PATCH /umrah/seasons/:id`, `DELETE /umrah/seasons/:id` (مفقود) | زر الحذف يستدعي endpoint غير موجود (UMR-001) |
| P-09 | `/umrah/penalties` | `pages/umrah/penalties.tsx` | شغّال | `GET /umrah/penalties`, `POST /umrah/run-penalty-engine`, `PATCH /umrah/penalties/:id/waive`, `POST /umrah/penalties/waive-bulk` | — |
| P-10 | `/umrah/penalties/:id` | `pages/details/umrah-penalty-detail.tsx` | شغّال | `GET /umrah/penalties/:id` | — |
| P-11 | `/umrah/invoices` | `pages/umrah/invoices.tsx` | شغّال | `GET /umrah/agent-invoices`, `POST /umrah/agent-invoices/generate` | لا زر تعديل/حذف لفاتورة الوكيل (UMR-013) |
| P-12 | `/umrah/invoices/:id` | `pages/details/umrah-invoice-detail.tsx` | شغّال | `GET /umrah/agent-invoices/:id` | — (كان C2؛ أُصلح) |
| P-13 | `/umrah/packages` | `pages/umrah/packages.tsx` | شغّال | `GET/POST /umrah/packages`, `PATCH/DELETE /umrah/packages/:id` | — |
| P-14 | `/umrah/packages/:id` | `pages/details/umrah-package-detail.tsx` | ناقص | `GET /umrah/packages/:id` | حقول `hotelStars/transportType` بلا عمود مقابل (UMR-008) |
| P-15 | `/umrah/transport` | `pages/umrah/transport.tsx` | شغّال | `GET/POST /umrah/transport` | — |
| P-16 | `/umrah/transport/:id` | `pages/details/umrah-transport-detail.tsx` | ناقص | `GET /umrah/transport/:id` | يعرض المعتمرين فقط؛ لا واجهة لاستدعاء `assign-pilgrims` (UMR-002) |
| P-17 | `/umrah/import` | `pages/umrah/import-wizard.tsx` | شغّال | `POST /umrah/import/preview`, `/import/mutamers`, `/import/vouchers` | — |
| P-18 | `/umrah/import/legacy` | `pages/umrah/import.tsx` | شغّال | `POST /umrah/import` | صفحة قديمة موازية (UMR-014) |
| P-19 | `/umrah/sub-agents` | `pages/umrah/sub-agents.tsx` | شغّال | `GET/POST /umrah/sub-agents` + link/unlinked | — |
| P-20 | `/umrah/sub-agents/:id` | `pages/details/umrah-sub-agent-detail.tsx` | شغّال | `GET /umrah/sub-agents/:id` | — |
| P-21 | `/umrah/pricing` | `pages/umrah/pricing.tsx` | شغّال | `GET/POST/PATCH/DELETE /umrah/pricing` | — |
| P-22 | `/umrah/sales-wizard` | `pages/umrah/sales-wizard.tsx` | شغّال | `GET /umrah/sales-wizard/uninvoiced-groups`, `POST /umrah/invoices/generate` | — |
| P-23 | `/umrah/commission-plans` | `pages/umrah/commission-plans.tsx` | شغّال | `GET /umrah/commission-plans` | — (أزرار activate/suspend/delete أُزيلت بـ #759) |
| P-24 | `/umrah/commission-plans/new` + `/:id/edit` | `pages/umrah/commission-plan-editor.tsx` | شغّال | `GET/POST/PATCH /umrah/commission-plans`, `POST /:id/simulate`, `GET /employees/:id/assignments` | `POST /commission-plans/:id/calculate` غير مستدعى (UMR-015) |
| P-25 | `/umrah/violations` | `pages/umrah/violations.tsx` | شغّال | `GET/POST/PATCH/DELETE /umrah/violations` | — (الرابط أُصلح بـ #759) |
| P-26 | `/umrah/violations/create` | `pages/umrah/violation-create.tsx` | شغّال | `POST /umrah/violations` | — |
| P-27 | `/umrah/violations/:id` | `pages/details/umrah-violation-detail.tsx` | شغّال | `GET/PATCH/DELETE /umrah/violations/:id` | — |
| P-28 | `/umrah/daily-runsheet` | `pages/umrah/daily-runsheet.tsx` | شغّال | `GET /umrah/reports/daily-runsheet(+/pdf)` | — |
| P-29 | `/umrah/reconciliation` | `pages/umrah/reconciliation.tsx` | ناقص | `GET /umrah/reports/reconciliation` | لا تمرّر `seasonId` رغم دعم الـ backend له (UMR-010) |
| P-30 | `/umrah/groups` | `pages/umrah/groups.tsx` | شغّال | `GET /umrah/groups`, `POST /umrah/groups/:id/split`, `POST /umrah/groups/merge`, `GET /umrah/pilgrims?groupId=` | — |
| P-31 | `/umrah/attachments` | `pages/umrah/attachments.tsx` | شغّال | `GET /umrah/attachments` | — |

لا توجد صفحة واحدة تعتمد بيانات وهمية mock — كل الصفحات موصولة بـ `apiFetch`/`useApiQuery`.

---

## جدول 2 — الأزرار والإجراءات (Actions)

| الصفحة الأم | اسم الزر | الإجراء المتوقّع | API المستهدف | الحالة | نوع العيب |
|---|---|---|---|---|---|
| seasons | إنشاء موسم | إضافة موسم | `POST /umrah/seasons` | شغّال | — |
| umrah-season-detail | حذف الموسم | حذف الموسم | `DELETE /umrah/seasons/:id` | مكسور | dead |
| umrah-season-detail | تعديل | تعديل inline | `PATCH /umrah/seasons/:id` | شغّال | — |
| agents | إنشاء/تعديل/حذف وكيل | CRUD | `POST/PATCH/DELETE /umrah/agents` | شغّال | — |
| packages | إنشاء/تعديل/حذف باقة | CRUD | `POST/PATCH/DELETE /umrah/packages` | شغّال | — |
| pilgrim-create | حفظ | إنشاء معتمر + رفع مرفقات | `POST /umrah/pilgrims` | ناقص | dead |
| pilgrim-detail | تغيير الحالة | نقل دورة الحياة | `PATCH /umrah/pilgrims/:id` | شغّال | — |
| penalties | تشغيل محرك الغرامات | إنشاء غرامات overstay | `POST /umrah/run-penalty-engine` | شغّال | — |
| penalties | إعفاء / إعفاء جماعي | waive | `PATCH /penalties/:id/waive`, `POST /penalties/waive-bulk` | شغّال | — |
| invoices | توليد فاتورة وكيل | إنشاء فاتورة بحالة `sent` | `POST /umrah/agent-invoices/generate` | شغّال | — |
| invoices | النقر على صف | فتح تفاصيل الفاتورة | `GET /umrah/agent-invoices/:id` | شغّال | — |
| transport | إنشاء رحلة | إضافة رحلة نقل | `POST /umrah/transport` | شغّال | — |
| transport-detail | (لا يوجد) إسناد معتمرين | ربط معتمرين بالرحلة | `POST /umrah/transport/:id/assign-pilgrims` | مكسور | dead |
| groups | تقسيم / دمج | split/merge | `POST /umrah/groups/:id/split`, `/groups/merge` | شغّال | — |
| sales-wizard | توليد فاتورة مبيعات | إنشاء فاتورة مبيعات | `POST /umrah/invoices/generate` | شغّال | — |
| commission-plan-editor | محاكاة | حساب تجريبي | `POST /umrah/commission-plans/:id/simulate` | شغّال | — |
| commission-plan-editor | (لا يوجد) احتساب فعلي | ترحيل العمولة + GL | `POST /umrah/commission-plans/:id/calculate` | مكسور | dead |
| violations | إنشاء/تعديل/حذف مخالفة | CRUD | `POST/PATCH/DELETE /umrah/violations` | شغّال | — |
| violations | النقر على صف | فتح تفاصيل المخالفة | `GET /umrah/violations/:id` | شغّال | — |
| import-wizard | استيراد معتمرين/قسائم | NUSK import | `POST /umrah/import/mutamers`, `/import/vouchers` | شغّال | — |
| reconciliation | (لا يوجد) فلتر الموسم | تصفية حسب الموسم | `GET /umrah/reports/reconciliation?seasonId=` | ناقص | dead |
| daily-runsheet | تحميل PDF | تنزيل كشف اليوم | `GET /umrah/reports/daily-runsheet/pdf` | شغّال | — |

---

## جدول 3 — APIs

| Endpoint | Method | الـ handler | الـ schema | UI المستهلكة | الجدول الأساسي | الحالة | عيب |
|---|---|---|---|---|---|---|---|
| `/umrah/seasons` | GET | umrah.ts:335 | — | seasons.tsx | umrah_seasons | شغّال | — |
| `/umrah/seasons/:id` | GET | umrah.ts:343 | — | umrah-season-detail | umrah_seasons | شغّال | — |
| `/umrah/seasons` | POST | umrah.ts:356 | createSeasonSchema | seasons.tsx | umrah_seasons | شغّال | — |
| `/umrah/seasons/:id` | PATCH | umrah.ts:371 | patchSeasonSchema | umrah-season-detail | umrah_seasons | شغّال | فحص الانتقال بخريطة محلية لا STATE_MACHINE |
| `/umrah/seasons/:id` | DELETE | — | — | umrah-season-detail | umrah_seasons | مكسور | endpoint غير موجود (UMR-001) |
| `/umrah/agents` | GET | umrah.ts:429 | — | agents.tsx | umrah_agents | شغّال | — |
| `/umrah/agents/:id` | GET | umrah.ts:437 | — | umrah-agent-detail | umrah_agents | شغّال | — |
| `/umrah/agents` | POST | umrah.ts:453 | createAgentSchema | agents.tsx | umrah_agents | شغّال | — |
| `/umrah/agents/:id` | PATCH | umrah.ts:468 | patchAgentSchema | agents.tsx | umrah_agents | شغّال | — |
| `/umrah/agents/:id` | DELETE | umrah.ts:506 | — | agents.tsx | umrah_agents | شغّال | يمنع الحذف عند ارتباط معتمرين |
| `/umrah/packages` | GET | umrah.ts:523 | — | packages.tsx | umrah_packages | شغّال | — |
| `/umrah/packages/:id` | GET | umrah.ts:547 | — | umrah-package-detail | umrah_packages | شغّال | — |
| `/umrah/packages` | POST | umrah.ts:531 | createPackageSchema | packages.tsx | umrah_packages | شغّال | — |
| `/umrah/packages/:id` | PATCH | umrah.ts:566 | patchPackageSchema | packages.tsx | umrah_packages | شغّال | — |
| `/umrah/packages/:id` | DELETE | umrah.ts:588 | — | packages.tsx | umrah_packages | شغّال | يمرّ عبر applyTransition |
| `/umrah/pilgrims` | GET | umrah.ts:610 | — | pilgrims.tsx | umrah_pilgrims | شغّال | — |
| `/umrah/pilgrims` | POST | umrah.ts:646 | createPilgrimSchema | pilgrim-create | umrah_pilgrims | شغّال | — |
| `/umrah/pilgrims/:id` | GET | umrah.ts:804 | — | pilgrim-detail | umrah_pilgrims | شغّال | — |
| `/umrah/pilgrims/:id` | PATCH | umrah.ts:730 | patchPilgrimSchema | pilgrim-detail | umrah_pilgrims | شغّال | — |
| `/umrah/pilgrims/:id` | DELETE | umrah.ts:823 | — | pilgrims.tsx | umrah_pilgrims | شغّال | — |
| `/umrah/import/preview` | POST | umrah.ts:844 | importPreviewSchema | import-wizard | umrah_pilgrims | شغّال | — |
| `/umrah/import/mutamers` | POST | umrah.ts:875 | importMutamersSchema | import-wizard | umrah_pilgrims | شغّال | لا audit/event مستقل (يعتمد doImport) |
| `/umrah/import/vouchers` | POST | umrah.ts:887 | importVouchersSchema | import-wizard | umrah_nusk_invoices | شغّال | GL عبر confirmVouchersImport |
| `/umrah/import` | POST | umrah.ts:988 | importSchema | import.tsx (legacy) | umrah_pilgrims | شغّال | — |
| `/umrah/dashboard` | GET | umrah.ts:996 | — | dashboard.tsx | umrah_pilgrims | شغّال | — |
| `/umrah/run-daily-status` | POST | umrah.ts:1048 | — | (cron + يدوي) | umrah_pilgrims | شغّال | — |
| `/umrah/run-penalty-engine` | POST | umrah.ts:1110 | runPenaltyEngineSchema | penalties.tsx | umrah_penalties + umrah_violations | شغّال | يربط violations بالغرامة (C3) |
| `/umrah/penalties` | GET | umrah.ts:1180 | — | penalties.tsx | umrah_penalties | شغّال | — |
| `/umrah/penalties/:id` | GET | umrah.ts:1199 | — | umrah-penalty-detail | umrah_penalties | شغّال | — |
| `/umrah/penalties/:id/waive` | PATCH | umrah.ts:1216 | waivePenaltySchema | penalties.tsx | umrah_penalties | شغّال | — |
| `/umrah/penalties/waive-bulk` | POST | umrah.ts:1257 | bulkWaivePenaltiesSchema | penalties.tsx | umrah_penalties | شغّال | — |
| `/umrah/penalties` | POST | umrah.ts:1865 | createPenaltySchema | (لا واجهة قائمة مباشرة) | umrah_penalties | شغّال | إنشاء يدوي |
| `/umrah/agent-invoices` | GET | umrah.ts:1451 | — | invoices.tsx | umrah_agent_invoices | شغّال | — |
| `/umrah/agent-invoices/:id` | GET | umrah.ts:1470 | — | umrah-invoice-detail | umrah_agent_invoices | شغّال | — |
| `/umrah/agent-invoices/generate` | POST | umrah.ts:1358 | generateInvoiceSchema | invoices.tsx | umrah_agent_invoices | شغّال | يُنشئ بحالة `sent` (C1 مُصلح) |
| `/umrah/agent-invoices/:id/record-payment` | POST | umrah.ts:1327 | recordPaymentSchema | (لا واجهة) | umrah_agent_invoices | ناقص | لا واجهة تستدعيه (UMR-003) |
| `/umrah/transport` | GET | umrah.ts:1496 | — | transport.tsx | umrah_transport | شغّال | — |
| `/umrah/transport/:id` | GET | umrah.ts:1511 | — | umrah-transport-detail | umrah_transport + umrah_transport_pilgrims | شغّال | المعتمرون من join (C4 مُصلح) |
| `/umrah/transport` | POST | umrah.ts:1556 | createTransportSchema | transport.tsx | umrah_transport | شغّال | — |
| `/umrah/transport/:id` | PATCH | umrah.ts:1608 | patchTransportSchema | umrah-transport-detail | umrah_transport | شغّال | — |
| `/umrah/transport/:id` | DELETE | umrah.ts:1540 | — | umrah-transport-detail | umrah_transport | شغّال | — |
| `/umrah/transport/:id/assign-pilgrims` | POST | umrah.ts:1670 | assignPilgrimsSchema | (لا واجهة) | umrah_transport_pilgrims | ناقص | لا واجهة تستدعيه (UMR-002) |
| `/umrah/import-logs` | GET | umrah.ts:1723 | — | import-wizard | umrah_import_logs | شغّال | — |
| `/umrah/unassigned` | GET | umrah.ts:1731 | — | (لا واجهة) | umrah_pilgrims | ناقص | سطح غير مكشوف (UMR-004) |
| `/umrah/assign-bulk` | POST | umrah.ts:1743 | bulkAssignSchema | (لا واجهة) | umrah_pilgrims | ناقص | سطح غير مكشوف (UMR-004) |
| `/umrah/violations` | GET | umrah.ts:1762 | — | violations.tsx | umrah_violations | شغّال | — |
| `/umrah/violations/:id` | GET | umrah.ts:1782 | — | umrah-violation-detail | umrah_violations | شغّال | — |
| `/umrah/violations` | POST | umrah.ts:1803 | createViolationSchema | violations.tsx, violation-create | umrah_violations | شغّال | status مُقيّد بـ enum |
| `/umrah/violations/:id` | PATCH | umrah.ts:1818 | patchViolationSchema | violations.tsx | umrah_violations | شغّال | يكتب audit + event (M6 مُصلح) |
| `/umrah/violations/:id` | DELETE | umrah.ts:1846 | — | violations.tsx | umrah_violations | شغّال | — |
| `/umrah/sub-agents` | GET | umrah-entities.ts:204 | — | sub-agents.tsx | umrah_sub_agents | شغّال | — |
| `/umrah/sub-agents/:id` | GET | umrah-entities.ts:246 | — | umrah-sub-agent-detail | umrah_sub_agents | شغّال | — |
| `/umrah/sub-agents/unlinked` | GET | umrah-entities.ts:263 | — | sub-agents.tsx | umrah_sub_agents | شغّال | فلتر seasonId كود ميّت (UMR-011) |
| `/umrah/sub-agents` | POST | umrah-entities.ts:221 | createSubAgentSchema | sub-agents.tsx | umrah_sub_agents | شغّال | — |
| `/umrah/sub-agents/:id` | PATCH | umrah-entities.ts:293 | updateSubAgentSchema | sub-agents.tsx | umrah_sub_agents | شغّال | — |
| `/umrah/sub-agents/:id` | DELETE | umrah-entities.ts:317 | — | sub-agents.tsx | umrah_sub_agents | شغّال | — |
| `/umrah/sub-agents/:id/link` | PUT | umrah-entities.ts:332 | linkSubAgentSchema | sub-agents.tsx | umrah_sub_agents | شغّال | — |
| `/umrah/sub-agents/link-by-nusk` | POST | umrah-entities.ts:382 | linkByNuskSchema | sub-agents.tsx | umrah_sub_agents | شغّال | — |
| `/umrah/sub-agents/:id/link-client` | POST | umrah-entities.ts:403 | linkClientSchema | sub-agents.tsx | umrah_sub_agents | شغّال | — |
| `/umrah/pricing` | GET | umrah-entities.ts:430 | — | pricing.tsx | umrah_pricing | شغّال | — |
| `/umrah/pricing` | POST | umrah-entities.ts:448 | createPricingSchema | pricing.tsx | umrah_pricing | شغّال | فحص تداخل الفترات |
| `/umrah/pricing/:id` | PATCH | umrah-entities.ts:479 | updatePricingSchema | pricing.tsx | umrah_pricing | شغّال | — |
| `/umrah/pricing/:id` | DELETE | umrah-entities.ts:524 | — | pricing.tsx | umrah_pricing | شغّال | — |
| `/umrah/groups` | GET | umrah-entities.ts:542 | — | groups.tsx | umrah_groups | شغّال | — |
| `/umrah/groups/:id` | GET | umrah-entities.ts:583 | — | groups.tsx | umrah_groups | شغّال | — |
| `/umrah/groups` | POST | umrah-entities.ts:605 | createGroupSchema | groups.tsx | umrah_groups | شغّال | — |
| `/umrah/groups/:id` | PATCH | umrah-entities.ts:621 | patchGroupSchema | groups.tsx | umrah_groups | شغّال | لا يصدر event (UMR-007) |
| `/umrah/groups/:id` | DELETE | umrah-entities.ts:652 | — | groups.tsx | umrah_groups | شغّال | لا يصدر event (UMR-007) |
| `/umrah/groups/:id/split` | POST | umrah-entities.ts:686 | splitGroupSchema | groups.tsx | umrah_groups | شغّال | — |
| `/umrah/groups/merge` | POST | umrah-entities.ts:772 | mergeGroupsSchema | groups.tsx | umrah_groups | شغّال | — |
| `/umrah/nusk-invoices` | GET | umrah-entities.ts:850 | — | (لا واجهة) | umrah_nusk_invoices | ناقص | سطح غير مكشوف (UMR-005) |
| `/umrah/nusk-invoices/:id` | GET | umrah-entities.ts:876 | — | (لا واجهة) | umrah_nusk_invoices | ناقص | سطح غير مكشوف (UMR-005) |
| `/umrah/nusk-invoices` | POST | umrah-entities.ts:930 | createNuskInvoiceSchema | (لا واجهة) | umrah_nusk_invoices | ناقص | سطح غير مكشوف (UMR-005) |
| `/umrah/nusk-invoices/:id` | PATCH | umrah-entities.ts:953 | updateNuskInvoiceSchema | (لا واجهة) | umrah_nusk_invoices | ناقص | سطح غير مكشوف (UMR-005) |
| `/umrah/nusk-invoices/:id` | DELETE | umrah-entities.ts:987 | — | (لا واجهة) | umrah_nusk_invoices | ناقص | سطح غير مكشوف (UMR-005) |
| `/umrah/employees/:employeeId/assignments` | GET | umrah-entities.ts:1011 | — | commission-plan-editor | employee_assignments | شغّال | — |
| `/umrah/commission-plans` | GET | umrah-entities.ts:1030 | — | commission-plans.tsx | employee_commission_plans | شغّال | — |
| `/umrah/commission-plans/:id` | GET | umrah-entities.ts:1047 | — | commission-plan-editor | employee_commission_plans | شغّال | — |
| `/umrah/commission-plans` | POST | umrah-entities.ts:1074 | createCommissionPlanSchema | commission-plan-editor | employee_commission_plans | شغّال | يمرّ عبر initiateApprovalChain |
| `/umrah/commission-plans/:id` | PATCH | umrah-entities.ts:1139 | updateCommissionPlanSchema | commission-plan-editor | employee_commission_plans | شغّال | — |
| `/umrah/commission-plans/:id/simulate` | POST | umrah-entities.ts:1198 | simulateCommissionSchema | commission-plan-editor | — | شغّال | — |
| `/umrah/commission-plans/:id/calculate` | POST | umrah-entities.ts:1211 | simulateCommissionSchema | (لا واجهة) | employee_commission_calculations | ناقص | لا واجهة تستدعيه (UMR-015) |
| `/umrah/commission-calculations` | GET | umrah-entities.ts:1224 | — | (لا واجهة) | employee_commission_calculations | ناقص | سطح غير مكشوف (UMR-015) |
| `/umrah/import/batches` | GET | umrah-entities.ts:1249 | — | (لا واجهة umrah) | umrah_import_batches | ناقص | الـ wizard يستخدم `/admin/import-batches` (UMR-014) |
| `/umrah/import/batches/:id/changes` | GET | umrah-entities.ts:1264 | — | (لا واجهة) | umrah_import_batches | ناقص | سطح غير مكشوف |
| `/umrah/invoices` | GET | umrah-entities.ts:1285 | — | (لا واجهة قائمة منفصلة) | umrah_sales_invoices | ناقص | لا صفحة قائمة لفواتير المبيعات (UMR-016) |
| `/umrah/invoices/generate` | POST | umrah-entities.ts:1308 | generateInvoiceSchema | sales-wizard | umrah_sales_invoices | شغّال | — |
| `/umrah/sales-wizard/uninvoiced-groups` | GET | umrah-entities.ts:1328 | — | sales-wizard | umrah_groups | شغّال | — |
| `/umrah/invoices/:id` | PATCH | umrah-entities.ts:1343 | updateInvoiceSchema | (لا واجهة) | umrah_sales_invoices | ناقص | UPDATE خام يتجاوز STATE_MACHINE (UMR-006) |
| `/umrah/payments` | GET | umrah-entities.ts:1376 | — | (لا واجهة) | umrah_payments | ناقص | سطح غير مكشوف (UMR-016) |
| `/umrah/payments` | POST | umrah-entities.ts:1396 | createPaymentSchema | (لا واجهة) | umrah_payments | ناقص | سطح غير مكشوف (UMR-016) |
| `/umrah/statements/:subAgentId` | GET | umrah-entities.ts:1424 | — | (لا واجهة — نسخة JSON) | umrah_payments | ناقص | الصفحة تستخدم /pdf فقط |
| `/umrah/statements/:subAgentId/pdf` | GET | umrah-entities.ts:1442 | — | umrah-sub-agent-detail | umrah_payments | شغّال | — |
| `/umrah/letters/:id/pdf` | GET | umrah-entities.ts:1468 | — | (لا واجهة) | official_letters | ناقص | لا واجهة للخطابات (UMR-017) |
| `/umrah/letters/:id/dispatch` | POST | umrah-entities.ts:1493 | inline schema | (لا واجهة) | official_letters | ناقص | لا واجهة للخطابات (UMR-017) |
| `/umrah/reports/daily-runsheet` | GET | umrah-entities.ts:1583 | — | daily-runsheet | umrah_pilgrims | شغّال | — |
| `/umrah/reports/daily-runsheet/pdf` | GET | umrah-entities.ts:1592 | — | daily-runsheet | umrah_pilgrims | شغّال | — |
| `/umrah/attachments` | GET | umrah-entities.ts:1649 | — | attachments.tsx | umrah_attachments | شغّال | — |
| `/umrah/attachments` | POST | umrah-entities.ts:1671 | createAttachmentSchema | umrah-attachments-panel | umrah_attachments | شغّال | — |
| `/umrah/attachments/:id` | DELETE | umrah-entities.ts:1707 | — | umrah-attachments-panel | umrah_attachments | شغّال | لا يصدر event (UMR-007) |
| `/umrah/reports/reconciliation` | GET | umrah-entities.ts:1740 | — | reconciliation.tsx | umrah_nusk_invoices | شغّال | فلتر الموسم يعمل لكن الواجهة لا تمرّره (UMR-010) |

---

## جدول 4 — عدم التطابق UI ↔ API (Mismatches)

| الموقع | ما تُرسله الواجهة | ما يتوقّعه الـ schema | تشخيص ثابت | الإصلاح المقترح |
|---|---|---|---|---|
| `umrah-season-detail.tsx:68` | `DELETE /umrah/seasons/:id` | لا endpoint مطابق في `umrah.ts` | الواجهة عبر `useDetailEditDelete` تعرض زر حذف بلا backend → 404/405 دائمًا | إضافة `router.delete("/seasons/:id")` (حذف ناعم مع منع الحذف عند وجود معتمرين/فواتير) أو تمرير `deletePath: null` للـ hook |
| `umrah-transport-detail.tsx` | يعرض `item.pilgrims` فقط، لا يرسل شيئًا للإسناد | `assignPilgrimsSchema { pilgrimIds: number[] }` على `POST /transport/:id/assign-pilgrims` | الـ endpoint والجدول `umrah_transport_pilgrims` جاهزان بالكامل لكن لا واجهة لاختيار المعتمرين | إضافة نافذة إسناد في `umrah-transport-detail.tsx` تستدعي `assign-pilgrims` |
| `umrah-package-detail.tsx` | يقرأ `hotelStars`, `transportType` | الـ API يُرجع `includesTransport/includesHotel/includesMeals` (boolean) فقط — لا عمود نجوم/نوع | حقول العرض تظهر "—" دائمًا — نقص بيانات لا تعارض أسماء | إخفاء الحقول أو إضافة الأعمدة للمخطط (قرار مالك) |
| `umrah-season-detail.tsx` | يقرأ `capacity`, `revenue` | لا عمود مقابل في `umrah_seasons` | حقول العرض تظهر "—" دائمًا | إخفاء الحقول؛ #757 أصلح فقط name→title و year→hijriYear |
| `reconciliation.tsx` | `GET /umrah/reports/reconciliation` بلا أي معامل | الـ handler يدعم `seasonId` اختياري ويطبّقه فعليًا | الـ backend جاهز (M1 مُصلح) لكن الواجهة لا تعرض منتقي موسم → الفلتر غير قابل للوصول من الـ UI | إضافة `<Select>` لاختيار الموسم وتمريره كـ query param |
| `commission-plan-editor.tsx` | يستدعي `simulate` فقط | `calculate` موجود ويرحّل GL فعليًا | المحرّر لا يحتسب العمولة فعليًا أبدًا — المحاكاة لا تُثبِّت قيدًا | إضافة زر "احتساب واعتماد" يستدعي `POST /:id/calculate` |

---

## جدول 5 — التكرار والتعارض (Duplication/Conflict)

| الوظيفة | الموقع 1 | الموقع 2 | نوع التداخل | اقتراح الحل |
|---|---|---|---|---|
| خرائط دورة الحياة | خرائط محلية في `umrah.ts:52-101` (`PILGRIM_TRANSITIONS`...) | `STATE_MACHINES` في `lifecycleEngine.ts:614-715` | duplicate — تعريفان لنفس آلة الحالة؛ متطابقان حاليًا لكن أي تعديل في أحدهما يُحدث انحرافًا (كان هذا سبب C1 سابقًا) | اعتماد `lifecycleEngine` كمصدر وحيد وحذف الخرائط المحلية أو اشتقاقها منه |
| منطق تقدّم حالة المعتمر اليومي | `POST /run-daily-status` (`umrah.ts:1048`) | cron `umrahDailyStatusAdvance` (`cronScheduler.ts:3122`) | duplicate — نفس استعلامات الـ SQL وثلاث حلقات `applyTransition` منسوخة حرفيًا | استخراج دالة مشتركة `advanceDailyPilgrimStatus(scope)` يستدعيها كلٌّ من الـ route والـ cron |
| اكتشاف التجاوز (overstay detection) | cron `umrahDailyOverstayScan` يستخدم `actualStayDays > programDuration` (`cronScheduler.ts:2886`) ويكتب `umrah_violations` | `run-penalty-engine` يستخدم `status='overstayed' AND departureDate < today` (`umrah.ts:1119`) ويكتب `umrah_penalties` | conflict — معياران مختلفان لنفس الحدث الواقعي؛ #764 ربط الصفوف عبر `linkedPenaltyId` لكن قد يُنشئ الـ cron مخالفة لمعتمر لا يصنّفه محرك الغرامات متجاوزًا والعكس | توحيد معيار التجاوز في دالة واحدة يستخدمها الطرفان، أو توثيق التعريفين صراحةً (violation = حدث تشغيلي، penalty = أثر مالي) مع مزامنة المعيار |
| `requireOpenSeason` | معرّفة في `umrah.ts:37` | معرّفة ثانيةً نصًّا في `umrah-entities.ts:40` | duplicate — نسختان متطابقتان من نفس الدالة في ملفين | نقلها إلى وحدة مشتركة `lib/umrahHelpers.ts` |
| فواتير العمرة | `umrah_agent_invoices` (فاتورة وكيل — `umrah.ts`) | `umrah_sales_invoices` (فاتورة مبيعات — `umrah-entities.ts`) | conflict تسموي — كلاهما يُسمّى "فواتير" والـ route `/umrah/invoices/:id` يعرض agent-invoice بينما `/umrah/invoices` (entities) يخصّ sales-invoice | فصل المسارات تسميةً: `/umrah/agent-invoices` للوكلاء و`/umrah/sales-invoices` للمبيعات لتفادي اللبس |

---

## يحتاج Runtime Verification

- ترحيل GL في `umrahEngine.postAgentInvoiceGL` / `postPenaltyGL` / `postTransportExpenseGL` / `postPenaltyWaiverGL` — كله ملفوف بـ `try/catch` يبتلع الخطأ (`logger.error` فقط، non-blocking)؛ هل يُسجَّل الفشل فعليًا في `financial_posting_failures` أم تُفقد القيود بصمت — يحتاج تشغيلًا.
- المهام الست/السبع cron للعمرة (`umrah_daily_overstay_scan`, `umrah_daily_status_advance`...) تمرّ على **كل الشركات النشطة في حلقة واحدة** بـ `scope.userId=0`؛ سلوكها الفعلي تحت عدد كبير من الشركات/المعتمرين يحتاج قياسًا (راجع UMR-012).
- `confirmVouchersImport` (محرك استيراد القسائم) — هل يلتزم صف `umrah_nusk_invoices` ذرّيًا مع قيد الـ AP أم توجد نافذة فشل جزئي.
- `requireGuards("financial")` يغلّف **كامل بادئة `/umrah`** — هل تمنع فترة مالية مقفلة فعليًا حتى إنشاء معتمر أو رحلة نقل (كتابة تشغيلية غير مالية).
- سلوك `applyTransition` عند تزامن طلبين على نفس المعتمر/الفاتورة (سباق حالة) — لا يمكن التحقق منه ثابتًا.
- ترحيل 184 يضيف `CHECK ... NOT VALID` على `umrah_violations.status` — هل توجد صفوف قديمة بقيم خارج الـ enum تكسر تحديثات لاحقة.

---

## العيوب المُرقّمة (Defect Register)

- **UMR-001** · dead · impairing · narrow · زر "حذف الموسم" في `umrah-season-detail` يستدعي `DELETE /umrah/seasons/:id` غير الموجود → 404/405 دائمًا · الدليل: `umrah-season-detail.tsx:68` + غياب `router.delete("/seasons")` في `umrah.ts` · التبعية: لا شيء.
- **UMR-002** · dead · impairing · narrow · لا واجهة تستدعي `POST /transport/:id/assign-pilgrims` — الجدول `umrah_transport_pilgrims` والـ endpoint جاهزان لكن صفحة تفاصيل النقل تعرض فقط ولا تُسند · الدليل: `umrah.ts:1670` + `umrah-transport-detail.tsx` (لا استدعاء assign) · التبعية: C4 (مُصلح جزئيًا — البيانات جاهزة، الواجهة ناقصة).
- **UMR-003** · dead · impairing · narrow · `POST /agent-invoices/:id/record-payment` لا تستدعيه أي واجهة — تسجيل الدفعة على فاتورة الوكيل غير ممكن من الـ UI · الدليل: `umrah.ts:1327` (لا مستهلِك في `pages/umrah/`) · التبعية: لا شيء.
- **UMR-004** · dead · cosmetic · narrow · `GET /unassigned` و`POST /assign-bulk` بلا واجهة — سطح توزيع المعتمرين على الوكلاء غير مكشوف · الدليل: `umrah.ts:1731,1743` · التبعية: لا شيء.
- **UMR-005** · dead · impairing · structural · كيان `nusk-invoices` كامل (GET list/detail, POST, PATCH, DELETE) بلا أي صفحة — فواتير نسك تُنشأ فقط عبر استيراد القسائم ولا تُدار يدويًا · الدليل: `umrah-entities.ts:850-1005` · التبعية: لا شيء.
- **UMR-006** · conflict · impairing · narrow · `PATCH /invoices/:id` يكتب `status` عبر `UPDATE` خام يتجاوز STATE_MACHINE لـ `umrah_sales_invoices` — يسمح بأي انتقال حالة دون فحص · الدليل: `umrah-entities.ts:1343-1361` · التبعية: لا شيء.
- **UMR-007** · dead · cosmetic · narrow · `PATCH/DELETE /groups/:id` و`DELETE /attachments/:id` تكتب audit لكن لا تصدر event — مستهلكو `umrah.group.*`/`umrah.attachment.*` لا يُنبَّهون عند التعديل/الحذف · الدليل: `umrah-entities.ts:647,666,1720` · التبعية: لا شيء.
- **UMR-008** · mismatch · cosmetic · narrow · `umrah-package-detail` يقرأ `hotelStars`/`transportType` و`umrah-season-detail` يقرأ `capacity`/`revenue` — لا أعمدة مقابلة في المخطط فتظهر "—" · الدليل: `umrah-package-detail.tsx`, `umrah-season-detail.tsx` · التبعية: M8 (مُصلح جزئيًا بـ #757 — تبقّت الحقول بلا عمود).
- **UMR-009** · dead · impairing · narrow · `pilgrim-create.tsx` يلتقط ملفات عبر `FileDropZone` في الحالة `attachments` لكن `save()` يستدعي `POST /umrah/pilgrims` فقط ولا يرفع المرفقات — تُهمَل بصمت · الدليل: `pilgrim-create.tsx:21,28-37,93` · التبعية: لا شيء.
- **UMR-010** · dead · cosmetic · narrow · صفحة `reconciliation.tsx` لا تعرض منتقي موسم ولا تمرّر `seasonId` رغم أن الـ handler يطبّقه فعليًا بعد #760 — الفلتر يعمل في الـ backend وغير قابل للوصول من الـ UI · الدليل: `reconciliation.tsx:57-59` (لا كود season) · التبعية: M1 (الـ backend مُصلح).
- **UMR-011** · dead · cosmetic · narrow · `GET /sub-agents/unlinked` يستقبل `seasonId` ويُحسبه في فرع `if` فارغ ثم لا يستخدمه أبدًا — كود ميّت داخل الـ handler · الدليل: `umrah-entities.ts:269-271` · التبعية: لا شيء.
- **UMR-012** · scaling · impairing · structural · مهام cron العمرة (`umrahDailyOverstayScan`, `umrahDailyAbsconderCheck`, `umrahDailyStatusAdvance`...) تمرّ على كل الشركات النشطة في حلقة تسلسلية واحدة، وكل شركة تنفّذ `applyTransition` لكل معتمر منفردًا — مع نموّ عدد الشركات/المعتمرين يطول زمن المهمة خطيًا وقد يتجاوز نافذة التشغيل · الدليل: `cronScheduler.ts:2874,2936,3123` (حلقة `for (const c of companies)`) · التبعية: C5 (مُصلح وظيفيًا، لكن البنية لا تتوسّع).
- **UMR-013** · dead · cosmetic · narrow · `invoices.tsx` لا تعرض زر تعديل/حذف لفاتورة الوكيل ولا يوجد `PATCH/DELETE /agent-invoices/:id` — الفاتورة تُولَّد ولا تُعدَّل (إلا عبر record-payment غير المكشوف) · الدليل: `umrah.ts` (لا PATCH/DELETE لـ agent-invoices)، `invoices.tsx` · التبعية: لا شيء.
- **UMR-014** · duplicate · cosmetic · narrow · صفحتا استيراد متوازيتان: `import-wizard.tsx` (`/umrah/import`) و`import.tsx` (`/umrah/import/legacy`)؛ والـ wizard يربط `/admin/import-batches/:id` بينما `GET /umrah/import/batches` غير مستخدَم إطلاقًا · الدليل: `umrahRoutes.tsx:66,78` + `umrah-entities.ts:1249` · التبعية: لا شيء.
- **UMR-015** · dead · impairing · narrow · `POST /commission-plans/:id/calculate` (يرحّل العمولة + GL) و`GET /commission-calculations` بلا أي واجهة — المحرّر يستدعي `simulate` فقط فلا تُحتسب عمولة فعلية أبدًا من الـ UI · الدليل: `umrah-entities.ts:1211,1224` + `commission-plan-editor.tsx:208` (simulate فقط) · التبعية: لا شيء.
- **UMR-016** · dead · impairing · structural · لا صفحة قائمة لفواتير المبيعات `umrah_sales_invoices` (`GET /invoices`) ولا لـ `umrah_payments` (`GET/POST /payments`) — تُنشأ عبر sales-wizard وتُسجَّل دفعاتها فقط من الـ backend، بلا شاشة عرض/إدارة · الدليل: `umrah-entities.ts:1285,1376,1396` · التبعية: لا شيء.
- **UMR-017** · dead · cosmetic · narrow · `GET /letters/:id/pdf` و`POST /letters/:id/dispatch` بلا أي واجهة عمرة — وظيفة الخطابات الرسمية غير مكشوفة · الدليل: `umrah-entities.ts:1468,1493` · التبعية: لا شيء.
- **UMR-018** · scaling · cosmetic · narrow · `GET /transport/:id` يجلب كل معتمري الرحلة عبر join بلا ترقيم صفحات (`LIMIT` غائب) — رحلة كبيرة (حافلة 45+) مقبولة لكن لا حدّ أعلى؛ كذلك معظم قوائم العمرة `LIMIT 500` ثابتة بلا pagination حقيقي · الدليل: `umrah.ts:1528-1535` + قوائم `LIMIT 500` المتكررة · التبعية: لا شيء.
- **UMR-019** · conflict · cosmetic · narrow · cron `umrahDailyOverstayScan` يُدرج `umrah_violations` بقيمة `branchId=0` حرفية بدل `NULL` أو فرع فعلي — صفوف المخالفات الآلية تحمل معرّف فرع غير صالح · الدليل: `cronScheduler.ts:2912` (`VALUES ($1,0,'overstay',...)`) · التبعية: لا شيء.

---

## خلاف مع تقارير سابقة

التقرير الوظيفي `FUNCTIONAL_UMRAH_VERIFICATION.md` (بتاريخ 2026-05-21) يَعُدّ خمسة فواصل حرجة C1–C5 و12 ثغرة متوسطة. **هذا التدقيق يجد أن التقرير مُتقادم (stale) على أغلب نقاطه** بعد دمج PRs #757/#759/#760/#761/#764/#766/#768 — وفيما يلي الخلافات الموثَّقة بالدليل:

1. **C1 (فاتورة الوكيل عالقة في `draft`) — مُصلح، التقرير متقادم.** التقرير يقول `generate` يُنشئ `status='draft'` بلا مخرج. الواقع الآن: `umrah.ts:1409` يُدرج الفاتورة مباشرةً بحالة `'sent'` (تعليق صريح "C1: generated directly as 'sent'")، و`lifecycleEngine.ts:706-714` لا يحتوي حالة `draft` أصلًا فيتسق الاثنان. فاتورة الوكيل تستقبل دفعة عبر `record-payment` فورًا.

2. **C2 (صفحة التفاصيل تنادي endpoint غير موجود) — مُصلح، التقرير متقادم.** التقرير يقول `umrah-invoice-detail.tsx` ينادي `GET /umrah/invoices/:id` المفقود. الواقع الآن: `umrah-invoice-detail.tsx:46` ينادي `GET /umrah/agent-invoices/${id}` وهو موجود فعليًا في `umrah.ts:1470`. لا 404.

3. **C3 (نظامان متوازيان للتجاوز) — مُصلح جزئيًا، التقرير متقادم على الربط.** PR #764 + migration 184 أضافا `umrah_violations.linkedPenaltyId` وقيد `CHECK` على `status`، و`run-penalty-engine` (`umrah.ts:1141-1147`) يربط صف المخالفة بالغرامة داخل نفس الـ transaction. **لكن** يبقى تعارض معيار الاكتشاف قائمًا (الـ cron يستخدم `actualStayDays/programDuration`، المحرك يستخدم `departureDate`) — موثَّق كـ UMR (جدول 5، صف اكتشاف التجاوز).

4. **C4 (لا علاقة بين النقل والمعتمر) — مُصلح، التقرير متقادم.** PR #766 + migration 185 أنشآ جدول الربط `umrah_transport_pilgrims` بقيد `UNIQUE(transportId,pilgrimId)`؛ `assign-pilgrims` يُدرج صفوف ربط idempotent ويشتقّ `pilgrimCount` من الـ join، و`GET /transport/:id` (`umrah.ts:1528`) يُرجع معتمري الرحلة من الـ join لا كل معتمري الشركة. التخصيص لم يعد تجميليًا — يبقى فقط نقص واجهة الإسناد (UMR-002).

5. **C5 (تقدّم حالة المعتمر يدوي بالكامل) — مُصلح، التقرير متقادم.** PR #768 أضاف cron `umrah_daily_status_advance` (الساعة 05:00 يوميًا، `cronScheduler.ts:3122,3538`) يشغّل نفس منطق `run-daily-status` لكل شركة عبر `applyTransition`. خط التقدّم لم يعد يعتمد على ضغطة زر. (يبقى عيب بنيوي توسّعي — UMR-012.)

6. **M1 (فلتر `seasonId` في تقرير المطابقة كود ميّت) — مُصلح في الـ backend، التقرير متقادم.** PR #760 جعل `GET /reports/reconciliation` يطبّق `seasonId` فعليًا على الاستعلامات الثلاثة (`umrah-entities.ts:1751-1756`). الخلل المتبقي انتقل إلى الواجهة فقط (UMR-010 — الصفحة لا تمرّر المعامل).

7. **M6 (`PATCH /violations/:id` لا audit ولا event) — مُصلح، التقرير متقادم.** PR #761: `umrah.ts:1840-1841` يكتب الآن `createAuditLog` ويُصدر `umrah.violation.updated`.

8. **M8 (تعارض أسماء الحقول في 4 صفحات تفاصيل) — مُصلح جزئيًا، التقرير متقادم.** PR #757 صحّح season (name→title, year→hijriYear)، package (price→sellPrice, bookedCount→pilgrimCount, seasonName→seasonTitle)، penalty (penaltyType→type)، violation (violationType→type, fineAmount→penaltyAmount). يبقى نقص بيانات لا تعارض أسماء (UMR-008).

9. **M11 (4 صفحات بلا روابط sidebar) — مُصلح، التقرير متقادم.** `umrah-tabs-nav.tsx:10-26` يضمّ الآن تبويبات لـ `groups` و`daily-runsheet` و`reconciliation` و`attachments` — كلها قابلة للاكتشاف.

10. **خلاف على تصنيف لوحة شهادة `UMRAH_CERTIFICATION.md` (2026-05-19):** الشهادة تُصنّف `umrah-entities.ts` بـ Lifecycle = ❌ FAIL و`umrah.ts:1340 POST /agent-invoices/generate` بـ Lifecycle = ❌ FAIL. هذا التدقيق يجد التصنيف **متقادمًا**: `generate` لم يعد بحاجة انتقال lifecycle لأنه يُنشئ مباشرةً الحالة الصالحة الأولى `sent` بعد #764؛ والكيانات بلا state machine (violations/groups/nusk) أصبح بعضها مُقيّدًا بـ `CHECK` (violations عبر migration 184). تبقى الملاحظة صحيحة لـ `umrah_sales_invoices` فقط (UMR-006).

**ملاحظات تبقى صحيحة من التقرير السابق (غير متقادمة):** M2/M3 (سياسة GL non-blocking مبتلَعة) لا تزال قائمة — راجع "يحتاج Runtime Verification"؛ M5 لا يزال قائمًا (UMR-006)؛ M7 لا يزال قائمًا (UMR-007)؛ M9 لا يزال قائمًا (UMR-009)؛ M12 (لا واجهة للخطابات/commission-calculations/payments) لا يزال قائمًا (UMR-015/016/017).

*انتهى الجرد — تحليل ثابت فقط، لا تشغيل ولا تعديل كود. أُنشئ بواسطة وكيل تدقيق مسار العمرة في 2026-05-21.*
