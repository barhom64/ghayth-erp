# Typed Queries Migration Guide

دليل لاستبدال `rawQuery<any>` بـ types مولّدة من Drizzle schema. الهدف: تحسين IDE assistance والـ refactoring safety دون كسر الكود الإنتاجي.

> Migration pattern for replacing `: any` and `rawQuery<any>` in route
> handlers with types derived from the Drizzle schema in @workspace/db.
> The api-server uses raw SQL via the pg pool for performance — Drizzle
> is used only for the typed schema definitions, not at request time.
> This guide shows how to leverage those definitions for typed query results.

---

## 1. ليش هذا الـ migration؟

| قبل | بعد |
|------|------|
| `rawQuery<any>("...")` يرجع `any[]` | `rawQuery<ClientRow>("...")` يرجع `ClientRow[]` |
| `(c: any) => c.name` بدون التحقق | `(c) => c.name` مع IDE auto-complete |
| تغيير اسم عمود في DB يكسر بصمت | typecheck يلتقط الـ refs المكسورة |
| Code review يحتاج `git grep` للـ refs | TypeScript يعرف الـ refs مباشرة |

**القيد:** الـ Drizzle schema في `lib/db/src/schema/index.ts` يغطي ~23 جدول من أصل 292 — هي MVP definitions قديمة. للجداول الحديثة قد تحتاج تعريف ad-hoc محلي في الـ route file.

---

## 2. البنية

### 2.1 المصدر — `artifacts/api-server/src/lib/dbTypes.ts`

يصدّر Row types مشتقّة من Drizzle عبر `InferSelectModel`:

```typescript
import type { InferSelectModel } from "drizzle-orm";
import type { clients, employees, invoices } from "@workspace/db/schema";

export type ClientRow = InferSelectModel<typeof clients> & {
  // Manual extensions for columns added via migrations after the
  // initial Drizzle schema. Source of truth: db/schema.sql.
  classification?: string | null;
  source?: string | null;
  // ...
};

export type EmployeeRow = InferSelectModel<typeof employees>;
export type InvoiceRow = InferSelectModel<typeof invoices>;
```

### 2.2 التطبيق في route files

**Pattern A — full row select (`SELECT *`):**

```typescript
import type { ClientRow } from "../lib/dbTypes.js";

const [client] = await rawQuery<ClientRow>(
  `SELECT * FROM clients WHERE id=$1 AND "companyId"=$2`,
  [id, scope.companyId]
);
```

**Pattern B — projection (specific columns):**

```typescript
type ClientListRow = Pick<
  ClientRow,
  "id" | "name" | "phone" | "email" | "createdAt"
>;

const rows = await rawQuery<ClientListRow>(
  `SELECT id, name, phone, email, "createdAt" FROM clients ...`,
  [...]
);
```

**Pattern C — aggregate / synthetic shape:**

```typescript
interface ClientFinancialsRow {
  totalInvoiced: string | number;
  totalPaid: string | number;
  invoiceCount: string | number;
}

const [stats] = await rawQuery<ClientFinancialsRow>(
  `SELECT SUM(total) AS "totalInvoiced", SUM("paidAmount") AS "totalPaid", COUNT(*) AS "invoiceCount"
   FROM invoices WHERE "clientId" = $1`,
  [id]
);
```

**Pattern D — JOIN result with mixed columns:**

```typescript
type EmployeeWithCompanyRow = Pick<EmployeeRow, "id" | "name"> & {
  companyName: string;
};

const rows = await rawQuery<EmployeeWithCompanyRow>(
  `SELECT e.id, e.name, c.name AS "companyName"
   FROM employees e JOIN companies c ON c.id = e."companyId"`,
  []
);
```

### 2.3 Transaction client

`txClient: any` → `txClient: pg.PoolClient` (مع استيراد type-only):

```typescript
import type pg from "pg";

await withTransaction(async (txClient: pg.PoolClient) => {
  const { rows: [row] } = await txClient.query<{ id: number }>(
    `INSERT INTO clients (name) VALUES ($1) RETURNING id`,
    [name]
  );
});
```

### 2.4 Param arrays

`params: any[]` → `params: unknown[]`. Postgres يقبل أي قيمة JSON-serializable، فـ `unknown` صحيح type-wise بدون قيود.

```typescript
// قبل
const params: any[] = [];
if (b.name) { params.push(b.name); /* ... */ }

// بعد
const params: unknown[] = [];
if (b.name) { params.push(b.name); /* ... */ }
```

---

## 3. حالات خاصة

### 3.1 الجداول غير الموجودة في Drizzle schema

لو الجدول مش في `lib/db/src/schema/index.ts` (أغلب الجداول الـ 269 الإضافية)، عرّف interface محلي في الـ route file:

