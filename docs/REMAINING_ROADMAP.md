# خارطة الطريق المتبقية بعد جلسات التدقيق

> **التاريخ**: 2026-05-09  
> **النطاق**: ما تبقى من تقرير `LIBRARIES_AND_CONSISTENCY_AUDIT_2026-05-09.md` بعد دمج 7 PRs (#177, #181, #184, #186, #189, #193, الحالي).

## الحالة الحالية

✅ **مُكتمل بالكامل**:
- بلوكر deep-link routing (291 → 0 صفحة فاشلة)
- `financial_periods` seed (GL posting يعمل)
- Schema drift (audit:schema يمر)
- Cross-tenant defenses في hr.ts
- Catalog discipline (12 مكتبة مركزية + قواعد موثقة في `docs/CATALOG_RULES.md`)
- shadcn/ui sync (button/breadcrumb/carousel)
- Native dialogs → 0 (alert/confirm/prompt)
- `window.location.reload()` → 1 موقع شرعي
- DR scripts (backup.sh + restore.sh)
- README + .env.example كاملين
- i18n خطوة 1: MODULE_LABELS موحد
- i18n خطوة 2: ACTION labels موحد
- Observability boundary stub
- ghayth-erp-deck build يمر

⚠️ **يتطلب سبرنتات متعددة الأسابيع — لا يمكن إنجازها في جلسة واحدة**:

### 1. ZATCA e-Invoicing (Phase 2) — ~3-4 أسابيع
- ZATCA Fatoora API client integration (Production)
- UBL 2.1 XML invoice generation
- ECDSA cryptographic signing مع شهادة CSR
- QR code generation حسب المواصفات السعودية
- Webhook handling لـ clearance status (cleared / rejected)
- Compliance certificate management + CSR rotation
- Re-submission queue للفواتير المرفوضة
- Phase 1 (simplified) → Phase 2 (compliant) migration

**ملاحظة**: schema جاهز (`zatcaUuid`, `zatcaHash`, `zatcaQrCode` في invoices)، لكن الـ integration الفعلي مع API يحتاج فريق finance + DevOps.

### 2. Multi-currency في GL — ~2-3 أسابيع
- إضافة `currency` كحقل أساسي في كل جدول مالي
- جدول `fx_rates` مع daily fetching من مصدر موثوق (SAMA / OANDA)
- GL revaluation jobs (شهرية + أنتهاء فترة)
- Multi-currency reporting (functional currency vs presentation currency)
- Realized vs unrealized FX gains/losses
- IAS 21 compliance

### 3. Forms migration (280+ صفحة) — ~6-8 أسابيع
- تحويل من `useState` إلى `react-hook-form` + zod
- توحيد validation client-side قبل submit
- توحيد error handling عبر `FormShell`
- اختبار كل صفحة بعد التحويل

**التوصية**: تطبيق incremental — 20-30 صفحة/سبرنت بأولوية finance + HR.

### 4. i18n الكامل + multi-language — ~3-4 أسابيع
- استكمال `lib/i18n` بدالة `t(key)` كاملة
- استخراج كل النصوص العربية المشفرة (~2000 string)
- ترجمة لـ EN (للـ executives الدوليين، expat staff)
- Language switcher في الـ UI
- RTL/LTR auto-flip per locale
- Persistence in localStorage / user profile

### 5. Inventory advanced (lots / serials / valuation methods) — ~3-5 أسابيع
- جدول `product_lots` مع expiry dates
- Serial number tracking لكل movement
- FIFO / LIFO / Weighted-Average valuation engines
- Cycle count workflow + reconciliation
- ABC analysis لـ Pareto distribution
- Multi-warehouse stock visibility + transfers

### 6. Observability infrastructure — ~1-2 أسابيع (DevOps)
- إضافة Sentry SDK في الـ workspace catalog
- استبدال `lib/observability.ts` console.* بـ Sentry SDK calls
- إعداد Sentry project + DSN per environment
- Source-map upload في CI
- Error budgets + alerting rules
- Optional: Prometheus metrics + Grafana dashboards
- Optional: distributed tracing (OpenTelemetry)

**ملاحظة**: foundation موجود الآن (`lib/observability.ts`) — التغيير اللازم mechanical عند اتخاذ قرار vendor.

### 7. Saudi labor compliance (WPS / Mudad / Saudization) — ~4-6 أسابيع
- WPS (Wage Protection System) — bank file generation
- Mudad — استلام منصة موارد لتسوية الرواتب
- Iqama tracking + renewal alerts (full integration، ليس فقط schema)
- Saudization quota reporting (per Nitaqat)
- GOSI integration (موجود ready لكن يحتاج testing نهائي)

### 8. ~~RBAC v2 migration للراوتات~~ — ✅ مكتمل 100% (PR #260, 2026-05-11)
- ~~migrate `actionCenter.ts` إلى `authorize()` middleware~~
- ~~migrate `approvalActions.ts` إلى الـ permission system~~
- ~~migrate `moduleDashboards.ts` للـ field-level policies~~
- ~~استبدال `*_ROLES.includes(scope.role)` patterns المتبقية~~

**الحالة النهائية**: 1131/1131 endpoint على `authorize()` (100%). 65 dead `requirePermission` import تم تنظيفها في نفس الـsweep. تفاصيل في `docs/RBAC_V2.md` §11 + Appendix A.

### 9. as any cleanup — ~2-3 أسابيع
- ~421 occurrence من `as any` / `as unknown as` عبر الكود
- معظمها في generated files (آمن للترك) أو في contexts معقدة (يحتاج صبر)
- التركيز على routes + business logic أولًا

### 10. WCAG 2.1 AA accessibility audit — ~1-2 أسابيع (audit + fixes)
- audit رسمي بـ axe-core + manual screen reader testing
- إصلاح missing alt على images (موثّق: 2)
- إصلاح `<span onClick>` (موثّق: 12) → `<button>` مع keyboard support
- ARIA attributes حيث يلزم
- Color contrast audit (Tailwind defaults قد لا تحقق AA دائمًا)

### 11. CSRF token explicit — ~3-5 أيام
- اعتماد حالي على `SameSite=strict` كافٍ في معظم scenarios
- لكن sandboxed iframes أو older browsers ضعيفة
- إضافة `X-CSRF-Token` header للـ POST/PATCH/DELETE
- middleware يولد + يتحقق

## ترتيب الأولويات المقترح

**P0 — قانوني (لا يمكن تجنبه)**:
1. ZATCA e-Invoicing Phase 2

**P1 — وظائف أعمال متوقعة**:
2. Multi-currency
3. Forms migration (تحسين UX + validation)
4. ~~RBAC v2 migration completion~~ ✅ منجز (PR #260)

**P2 — تحسينات تشغيلية**:
5. Observability (Sentry SDK)
6. Inventory advanced
7. WPS/Mudad/Saudization

**P3 — جودة طويلة المدى**:
8. i18n الكامل
9. as any cleanup
10. WCAG audit
11. CSRF explicit

## كيفية البدء

كل بند أعلاه يحتاج:
1. **Owner** محدد (فني + business stakeholder)
2. **Spec document** قبل الكود (خاصة لـ ZATCA و multi-currency)
3. **Testing strategy** — كل بند يستحق سبرنت test plan كامل
4. **Migration plan** للـ data الموجودة (خاصة multi-currency)

التقدير الإجمالي للـ 11 بند: **~9-14 شهر تطوير** بفريق بحجم 3-5 مطورين.

---

**هذا التقرير مرافق لـ**:
- `LIBRARIES_AND_CONSISTENCY_AUDIT_2026-05-09.md` (التقرير الأصلي)
- `docs/CATALOG_RULES.md` (قواعد المكتبات)
- `docs/RBAC_V2.md` (RBAC v2 المُنفَّذ بالتوازي)
