# Saudi Compliance — تصميم تكامل WPS / Mudad / Saudization / Iqama

> **النطاق**: امتثال نظام العمل السعودي + الأنظمة الحكومية المرتبطة بالموارد البشرية. يكمل البنية الحالية (`employees.iqamaNumber/Expiry`، `payroll.gosi`).
> **التاريخ**: 2026-05-09
> **الحالة**: تصميم — التنفيذ ~4-6 أسابيع.
> **المعيار**: نظام العمل السعودي + متطلبات وزارة الموارد البشرية + GOSI + ZATCA (للضرائب على الرواتب).

## 1) الحالة الحالية

✅ **موجود في الـ schema**:
- `employees.iqamaNumber`, `iqamaExpiry`, `iqamaStatus`
- `employees.gosiNumber`
- `employees.nationality`
- `payroll.gosi` (employee contribution)
- `payroll.gosiEmployer` (company match)
- `hr_holidays`، `hr_leave_*`، `payroll_runs`

❌ **مفقود**:
- **WPS** (Wage Protection System): توليد ملف SAMA بمواصفات البنوك السعودية (CSV / PIPE-delimited)
- **Mudad**: API integration مع منصة "مدد" (تابعة لوزارة الموارد البشرية)
- **Saudization (Nitaqat)**: حساب نسبة السعودة + تصنيف المنشأة (بلاتيني/أخضر/أصفر/أحمر)
- **Iqama renewal alerts**: يومي قبل 90/60/30 يومًا
- **Per-nationality reporting** للجهات الحكومية
- **Mosaned / Qiwa**: integrations ثانوية (sync employees + contracts)

## 2) WPS (نظام حماية الأجور)

### 2.1 المتطلبات
كل شركة سعودية ملزمة بدفع رواتب موظفيها عبر بنك سعودي. البنك يطلب ملف WPS شهريًا بصيغة محددة:

**Header line**:
```
H|<companyId>|<vatNumber>|<crNumber>|<period YYYY-MM>|<totalAmount>|<recordCount>
```

**Detail lines** (per employee):
```
D|<iqamaOrNationalId>|<accountIban>|<bankCode>|<amount>|<currency>|<basicSalary>|<housingAllowance>|<otherAllowances>|<deductions>|<remark>
```

البنك يدمج الملف ويحوّل، ثم يُرجع acknowledgement file بحالة كل سطر (paid / failed / held).

### 2.2 جدول `wps_runs`
```sql
wps_runs:
  id, companyId, period (CHAR(7) YYYY-MM)
  bankCode, fileName, fileBytes (TEXT)
  status: draft | submitted | acknowledged | rejected
  totalAmount, recordCount
  submittedAt, acknowledgedAt
  ackFileBytes (TEXT — البنك يُرجع ملف ack)

wps_run_lines:
  id, wpsRunId, employeeId, iqamaOrId, iban
  amount, basicSalary, housingAllowance, otherAllowances, deductions
  remark, status: pending | paid | failed | held
  bankRefNumber, errorMessage
```

### 2.3 Workflow
1. **Build**: `buildWpsFile(companyId, period)` — pure function يبني الـ file string من الـ payroll-run المُعتمَد للفترة
2. **Save**: `wps_runs` row مع status='draft'، download CSV
3. **Submit**: operator يرفع للبنك (manually أو عبر API)، update status='submitted'
4. **Reconcile**: ack file يُحلَّل + يُحدَّث per-line status
5. **Alert**: سطر فشل → notification للـ HR manager

## 3) Mudad

منصة "مدد" التابعة لوزارة الموارد البشرية تُسوّي:
- صرف الرواتب
- تسجيل الإجازات بدون راتب
- مغادرة + عودة
- إنهاء العقد

API: REST مع OAuth 2.0 (client credentials). كل شركة مسجَّلة عند مدد.

### 3.1 جدول `mudad_settlements`
```sql
mudad_settlements:
  id, companyId, period (YYYY-MM)
  type: salary | leave_unpaid | exit_reentry | termination
  employeeId, mudadRefId (returned by Mudad)
  status: submitted | acknowledged | rejected
  amount, payload (JSON)
  submittedAt, acknowledgedAt
```

### 3.2 العلاقة مع WPS
WPS = bank-side payroll. Mudad = ministry-side reconciliation. الاثنان مطلوبان:
- WPS يضمن وصول الراتب للحساب
- Mudad يُسجّل أن الراتب صُرف للموظف ضمن النظام الحكومي

## 4) Saudization (Nitaqat)

### 4.1 التصنيف
حسب نظام نطاقات، كل شركة تُصنَّف بناءً على نسبة السعودة (سعوديين / إجمالي):

