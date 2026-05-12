# ZATCA Phase 2 — تصميم التكامل

> **النطاق**: تطوير تكامل فعلي مع ZATCA Fatoora (المرحلة الثانية / "ربط الأنظمة") لتجاوز simulation الحالي.  
> **التاريخ**: 2026-05-09  
> **الحالة**: تصميم — التنفيذ ~3-4 أسابيع.  
> **المعيار**: ZATCA E-Invoicing Implementation Resolution + Fatoora APIs v2.

## 1) الحالة الحالية (Phase 1)

`artifacts/api-server/src/routes/finance-zatca.ts` يطبق:
- ✅ TLV QR Code بـ 5 tags (Phase 1)
- ✅ UBL 2.1 XML invoice template
- ✅ SHA-256 invoice hash
- ✅ Settings table + CRUD
- ✅ Submission log + stats
- ✅ "Accepted" simulation في sandbox
- ❌ **لا يوجد** API call فعلي لـ ZATCA
- ❌ **لا يوجد** CSR / certificate / PIH / ICV / signing

DB tables:
- `zatca_settings` (لكل شركة): VAT, OAuth, CSID, PIH key
- `zatca_submission_log`: تاريخ الـ submissions + status

## 2) المتطلبات التقنية لـ Phase 2

### 2.1 Onboarding (مرّة لكل شركة)
1. **Compliance CSID**: إنشاء CSR → POST `/compliance` → استلام شهادة compliance
2. **OTP من ZATCA Portal**: المنشأة تُنشئ OTP من بوابة Fatoora، يُمرّر مع CSR
3. **Compliance test**: إرسال 6 فواتير اختبارية (3 Standard + 3 Simplified) لـ `/compliance/invoices`
4. **Production CSID**: بعد اجتياز test، POST `/production/csids` → شهادة production
5. **Renewal**: قبل انتهاء الشهادة (سنة)، PATCH `/production/csids` لتجديدها

### 2.2 الفواتير (لكل فاتورة)
**Standard Invoice** (B2B، VAT-registered customer):
1. إنشاء UBL 2.1 XML
2. حساب hash (SHA-256 of canonicalized XML بدون UBLExtensions)
3. توقيع XML بـ ECDSA P-256 (شهادة production)
4. إنشاء **9-tag TLV QR**:
   - Tag 1-5: نفس Phase 1 (seller، VAT، date، total، VAT amount)
   - Tag 6: **XML hash** (Base64 SHA-256)
   - Tag 7: **ECDSA signature** (Base64)
   - Tag 8: **Public key** (Base64 X.509 SubjectPublicKeyInfo)
   - Tag 9: **Certificate signature** (Base64) — توقيع ZATCA على شهادة المنشأة
5. POST `/invoices/clearance/single` → ZATCA يُعيد الـ XML بعد إضافة QR + clearance status
6. تسليم الـ cleared XML للمشتري

**Simplified Invoice** (B2C، POS):
1. نفس الخطوات 1-4
2. POST `/invoices/reporting/single` (reporting، لا clearance)
3. تسليم الفاتورة للعميل **فورًا** (لا انتظار)

### 2.3 PIH (Previous Invoice Hash) Chain
كل فاتورة تحوي hash الفاتورة السابقة في الـ XML (`cbc:UUID` references previous):
- الأولى: PIH = SHA-256("0") (مُهيّأ في seed)
- اللاحقة: PIH = hash الفاتورة السابقة لنفس الشركة
- إذا تعطلت السلسلة (gap)، ZATCA يرفض الـ submission

### 2.4 ICV (Invoice Counter Value)
رقم متسلسل **per-company** يبدأ من 1 ويزداد بـ 1 لكل فاتورة (Standard أو Simplified). يدخل في الـ XML كـ `cbc:ID` بصيغة `ICV-{number}`. لا يمكن إعادة تعيينه.

## 3) الـ Schema المُضاف

