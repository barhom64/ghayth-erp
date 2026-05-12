# Multi-currency في GL — تصميم التكامل

> **النطاق**: تطوير دعم multi-currency فعلي في الـ GL لتجاوز الـ schema الحالي (`exchangeRate` كحقل + `fx_rates` table بدون منطق مركّز).
> **التاريخ**: 2026-05-09
> **الحالة**: تصميم — التنفيذ ~2-3 أسابيع.
> **المعيار**: IAS 21 (The Effects of Changes in Foreign Exchange Rates) + IFRS standard practice للـ ERPs.

## 1) الحالة الحالية

✅ **موجود في DB** (من PRs سابقة):
- `fx_rates` table: `(companyId, fromCurrency, toCurrency, rate, effectiveDate, source)`
- `invoices.currency`, `invoices.exchangeRate` (default 1)
- `purchase_orders.currency`, `purchase_orders.exchangeRate`
- عدة جداول أخرى بـ `currency` column (default 'SAR')
- Endpoints CRUD أساسية في `finance-algorithms.ts:1153-1300`

❌ **مفقود**:
- **Functional currency** على مستوى الشركة (SAR للسعودية، USD للفروع الدولية)
- **Presentation currency** للتقارير الموحّدة
- **Module مركّز** `lib/fx/` لمنطق التحويل
- **Daily rate fetching** من مصدر موثوق (SAMA / ECB / OANDA)
- **Revaluation jobs** نهاية الفترة (unrealized FX gains/losses)
- **Realized FX** عند payment of foreign invoice
- **Index/constraints** على `fx_rates` لكشف rate gaps أو تكرار

## 2) المبادئ المحاسبية (IAS 21)

| المفهوم | الترجمة | التطبيق |
|---------|---------|---------|
| **Functional currency** | العملة التشغيلية | عملة الشركة الأساسية (نضعها على `companies.functionalCurrency`) |
| **Presentation currency** | عملة العرض | عملة التقارير الموحّدة (قد تختلف لمجموعات multi-entity) |
| **Foreign currency transaction** | معاملة عملة أجنبية | تُسجَّل بالـ functional currency باستخدام rate التاريخ |
| **Monetary item** | بند نقدي | cash, AR, AP — يُعاد تقييمه كل فترة بـ closing rate |
| **Non-monetary item** | بند غير نقدي | inventory, fixed assets — يبقى بـ historical rate |
| **Realized FX** | فروقات محققة | عند تسوية فاتورة بعملة أجنبية → P&L مباشرة |
| **Unrealized FX** | فروقات غير محققة | revaluation عند نهاية الفترة → OCI أو P&L حسب البند |

## 3) الـ Schema المُضاف

```sql
-- Migration 140: multi-currency foundations
BEGIN;

-- 1. Functional currency on companies (operating currency).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "functionalCurrency" CHAR(3) DEFAULT 'SAR';
ALTER TABLE companies ADD CONSTRAINT chk_companies_functional_currency_iso
  CHECK ("functionalCurrency" ~ '^[A-Z]{3}$');

-- 2. Presentation currency on companies (defaults to functional if NULL).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "presentationCurrency" CHAR(3);

-- 3. fx_rates: existing table; add indexes + uniqueness so rate
--    lookup is O(log n) and the same (company, from, to, date) tuple
--    can't be inserted twice with conflicting values.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_rates_company_pair_date
  ON fx_rates ("companyId", "fromCurrency", "toCurrency", "effectiveDate");
CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup
  ON fx_rates ("companyId", "fromCurrency", "toCurrency", "effectiveDate" DESC);

-- 4. fx_revaluation_log: audit trail for period-end revaluation runs.
CREATE TABLE IF NOT EXISTS fx_revaluation_log (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL REFERENCES companies(id),
  "periodId"            INTEGER NOT NULL REFERENCES financial_periods(id),
  "asOfDate"            DATE NOT NULL,
  "functionalCurrency"  CHAR(3) NOT NULL,
  "totalGain"           NUMERIC(18,2) NOT NULL DEFAULT 0,
  "totalLoss"           NUMERIC(18,2) NOT NULL DEFAULT 0,
  "journalEntryId"      INTEGER REFERENCES journal_entries(id),
  "ranBy"               INTEGER,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fx_revaluation_log_company_period
  ON fx_revaluation_log ("companyId", "periodId");

-- 5. Per-line FX detail on the revaluation entry (which monetary
--    item produced which gain/loss).
CREATE TABLE IF NOT EXISTS fx_revaluation_lines (
  id                    SERIAL PRIMARY KEY,
  "revaluationLogId"    INTEGER NOT NULL REFERENCES fx_revaluation_log(id) ON DELETE CASCADE,
  "entityType"          VARCHAR(40) NOT NULL,  -- 'invoice', 'purchase_order', 'bank_account', ...
  "entityId"            INTEGER NOT NULL,
  "originalCurrency"    CHAR(3) NOT NULL,
  "originalAmount"      NUMERIC(18,2) NOT NULL,
  "bookedRate"          NUMERIC(18,8) NOT NULL,
  "closingRate"         NUMERIC(18,8) NOT NULL,
  "gainLoss"            NUMERIC(18,2) NOT NULL  -- positive = gain, negative = loss
);
CREATE INDEX IF NOT EXISTS idx_fx_revaluation_lines_entity
  ON fx_revaluation_lines ("entityType", "entityId");

COMMIT;
```

