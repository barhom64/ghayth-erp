# Ghayth ERP — Performance Benchmarks

اختبارات أداء قابلة للتشغيل لقياس أداء **غيث ERP** ومقارنته مع أنظمة ERP مفتوحة المصدر (Odoo, ERPNext, Dolibarr) والمعايير الصناعية.

> Runnable performance benchmarks for the Ghayth ERP backend (Express 5 + PostgreSQL) and frontend (React + Vite), with a comparative analysis against open-source ERPs and industry baselines.

---

## 1. هيكل المجلد — Layout

```
benchmarks/
├── api/        # k6 + autocannon scripts for REST endpoints
├── db/         # pgbench + raw SQL query benchmarks
├── load/       # concurrent-user simulations (k6 ramp/soak/spike)
├── frontend/   # Lighthouse + bundle-size + Web Vitals
├── results/    # output JSON / CSV / HTML lands here (gitignored)
└── COMPARISON.md  # written analysis vs. Odoo / ERPNext / Dolibarr
```

نتائج التشغيل تُحفظ في `results/` ولا تُلتزم في git (موجود `.gitignore`).

---

## 2. المتطلبات — Prerequisites

| Tool         | Why                                       | Install                              |
| ------------ | ----------------------------------------- | ------------------------------------ |
| Node.js 20+  | لتشغيل سكربتات autocannon و Lighthouse    | already required by repo             |
| k6           | اختبارات API/Load (latency & throughput)  | `brew install k6` / [k6.io/install](https://k6.io/docs/get-started/installation/) |
| pgbench      | اختبارات PostgreSQL                       | يأتي مع `postgresql-contrib`         |
| autocannon   | اختبارات HTTP خفيفة في Node               | `npx autocannon` (no global install) |
| Lighthouse   | قياس أداء الواجهة                          | `npx lighthouse` or `pnpm dlx lighthouse` |

> لا تحتاج تثبيت كل شيء معًا. كل سكربت يستخدم أداة واحدة فقط.

---

## 3. إعداد البيئة — Environment

أنشئ `.env` في `benchmarks/` (أو صدّر المتغيرات قبل التشغيل):

```bash
# عنوان الـ API (لازم يكون شغّال — راجع artifacts/api-server/README.md)
export API_BASE_URL="http://localhost:5000"

# بيانات تسجيل دخول لمستخدم اختبار له صلاحيات قراءة كافية
export BENCH_USER_EMAIL="bench@example.com"
export BENCH_USER_PASSWORD="ChangeMe123!"

# قاعدة بيانات للاختبار (لا تستخدم بيئة الإنتاج!)
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ghayth_bench"

# عنوان الواجهة (للـ Lighthouse)
export FRONTEND_URL="http://localhost:5173"
```

⚠️ **حذار**: استخدم قاعدة بيانات منفصلة. سكربتات `db/` قد تكتب بيانات وتحذفها.

---

## 4. التشغيل السريع — Quick Run

```bash
# 1. شغّل API + Frontend في نوافذ منفصلة (راجع README الرئيسي)
pnpm --filter @workspace/api-server dev
pnpm --filter @workspace/ghayth-erp dev

# 2. شغّل اختبارات الأداء حسب النوع:

# ‎(أ) API latency/throughput (k6)
k6 run benchmarks/api/k6-smoke.js
k6 run benchmarks/api/k6-baseline.js

# ‎(ب) API micro-benchmark (autocannon)
node benchmarks/api/autocannon-suite.mjs

# ‎(ج) PostgreSQL queries
bash benchmarks/db/run-pgbench.sh
node benchmarks/db/query-bench.mjs

# ‎(د) Load tests (مستخدمين متزامنين)
k6 run benchmarks/load/k6-ramp.js
k6 run benchmarks/load/k6-soak.js
k6 run benchmarks/load/k6-spike.js

# ‎(هـ) Frontend (Lighthouse + bundle size)
node benchmarks/frontend/lighthouse-run.mjs
node benchmarks/frontend/bundle-size.mjs
```

النتائج تُحفظ JSON/HTML في `benchmarks/results/`.

---

## 5. ماذا نقيس — Metrics Reference

| Layer     | Metric                                | Target (Ghayth)         | Industry baseline |
| --------- | ------------------------------------- | ----------------------- | ----------------- |
| API       | p95 latency (read endpoints)          | ≤ 200 ms                | 200–500 ms        |
| API       | p95 latency (write endpoints)         | ≤ 400 ms                | 400–800 ms        |
| API       | throughput (RPS @ 50 VUs)             | ≥ 800 req/s             | 300–1500 req/s    |
| API       | error rate under load                 | < 0.1 %                 | < 1 %             |
| DB        | simple SELECT (`pgbench -S`) TPS      | ≥ 5 000 tps             | 3 000–10 000 tps  |
| DB        | mixed TPC-B-like (`pgbench`) TPS      | ≥ 800 tps               | 500–2 000 tps     |
| Load      | breaking point (concurrent users)     | ≥ 500 VUs               | 200–1 000         |
| Frontend  | Lighthouse Performance score          | ≥ 80                    | 70–90             |
| Frontend  | Largest Contentful Paint (LCP)        | ≤ 2.5 s                 | "Good" web vital  |
| Frontend  | Total bundle (gzipped, initial)       | ≤ 500 KB                | 300 KB – 2 MB     |

> الأرقام المعيارية مذكورة في `COMPARISON.md` مع المصادر.

---

## 6. التفسير والمقارنة — Comparison

التحليل المفصّل ومقارنة النتائج مع **Odoo / ERPNext / Dolibarr** والمعايير الصناعية موجود في:

```
benchmarks/COMPARISON.md
```

ويغطي:
- منهجية القياس (load profile, hardware, dataset size).
- جدول مقارنة جنبًا إلى جنب لكل مقياس.
- تحليل نقاط القوة والضعف ولماذا.
- توصيات تحسين الأداء (indexes, query plans, caching, code-splitting).

---

## 7. ملاحظات أمان وتشغيل — Safety Notes

- **لا تشغّل اختبارات التحميل ضد الإنتاج**. شغّلها على نسخة بيانات اختبارية.
- اضبط `express-rate-limit` على قيمة عالية أو عطّله في بيئة الاختبار وإلا اختبارات RPS ستضرب الحد قبل أن تقيس النظام.
- pgbench يكتب بيانات. استخدم قاعدة منفصلة أو شغّل `pgbench -i` لتهيئتها أولًا.
- Lighthouse يحتاج Chrome مثبّت في البيئة.