```sql
-- Migration 138: ZATCA Phase 2 columns + ICV per-company counter
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaIcv" BIGINT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaPih" CHAR(64);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaSignature" TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaClearedXml" TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaClearanceStatus" VARCHAR(20);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "zatcaClearedAt" TIMESTAMPTZ;

-- Per-company ICV state (advisory lock to keep counter monotonic)
CREATE TABLE IF NOT EXISTS zatca_icv_counters (
  "companyId" INTEGER PRIMARY KEY REFERENCES companies(id),
  "lastIcv" BIGINT NOT NULL DEFAULT 0,
  "lastInvoiceHash" CHAR(64) NOT NULL DEFAULT 'NWZkOWEwMmIwODBhMzE3NWQwMDFiYjJhMjBhMDU2NDgyZjVlMmIwYWY3ZWI3ZmU0YjY1NDk2NWY0YjkwYTk1OQ==',
  -- ↑ Base64 of SHA-256("0") — ZATCA-spec placeholder for the chain head.
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Re-submission queue for failed clearances
CREATE TABLE IF NOT EXISTS zatca_retry_queue (
  id SERIAL PRIMARY KEY,
  "submissionLogId" INTEGER REFERENCES zatca_submission_log(id),
  "companyId" INTEGER NOT NULL REFERENCES companies(id),
  "nextAttemptAt" TIMESTAMPTZ NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_zatca_retry_queue_due ON zatca_retry_queue ("nextAttemptAt") WHERE attempts < 5;

-- Certificate metadata
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "complianceCsid" TEXT;
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "productionCsid" TEXT;
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "csrPem" TEXT;
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "privateKeyPem" TEXT;       -- encrypted at rest
ALTER TABLE zatca_settings ADD COLUMN IF NOT EXISTS "certificateExpiresAt" TIMESTAMPTZ;
```

## 4) Module Layout

### 4.1 Provider abstraction (vendor-neutral)

**Architectural rule**: the finance module **must not** import any ZATCA-specific symbol. Every call site goes through an `EInvoiceProvider` interface so the day Saudi Arabia switches APIs (or another jurisdiction lands — UAE FTA, EU PEPPOL, etc.) the swap is a single registration line.

```
artifacts/api-server/src/lib/einvoice/
├── types.ts          — vendor-neutral types (Invoice, ClearanceResult,
│                       Provider, InvoiceLifecycleState, …)
├── provider.ts       — `EInvoiceProvider` interface (abstract contract)
├── registry.ts       — per-company provider lookup
│                       (config-driven: ZATCA / mock / future provider)
├── lifecycle.ts      — state machine: draft → signed → submitted →
│                       cleared|reported|rejected|cancelled
└── providers/
    ├── zatca/        — concrete ZATCA Phase 2 implementation
    │   ├── index.ts          — implements EInvoiceProvider
    │   ├── api-client.ts     — Fatoora HTTP client
    │   ├── ubl.ts            — UBL 2.1 XML builder
    │   ├── qr.ts             — TLV encoder (Phase 1 + Phase 2)
    │   ├── signing.ts        — ECDSA P-256 + canonicalization
    │   ├── csr.ts            — CSR generation
    │   ├── pih.ts / icv.ts   — chain + counter helpers
    │   └── retry.ts          — re-submission queue worker
    └── mock/         — in-memory provider for dev + tests
        └── index.ts          — no-op clearInvoice/reportInvoice
```

### 4.2 The `EInvoiceProvider` contract