| النطاق | النسبة (مثال — تختلف حسب الفئة) | الأثر |
|--------|---------------------------------|--------|
| بلاتيني | ≥40% | استثناءات + مزايا |
| أخضر | 20-39% | عادي |
| أصفر | 10-19% | قيود على إصدار التأشيرات |
| أحمر | <10% | عقوبات، منع تجديد iqama |

### 4.2 جدول `saudization_snapshots`
```sql
saudization_snapshots:
  id, companyId, period (YYYY-MM)
  totalEmployees, saudiEmployees, nonSaudiEmployees
  saudizationPercent
  category: platinum | green | yellow | red
  computedAt
  notes
```

Cron شهري يحسب + يخزّن snapshot. Dashboard يعرض trend.

## 5) Iqama renewal alerts

### 5.1 الحالة الحالية
`employees.iqamaExpiry` موجود. لا alert.

### 5.2 المُضاف
Cron يومي:
```
SELECT id, name, iqamaExpiry, iqamaExpiry - CURRENT_DATE AS daysLeft
FROM employees
WHERE iqamaExpiry IS NOT NULL
  AND iqamaExpiry - CURRENT_DATE IN (90, 60, 30, 14, 7, 1)
  AND deletedAt IS NULL
```

كل سطر → notification للـ HR manager + employee.

## 6) Module Layout

### 6.1 Provider abstractions

Two interfaces split the work so payroll code doesn't know **which** bank's WPS format it's emitting or **whether** the Mudad client is real or mocked.

```ts
// lib/saudi-compliance/wps/format.ts
export interface WpsFormatProvider {
  /** Bank id, e.g. "ncb", "riyad", "alrajhi", "sabb". */
  readonly id: string;

  /** Bank name for UI display. */
  readonly displayName: string;

  /**
   * Render a payroll run as the bank's expected file format.
   * Returns the raw bytes (CSV / fixed-width / XML — bank's choice)
   * plus the canonical filename per the bank's spec.
   */
  build(run: WpsRun, lines: WpsLine[]): { filename: string; bytes: Buffer };

  /**
   * Parse the bank's acknowledgement file back into structured rows
   * so we can mark per-employee success/failure.
   */
  parseAck(text: string): WpsAckLine[];
}

// lib/saudi-compliance/payroll/export-provider.ts
export interface PayrollExportProvider {
  /** Provider id, e.g. "mudad", "wps-ncb", "wps-alrajhi", "mock". */
  readonly id: string;

  /** Whether this provider is currently configured for the company. */
  isAvailable(companyId: number): Promise<boolean>;

  /**
   * Submit a payroll run for processing. Always async; never throws
   * on a bank-level rejection — return `status: "rejected"` instead.
   */
  submit(run: PayrollRun): Promise<PayrollSubmissionResult>;

  /** Reconcile bank/Mudad acknowledgement back to our settlement rows. */
  reconcile(ackBlob: unknown): Promise<{ matched: number; unmatched: number }>;

  /** Pre-flight (credentials valid, certificate not expired, etc.). */
  health(companyId: number): Promise<{ ok: boolean; details: string[] }>;
}
```

### 6.2 Registry — config-driven dispatch

```ts
// lib/saudi-compliance/payroll/registry.ts
const PROVIDERS: Record<string, () => PayrollExportProvider> = {
  "mudad":        () => new MudadProvider(),
  "wps-ncb":      () => new WpsProvider("ncb"),
  "wps-alrajhi":  () => new WpsProvider("alrajhi"),
  "wps-riyad":    () => new WpsProvider("riyad"),
  "wps-sabb":     () => new WpsProvider("sabb"),
  "mock":         () => new MockProvider(),
};

export async function getPayrollProvider(companyId: number): Promise<PayrollExportProvider> {
  const id = await readPayrollProviderConfig(companyId)
    ?? process.env.PAYROLL_EXPORT_PROVIDER_DEFAULT
    ?? "mock";
  const factory = PROVIDERS[id];
  if (!factory) throw new Error(`Unknown payroll export provider: ${id}`);
  return factory();
}
```

### 6.3 What payroll code may import

```ts
// ✅ allowed
import { getPayrollProvider } from "../lib/saudi-compliance/payroll/registry.js";
import type { PayrollSubmissionResult } from "../lib/saudi-compliance/payroll/export-provider.js";

// ❌ forbidden
import { MudadClient } from "../lib/saudi-compliance/mudad/client.js";
import { buildAlRajhiFile } from "../lib/saudi-compliance/wps/formats/alrajhi.js";
```

### 6.4 File layout