## 4) Module Layout

```
artifacts/api-server/src/lib/fx/
├── index.ts            — public API
├── types.ts            — Currency, Rate, Conversion, RevaluationResult
├── currencies.ts       — ISO 4217 list + validation
├── rate-lookup.ts      — fetchRateForDate() with fallback to nearest prior
├── convert.ts          — convert(amount, from, to, asOfDate) — pure
├── revaluation.ts      — runPeriodEndRevaluation() — IAS 21 per-line
├── realized.ts         — recordRealizedFx() — on payment of foreign invoice
├── providers/          — daily rate sources (vendor-neutral)
│   ├── provider.ts     — `FxRateProvider` interface
│   ├── registry.ts     — config-driven dispatch
│   ├── sama.ts         — Saudi Central Bank (default for SAR base)
│   ├── ecb.ts          — European Central Bank (free, daily)
│   └── manual.ts       — operator entry (fallback)
└── jobs.ts             — daily rate fetch + alert if missing
```

### 4.1 The `FxRateProvider` contract

Finance code does **not** import a specific rate source. Every rate lookup goes through the registry so swapping SAMA → ECB → manual is a config change, not a code change.

```ts
// lib/fx/providers/provider.ts
export interface FxRateProvider {
  /** Stable id, e.g. `"sama"`, `"ecb"`, `"manual"`. */
  readonly id: string;

  /**
   * Fetch rates effective on `asOfDate`. Returns a map keyed by
   * `"<from>:<to>"`. Implementations should return at minimum the
   * direct rates for every currency in `wanted`; cross-rate inversion
   * is the caller's job (handled by `rate-lookup.ts`).
   */
  fetch(asOfDate: string, wanted: Currency[]): Promise<Map<string, number>>;

  /** Lightweight reachability test (no rate fetch). */
  health(): Promise<{ ok: boolean; details: string }>;
}

// lib/fx/providers/registry.ts
const PROVIDERS: Record<string, () => FxRateProvider> = {
  sama: () => new SamaProvider(),
  ecb: () => new EcbProvider(),
  manual: () => new ManualProvider(),
};

export function getFxProvider(companyId: number): FxRateProvider {
  const id = readFxProviderConfig(companyId)
    ?? process.env.FX_PROVIDER_DEFAULT
    ?? "sama";
  const factory = PROVIDERS[id];
  if (!factory) throw new Error(`Unknown FX provider: ${id}`);
  return factory();
}
```

### 4.2 What finance code may import

```ts
// ✅ allowed
import { convert } from "../lib/fx/convert.js";
import { getRateForDate } from "../lib/fx/rate-lookup.js";

// ❌ forbidden — couples finance to a specific provider
import { fetchSamaRates } from "../lib/fx/providers/sama.js";
```

A guardrail in `scripts/lint-patterns.mjs` enforces this — any `import` of `providers/<vendor>` from outside `lib/fx/providers/` is a CI failure.

### 4.3 Functional vs presentation currency

| Concept | Lives on | Purpose |
| --- | --- | --- |
| `companies.functionalCurrency` | per-company, IAS 21 §9 | Currency every GL row is recorded in (immutable once set; SAR for KSA tenants) |
| `companies.presentationCurrency` | per-company, optional | What the dashboard shows; if null, same as functional |
| `invoices.currency` | per-row | Transactional currency (USD invoice booked in SAR-functional company) |
| `invoices.fxRateAtPosting` | per-row | The rate used when this invoice was posted; locks the booked SAR value |
| `fx_revaluation_log` | per-period | Snapshot of closing rates + the period's gain/loss journal |

**Rule**: a row in `journal_entries` is **always** stored in its company's functional currency. Anything denominated otherwise also carries the original currency + the rate-at-posting so realised vs unrealised FX can be split cleanly.

## 5) خطة التنفيذ (2-3 أسابيع)