```ts
// lib/einvoice/types.ts — vendor-neutral
export interface Invoice {
  id: number;
  companyId: number;
  type: "standard" | "simplified" | "credit-note" | "debit-note";
  // raw rows from your finance schema — keep loose to avoid leaking
  // a specific UBL / TLV / etc. shape into the caller.
  data: unknown;
}

export type ClearanceStatus =
  | "cleared"        // tax authority accepted
  | "reported"       // tax authority recorded (simplified flow)
  | "rejected"       // permanently denied
  | "pending"        // retry queue
  | "skipped";       // provider says no submission needed

export interface ClearanceResult {
  status: ClearanceStatus;
  externalRef?: string;     // ZATCA UUID / future provider id
  qrPayload?: string;       // base64-encoded TLV / equivalent
  authorityHash?: string;   // ZATCA "hash" / future provider attestation
  rawResponse: unknown;     // provider-specific blob for audit
  errors?: { code: string; message: string }[];
}

// lib/einvoice/provider.ts
export interface EInvoiceProvider {
  /** Stable id for this provider, e.g. `"zatca-fatoora-v2"`. */
  readonly id: string;

  /** Provider-specific onboarding (e.g. ZATCA CSR + OTP exchange). */
  onboard(companyId: number, params: Record<string, unknown>): Promise<void>;

  /** Submit an invoice for clearance/reporting. Always async; never throws on a tax-authority rejection — return `status: "rejected"` instead. */
  submit(invoice: Invoice): Promise<ClearanceResult>;

  /** Re-submit a previously-failed invoice from the retry queue. */
  resubmit(invoice: Invoice, previousAttemptId: number): Promise<ClearanceResult>;

  /** Pre-flight check (e.g. cert expiry, network reachability). */
  health(companyId: number): Promise<{ ok: boolean; details: string[] }>;
}
```

### 4.3 Registry — config-driven dispatch

```ts
// lib/einvoice/registry.ts
import type { EInvoiceProvider } from "./provider.js";
import { ZatcaProvider } from "./providers/zatca/index.js";
import { MockProvider } from "./providers/mock/index.js";

const PROVIDERS: Record<string, () => EInvoiceProvider> = {
  zatca: () => new ZatcaProvider(),
  mock: () => new MockProvider(),
  // future: "fta-uae": () => new FtaUaeProvider(),
};

export async function getProvider(companyId: number): Promise<EInvoiceProvider> {
  // Read the active provider id from the company's `einvoice_settings` row
  // (or fall back to the env-configured default for dev).
  const id = await readProviderId(companyId) ?? process.env.EINVOICE_PROVIDER_DEFAULT ?? "mock";
  const factory = PROVIDERS[id];
  if (!factory) throw new Error(`Unknown e-invoice provider: ${id}`);
  return factory();
}
```

### 4.4 What finance code may import

Finance routes import **only** from `lib/einvoice/` — never from `lib/einvoice/providers/zatca/`:

```ts
// ✅ allowed
import { getProvider } from "../lib/einvoice/registry.js";
import type { ClearanceResult } from "../lib/einvoice/types.js";

// ❌ forbidden — would couple finance to ZATCA specifically
import { clearInvoice } from "../lib/einvoice/providers/zatca/index.js";
```

A guardrail in `scripts/lint-patterns.mjs` enforces this — any `import` of `providers/zatca` from outside `lib/einvoice/` is a CI failure.

### 4.5 Invoice lifecycle (vendor-neutral state machine)

```
              ┌──────────────┐
              │    draft     │  ← create / edit invoice rows
              └──────┬───────┘
                     │ approve()
                     ▼
              ┌──────────────┐
              │    signed    │  ← provider-specific sign step (ZATCA: ECDSA)
              └──────┬───────┘
                     │ submit()
                     ▼
              ┌──────────────┐    fail
              │  submitted   │ ───────┐
              └──────┬───────┘        │
            success  │                ▼
                     ▼          ┌──────────────┐    >5 attempts
              ┌──────────────┐  │   pending    │ ───────┐
              │  cleared/    │  │  (retry)     │        │
              │  reported    │  └──────┬───────┘        ▼
              └──────────────┘         │          ┌──────────────┐
                     │                 └─→ retry  │   rejected   │
                     │ creditNote()                └──────────────┘
                     ▼
              ┌──────────────┐
              │  cancelled   │  ← never delete a cleared invoice;
              └──────────────┘    issue a credit note instead
```

The state lives in `invoices.einvoice_state` (new column, see schema below). Transitions are gated by `lib/einvoice/lifecycle.ts` — illegal transitions throw `LifecycleError` rather than silently no-op.

### 4.6 Legacy `routes/finance-zatca.ts`

The existing route is renamed to `routes/finance-einvoice.ts` and refactored to:

1. Look up the active provider via `getProvider(companyId)`.
2. Call `provider.submit(invoice)` / `provider.health()` / `provider.onboard()`.
3. Persist the returned `ClearanceResult` in `einvoice_submission_log` (renamed from `zatca_submission_log`).