```
artifacts/api-server/src/lib/saudi-compliance/
├── index.ts            — public API
├── types.ts            — WpsRun, WpsLine, NitaqatCategory, MudadSettlement
├── payroll/
│   ├── export-provider.ts  — `PayrollExportProvider` interface
│   ├── registry.ts         — config-driven dispatch
│   └── providers/
│       ├── mock.ts         — in-memory provider for dev + tests
│       ├── mudad.ts        — Mudad implementation
│       └── wps.ts          — WPS implementation (delegates to a WpsFormatProvider per bank)
├── wps/
│   ├── builder.ts      — generic WPS run aggregation (pure)
│   ├── format.ts       — `WpsFormatProvider` interface
│   ├── parser.ts       — generic ack envelope (pure)
│   └── formats/        — per-bank format adapters (NCB, Riyad, Al Rajhi, SABB)
├── nitaqat.ts          — classifyNitaqat(saudi, total, sector) — pure
├── iqama-alerts.ts     — daily cron: select expiring + emit
├── mudad/
│   ├── client.ts       — REST API client (OAuth) — used ONLY by providers/mudad.ts
│   └── reconcile.ts    — match Mudad refs to settlements
└── reports.ts          — per-nationality + Saudization trend
```

### 6.5 Why the WPS / Mudad split matters

WPS is **file-based** (every bank wants a different file format, submitted via the bank's portal or SFTP). Mudad is **API-based** (single REST endpoint, OAuth). A naive design would couple payroll directly to whichever is configured for that company; the registry lets us:

- Run a multi-tenant install where Company A uses Mudad and Company B uses WPS-Al-Rajhi without forking the codebase.
- Swap to a future government-mandated payroll system (e.g. if WPS is sunset) by adding one provider entry.
- Test the payroll flow end-to-end against the `mock` provider in CI without any network or credential dependency.

## 7) خطة التنفيذ (4-6 أسابيع)

### الأسبوع 1: WPS file builder ✓ يبدأ هنا
- [ ] Migration 142 (wps_runs, wps_run_lines, mudad_settlements, saudization_snapshots) ✓
- [ ] `lib/saudi-compliance/types.ts` ✓
- [ ] `lib/saudi-compliance/wps/builder.ts` (pure) ✓
- [ ] `lib/saudi-compliance/wps/parser.ts` (ack parser) ✓
- [ ] Tests ✓

### الأسبوع 2: Nitaqat + Iqama alerts
- [ ] `nitaqat.ts` classifier (pure)
- [ ] `iqama-alerts.ts` cron registration
- [ ] Saudization snapshot monthly cron

### الأسبوع 3: Mudad client
- [ ] OAuth2 client credentials flow
- [ ] Submit endpoints (salary, leave, termination)
- [ ] Webhook receiver

### الأسبوع 4: Per-bank WPS formats
- [ ] NCB / Al Rajhi / Riyad / Alinma formats
- [ ] Format selector per company `wps_settings.bankCode`

### الأسبوع 5-6: UI + Reports
- [ ] WPS dashboard: monthly status، download CSV، upload ack
- [ ] Saudization trend chart
- [ ] Iqama expiry watchlist
- [ ] Per-nationality breakdown report

## 8) RBAC

- `hr:wps:run` — توليد ملف WPS
- `hr:wps:reconcile` — رفع ack
- `hr:mudad:submit` — إرسال إلى مدد
- `hr:saudization:read` — عرض النطاق
- `hr:iqama:read` — قائمة الـ iqamas المنتهية
- `hr:iqama:renew` — تحديث iqama (audit-logged)

## 9) المخاطر

| المخاطر | التخفيف |
|---------|---------|
| WPS bank format يتغير | per-bank adapter + fixture tests |
| Mudad API rate limits | exponential backoff + retry queue |
| Saudization quota threshold يتغير | quota-by-sector table، operator-editable |
| Iqama spam alerts | suppress same employee within 24h |
| Mudad-WPS reconciliation gaps | nightly cross-check job |

## 10) Definition of Done

- [ ] WPS file generated for the standard payroll run + matches sample bank spec
- [ ] Ack file parsed + per-line status updated
- [ ] Saudization snapshot stored monthly + dashboard shows trend
- [ ] Iqama alerts fire at 90/60/30/14/7/1 days
- [ ] Mudad submit + ack works end-to-end on sandbox
- [ ] All tests pass (40+ vitest cases)
- [ ] Documentation: SOP for HR manager + finance manager

---

**هذا المستند مُرافق لـ**:
- Migration 142 (في PR الحالي)
- `lib/saudi-compliance/types.ts` + `wps/builder.ts` (في PR الحالي)
- `lib/saudi-compliance/nitaqat.ts` (في PR الحالي)