```typescript
// In clients.ts
interface PortalAccountRow {
  id: number;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
}

const [acc] = await rawQuery<PortalAccountRow>(`SELECT ... FROM client_portal_accounts ...`, [...]);
```

**خطّة تدريجية:** عندما يصل عدد الـ routes اللي تستخدم نفس الجدول لـ ≥ 3، انقل الـ interface لـ `dbTypes.ts`.

### 3.2 Numeric columns (`numeric` / `bigint`)

Postgres يرجع `numeric` و `bigint` كـ **string** افتراضياً (لتجنّب فقدان الدقة). نوّع كـ `string | number`:

```typescript
interface FinancialsRow {
  total: string | number;     // numeric(15,2) — usually arrives as string
  count: string | number;     // bigint when COUNT(*) without ::int cast
}
```

أو cast صراحة في الـ SQL:

```sql
SELECT COUNT(*)::int AS count, SUM(total)::numeric AS total
```

### 3.3 JSON columns

أعمدة `jsonb` ترجع كـ already-parsed object (مش string). نوّع كـ `unknown` ثم narrow بـ type guards، أو صرّح shape محدد:

```typescript
interface AttachmentJson {
  name: string;
  url: string;
  type: string;
}

interface ClientWithAttachments extends ClientRow {
  attachments: AttachmentJson[] | null;
}
```

### 3.4 Existence probes

`SELECT 1 FROM ... WHERE ...` لمجرد التحقق من وجود الصف:

```typescript
const [exists] = await rawQuery<{ "?column?": 1 }>(`SELECT 1 FROM ... LIMIT 1`, [...]);
if (exists) { /* ... */ }
```

أو ابدأ تستخدم `SELECT id` بدلاً من `SELECT 1` للحصول على نوع نظيف:

```typescript
const [row] = await rawQuery<{ id: number }>(`SELECT id FROM clients WHERE ... LIMIT 1`, [...]);
```

---

## 4. أمثلة من النظام (clients.ts المُحوَّل)

في الـ commit الذي يقدم هذا الدليل، تم تحويل `routes/clients.ts` (618 سطر، 26 instance من `rawQuery<any>` و 6 من `: any`) ليصبح **0 من أي منهما**. مرجع للنمط:

- Pattern A استُخدم في `[client] = await rawQuery<ClientRow>("SELECT * ...")`
- Pattern B في list endpoint مع `ClientListRow = Pick<ClientRow, ...>`
- Pattern C في detail endpoint للـ financials aggregate
- Pattern D في timeline UNION ALL مع shape مخصص
- Section 3.1 في كل التعاملات مع `client_portal_accounts` (جدول مش في Drizzle schema)
- Section 2.3 في الـ withTransaction client typing

---

## 5. خطوات الـ migration التدريجي

1. **اختار route file هدف** (ابدأ بالأصغر — clients.ts ✅، crm.ts، support.ts).
2. **شغّل grep للـ `: any`** لمعرفة الحجم: `grep -c ": any\|<any>" route.ts`
3. **اضف import** للـ Row types من `dbTypes.ts`.
4. **استبدل `<any>` تدريجياً** ابتداءً من أعلى الملف. كل استبدال يجب أن يجتاز `tsc --noEmit`.
5. **اضف الـ types المحلية** للـ aggregates / JOINs / projections.
6. **شغّل الـ tests** — `pnpm vitest tests/unit/<file>` للتأكد إن نسخة runtime لم تتغير.
7. **commit صغير** — نقل ملف واحد كل PR، أسهل للمراجعة.

---

## 6. لتحسين الـ Drizzle schema لاحقاً

الـ Drizzle schema الحالي يغطي ~23 جدول. لتحسين التغطية:

1. شغّل `drizzle-kit introspect` ضد قاعدة البيانات الحقيقية → يولّد schema كامل.
2. قارن مع `lib/db/src/schema/index.ts` و دمج التعريفات الجديدة.
3. حذف الـ manual extensions في `dbTypes.ts` (مثل ClientRow & {...}) لتصبح pure InferSelectModel.

هذا عمل multi-day خارج نطاق هذا الـ migration.

---

## 7. القيمة المتوقّعة

عند تطبيق النمط على كل الـ 81 ملف routes:
- **704+ `: any`** → ~0 (مع indexes ad-hoc لكل route)
- **IDE auto-complete** على كل `r.fieldName` access
- **Refactor safety**: تغيير اسم عمود في schema → typecheck يكشف كل الـ refs المكسورة
- **Code review أسرع**: reviewer يثق بـ types بدلاً من قراءة الـ SQL لفهم shape الـ result

**القيد المحاسبي:** ~10-20 دقيقة لكل route file كبير، × 81 ملف = 14-27 ساعة عمل تدريجي. خطّة معقولة: route واحد لكل PR على مدى 4-6 أسابيع.