The old `routes/finance-zatca.ts` is kept as a thin re-export to preserve URL backwards compatibility (`/api/finance/zatca/*` → `/api/finance/einvoice/*`).

---

## 4-bis) Legacy module layout (pre-abstraction)

Kept for historical reference — the current `lib/zatca/` tree predates §4.1.

```
artifacts/api-server/src/lib/zatca/
├── index.ts          — public API: clearInvoice(), reportInvoice()
├── types.ts          — TS types for ZATCA payloads + responses
├── qr.ts             — TLV encoding (Phase 1 = 5 tags, Phase 2 = 9 tags)
├── ubl.ts            — UBL 2.1 XML builder (existing logic, refactored)
├── pih.ts            — PIH chain helpers (read/write counter)
├── icv.ts            — ICV counter helpers (monotonic per-company)
├── signing.ts        — ECDSA P-256 signing + canonicalization
├── csr.ts            — CSR (Certificate Signing Request) generation
├── api-client.ts     — Fatoora HTTP client (compliance / sandbox / production)
└── retry.ts          — Re-submission queue worker

artifacts/api-server/src/routes/finance-zatca.ts
                      — refactored to delegate to lib/zatca/
```

§4.1-§4.6 is what gets built in Phase 2; this section is what exists today.

## 5) خطة التنفيذ (3-4 أسابيع)

### الأسبوع 1: Foundations
- [ ] Migration 138 (ICV, PIH, certificates) ✓ مرفقة في هذا السبرنت
- [ ] `lib/zatca/icv.ts` + `pih.ts` (advisory locks للـ monotonicity)
- [ ] `lib/zatca/qr.ts` Phase 2 (9-tag TLV) ✓ مرفق
- [ ] Unit tests للـ QR + PIH + ICV
- [ ] CSR generation (`csr.ts`) — `node:crypto` + `@peculiar/x509`

### الأسبوع 2: Signing & XML
- [ ] ECDSA P-256 signing (`signing.ts`)
- [ ] XML canonicalization (XMLDSig) — يحتاج مكتبة (`xml-c14n` أو `@xmldom`)
- [ ] Refactor `generateZatcaXml` لإضافة UBL extensions (signature placeholders)
- [ ] Property-based tests للـ canonicalization

### الأسبوع 3: API client
- [ ] `api-client.ts` بـ axios/fetch:
  - `compliance.requestCsid(csr, otp)` → POST /compliance
  - `compliance.invoiceCheck(xml)` → POST /compliance/invoices
  - `production.requestCsid()` → POST /production/csids
  - `production.renewCsid()` → PATCH /production/csids
  - `production.clearance(xml)` → POST /invoices/clearance/single
  - `production.reporting(xml)` → POST /invoices/reporting/single
- [ ] Sandbox endpoints: `https://gw-fatoora.zatca.gov.sa/e-invoicing/...`
- [ ] Production endpoints: `https://gw-fatoora.zatca.gov.sa/...` (post-onboarding)
- [ ] Authentication: Basic auth بـ `username:secret` (CSID = base64(certificate))

### الأسبوع 4: Integration & Testing
- [ ] Refactor `/zatca/invoice/:id/submit` لاستخدام api-client
- [ ] Retry queue worker (`retry.ts`) — كل دقيقة، exponential backoff
- [ ] Compliance test pack (6 invoices) — submission script
- [ ] UI: badge for clearance status (pending / cleared / rejected)
- [ ] UI: certificate expiry warning قبل 30 يوم
- [ ] Documentation: runbook لـ onboarding + troubleshooting

## 6) المخاطر والتحديات

| المخاطر | التخفيف |
|---------|---------|
| OTP من ZATCA portal expires في 60 ثانية | UI: timer + clear instruction "اضغط 'إنشاء OTP' في بوابة Fatoora ثم الصق هنا فورًا" |
| Certificate expiry ينقطع silently | Cron job يفحص يوميًا + alert email للمدير المالي قبل 30 يوم |
| Network failure أثناء clearance | Retry queue (5 attempts، exponential) + manual re-submit UI |
| ECDSA signing slow (~50ms/inv) | Worker thread بدلاً من main loop |
| PIH chain breaks لو فاتورة حُذفت | لا يُسمح بحذف cleared invoice — soft-delete + warning |
| XML canonicalization mismatch | Test pack طويل + golden XML files في `__fixtures__/` |
| Encryption key rotation | `FIELD_ENCRYPTION_KEY` env var، rotation script يعيد تشفير `privateKeyPem` |