### الأسبوع 1: Foundations
- [ ] Migration 140 (functional currency + indexes + revaluation log) ✓ في هذا PR
- [ ] `lib/fx/types.ts` + `currencies.ts` ✓
- [ ] `lib/fx/convert.ts` — pure conversion (in-memory rate lookup) ✓
- [ ] `lib/fx/rate-lookup.ts` — DB-backed with fallback strategy ✓
- [ ] Unit tests للـ conversion math (cross-rate inversion، historical fallback) ✓

### الأسبوع 2: Daily fetching
- [ ] `source-fetchers/sama.ts` — استدعاء API SAMA الرسمي
- [ ] `source-fetchers/ecb.ts` — fallback مجاني
- [ ] `lib/fx/jobs.ts` + cron registration `daily_fx_rate_fetch`
- [ ] Alert email للـ CFO إذا rate لم يُحدَّث 3 أيام متتالية

### الأسبوع 3: Revaluation
- [ ] `lib/fx/revaluation.ts` — period-end run
  - Walks monetary items (invoices unpaid, AR, AP, bank accounts)
  - Computes gain/loss per line
  - Posts to journal_entries بـ Type=`fx_revaluation`
  - Logs بالتفصيل في `fx_revaluation_log` + `fx_revaluation_lines`
- [ ] `lib/fx/realized.ts` — wire إلى invoice payment endpoints
  - Compares booked rate vs settlement rate
  - Books realized FX gain/loss as P&L journal line
- [ ] UI: Multi-currency invoice creation (already partially supports عبر `currency` field)
- [ ] UI: FX P&L summary على /finance/dashboard

## 6) Cross-cutting concerns

### 6.1 GL accounts
يحتاج 4 حسابات GL مُهيّأة per company:
- `4XXX` Realized FX gain (Other income)
- `5XXX` Realized FX loss (Other expense)
- `4XXX` Unrealized FX gain (OCI أو Other income)
- `5XXX` Unrealized FX loss (OCI أو Other expense)

سيُضاف seed migration 141 لإنشاء هذه الحسابات تلقائيًا لكل شركة جديدة.

### 6.2 Rate sources
- **SAMA** = الافتراضي للـ SAR base. مجاني، لا OAuth.
- **ECB** = fallback. XML feed يومي.
- **Manual** = للعملات الـ exotic غير المغطاة (Iraqi Dinar مثلاً).

### 6.3 Rounding
- Conversion يستخدم `numeric(18,8)` ثم `round(2)` للـ display
- IAS 21 يسمح bankers rounding أو half-up — نعتمد half-up (consistent مع SAR).

### 6.4 RBAC
- `finance:fx:rates:read` — عرض rates
- `finance:fx:rates:write` — manual entry (للعملات الـ exotic)
- `finance:fx:revaluation:run` — تشغيل period-end run (CFO فقط)

## 7) متغيرات بيئية

```bash
# .env additions
SAMA_API_BASE_URL=https://api.sama.gov.sa  # SAMA daily rates feed
ECB_FX_FEED_URL=https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml
FX_RATE_STALENESS_ALERT_DAYS=3  # alert if no fresh rate after N days
```

## 8) المخاطر

| المخاطر | التخفيف |
|---------|---------|
| Rate provider downtime | Multi-source fallback (SAMA → ECB → manual) + alert if all fail |
| Cross-rate inversion drift | Always store BOTH directions (USD→SAR + SAR→USD) عند daily fetch |
| Revaluation re-runs corrupting GL | `runPeriodEndRevaluation` reverses prior run automatically before posting new one |
| Operator manual rate error | Audit log + 4-eye approval لـ rates > 5% from prior |
| Float precision loss | `numeric(18,8)` للـ rate، `numeric(18,2)` للـ amounts، no JS float math |

## 9) Definition of Done

- [ ] Functional currency على كل شركة مهاجَرة (SAR default)
- [ ] Presentation currency متاحة (NULL = same as functional)
- [ ] `convert(100, "USD", "SAR", "2026-05-09")` يُرجع amount صحيح
- [ ] Daily fetch ينجح من SAMA + يُسجّل في cron_logs
- [ ] Period-end revaluation run يبني journal entry متوازن
- [ ] Realized FX يُحجَز عند payment لفاتورة USD
- [ ] Multi-currency dashboard يعرض P&L بـ presentation currency
- [ ] All tests pass
- [ ] Documentation: runbook + screenshots

---

**هذا المستند مرافق لـ**:
- Migration 140 (في PR الحالي)
- `lib/fx/` skeleton (في PR الحالي)
- `lib/fx/convert.ts` + `rate-lookup.ts` (في PR الحالي)

التنفيذ الكامل (revaluation + daily fetch + UI) يحتاج 2-3 أسابيع تطوير.