## 7) متغيرات بيئية جديدة

```bash
# .env additions for ZATCA Phase 2
ZATCA_FATOORA_BASE_URL=https://gw-fatoora.zatca.gov.sa  # بيئة الـ sandbox + production
ZATCA_DEFAULT_ENVIRONMENT=sandbox                      # sandbox|production
ZATCA_CLEARANCE_TIMEOUT_MS=30000                       # default 30s
ZATCA_RETRY_MAX_ATTEMPTS=5
ZATCA_RETRY_BASE_DELAY_MS=60000                        # 1m, doubling
```

## 8) Cross-cutting concerns

### 8.1 Encryption at rest
`privateKeyPem` و `oauthClientSecret` في `zatca_settings` يجب أن تُشفّر بـ `FIELD_ENCRYPTION_KEY` (موجود في .env.example). استخدام `lib/secrets.ts` الموجود.

### 8.2 Monitoring
كل عمليات clearance/reporting تُكتب في `zatca_submission_log` + `event_logs`. إضافة Prometheus metrics:
- `zatca_clearance_total{status, environment}`
- `zatca_clearance_duration_seconds_bucket`
- `zatca_retry_queue_depth`

### 8.3 RBAC
- `zatca:settings` — إدارة الإعدادات (CFO، general manager)
- `zatca:submit` — إرسال يدوي لفاتورة (finance manager)
- `zatca:resubmit` — إعادة إرسال من retry queue (finance manager)
- `zatca:onboarding` — CSR + OTP (CFO فقط)

## 9) المراجع

- [ZATCA E-Invoicing Implementation Resolution](https://zatca.gov.sa/ar/E-Invoicing/Documents/E-invoicing-Implementing-Resolution.pdf)
- [Fatoora APIs v2 Specification](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/E-Invoicing-Detailed-Technical-Guideline.pdf)
- [UBL 2.1 KSA Profile](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/E-Invoicing-XML-Implementation-Standard.pdf)
- [Security Specifications](https://zatca.gov.sa/ar/E-Invoicing/SystemsDevelopers/Documents/Security-Features-Implementation-Standards.pdf)
- [Phase 2 QR Code (Annex 4)](https://zatca.gov.sa/ar/E-Invoicing/Documents/) — TLV tags 6-9

## 10) Definition of Done

- [ ] جميع الـ 6 فواتير في compliance test pack تمر
- [ ] Production CSID مُسلَّم
- [ ] فاتورة Standard cleared فعلًا (sandbox + production)
- [ ] فاتورة Simplified reported فعلًا (sandbox + production)
- [ ] PIH chain يعمل عبر 100 فاتورة متتالية بدون gap
- [ ] Retry queue يستعيد فاتورة بعد 5xx من ZATCA
- [ ] UI يعرض clearance status + QR Phase 2 على print
- [ ] Documentation: runbook + screenshots + troubleshooting
- [ ] Encryption: privateKeyPem مُشفّر at-rest، rotation script يعمل
- [ ] Audit log entry لكل onboarding action
- [ ] Cert expiry alert tested (manual time-warp)
- [ ] No breaking changes للـ Phase 1 sandbox endpoints (backward compat)

---

**هذا المستند مُرفق مع**:
- Migration 138 (ICV + PIH + retry queue + cert metadata) — مُتضمَّن في PR الحالي
- `lib/zatca/qr.ts` — Phase 2 generator مع unit tests — مُتضمَّن
- `lib/zatca/types.ts` — Type definitions — مُتضمَّن
- Skeleton لـ `lib/zatca/icv.ts` و `lib/zatca/pih.ts` — مُتضمَّن

التنفيذ الكامل (signing, api-client, retry worker, UI) يحتاج 3-4 أسابيع تطوير + onboarding مع ZATCA.
