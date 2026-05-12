# Ghayth ERP — Deployment Guide

دليل النشر الإنتاجي لـ **غيث ERP**. ثلاث خيارات: Docker Compose، PM2 على VPS تقليدي، Replit.

> Production deployment guide for Ghayth ERP. Pick **one** of: Docker Compose, traditional VPS with PM2, or Replit. Files referenced live at the repo root unless noted.

---

## 1. متطلبات قبل النشر — Pre-flight checklist

| المتطلب | القيمة الإنتاجية | كيفية الحصول عليها |
|---------|----------------|------------------|
| `DATABASE_URL` | PostgreSQL 14+ مدارة | RDS / Cloud SQL / Replit DB |
| `JWT_SECRET` | 64-byte عشوائي | `openssl rand -hex 32` |
| `FIELD_ENCRYPTION_KEY` | 32-byte hex | `openssl rand -hex 32` (لا تفقده — يفقد البيانات المشفّرة) |
| `SECRETS_ENCRYPTION_KEY` | 32-byte hex | نفس الأمر |
| `VAPID_*` (Push اختياري) | EC P-256 keypair | `node scripts/src/generate-vapid-keys.mjs` |
| `CORS_ORIGINS` | عناوين الواجهة | `https://erp.example.com` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` (اختياري) | أول مستخدم admin | كلمة مرور قوية، 10 أحرف، تشمل خانة + رمز |

⚠️ **حذار:** فقدان `FIELD_ENCRYPTION_KEY` بعد التشفير = فقدان البيانات الحساسة (هويات المعتمرين، معلومات بنكية). احتفظ به في secret manager، ليس في repo.

---

## 2. خيار A — Docker Compose (الأبسط)

```bash
# 1. Clone + env
git clone https://github.com/barhom64/ghayth-erp.git && cd ghayth-erp
cp .env.example .env
# عدّل .env — على الأقل JWT_SECRET و POSTGRES_PASSWORD

# 2. توليد VAPID keys (اختياري، للـ Push)
node scripts/src/generate-vapid-keys.mjs >> .env

# 3. بناء وتشغيل
docker compose up --build -d

# 4. تابع اللوج
docker compose logs -f api

# 5. افتح الواجهة
open http://localhost
```

**خدمات الـ stack:**
- `db` — PostgreSQL 16 (port 5432)
- `api` — api-server (port 8080، يطبّق migrations تلقائيًا عند الإقلاع)
- `web` — nginx + Vite bundle (port 80، بروكسي `/api/*` لـ api)

**صيانة شائعة:**
```bash
docker compose exec db psql -U ghayth -d ghayth_erp        # SQL shell
docker compose exec api node ./dist/index.mjs             # one-shot
docker compose down -v                                     # امسح كل شي (يحذف DB!)
docker compose pull && docker compose up -d                # تحديث
```

**النسخ الاحتياطي:**
```bash
# تبني نسخة احتياطية يومية
docker compose exec db pg_dump -U ghayth -F c ghayth_erp > backups/$(date +%F).dump

# الاسترجاع على instance نظيف:
cat backups/2026-05-09.dump | docker compose exec -T db pg_restore -U ghayth -d ghayth_erp --clean
```

---

## 3. خيار B — VPS تقليدي + PM2

مناسب لـ DigitalOcean / Hetzner / Linode إذا أردت تحكم كامل بدون Docker.

### 3.1 إعداد الخادم (Ubuntu 22.04 LTS)

```bash
# 1. Node 24 + pnpm + PM2 + nginx + postgres
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs nginx postgresql postgresql-contrib
sudo npm install -g pnpm pm2

# 2. مستخدم تطبيق منفصل (لا تشغّل as root)
sudo useradd -m -s /bin/bash ghayth
sudo -iu ghayth

# 3. PostgreSQL — أنشئ DB + role
sudo -u postgres createuser -P ghayth
sudo -u postgres createdb -O ghayth ghayth_erp
```

### 3.2 نشر الكود

```bash
# 1. Clone كمستخدم ghayth
sudo -iu ghayth
git clone https://github.com/barhom64/ghayth-erp.git
cd ghayth-erp

# 2. .env
cp .env.example .env
# عدّل: DATABASE_URL=postgres://ghayth:PASSWORD@localhost:5432/ghayth_erp
#       JWT_SECRET=...
#       FIELD_ENCRYPTION_KEY=...
#       CORS_ORIGINS=https://erp.example.com

# 3. Install + build
pnpm install --frozen-lockfile
pnpm run build

# 4. Build الواجهة
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/ghayth-erp run build

# 5. شغّل API عبر PM2 (يقرأ ecosystem.config.cjs تلقائيًا)
pm2 start ecosystem.config.cjs --env production

# 6. اعمل save و startup ليعود تلقائيًا بعد الـ reboot
pm2 save
pm2 startup    # يطبع أمر sudo نفّذه
```

### 3.3 nginx كـ reverse proxy

```bash
# 1. انسخ التمبليت
sudo cp /home/ghayth/ghayth-erp/deploy/nginx.conf.template /etc/nginx/sites-available/ghayth
# عدّل: استبدل ${API_UPSTREAM} بـ http://localhost:8080
sudo sed -i 's|${API_UPSTREAM}|http://localhost:8080|g' /etc/nginx/sites-available/ghayth

# 2. عدّل root في nginx config إلى مسار build الواجهة:
#    root /home/ghayth/ghayth-erp/artifacts/ghayth-erp/dist/public;

# 3. فعّل الموقع
sudo ln -s /etc/nginx/sites-available/ghayth /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 4. SSL عبر Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d erp.example.com
```

### 3.4 صيانة شائعة (PM2)

```bash
pm2 status                        # الحالة العامة
pm2 logs ghayth-api               # تابع اللوج
pm2 monit                         # واجهة مباشرة CPU/RAM
pm2 reload ghayth-api             # zero-downtime reload (يقرأ build الجديد)
pm2 restart ghayth-api            # إعادة تشغيل كاملة
pm2 stop ghayth-api               # إيقاف
```

**النسخ الاحتياطي:** استخدم `scripts/backup.sh` (موجود في الـ repo) في cron يومي.

---

## 4. خيار C — Replit

النظام مصمّم أصلًا للعمل على Replit. كل المتغيرات `REPLIT_*` معالَجة في `app.ts`.

```bash
# 1. Fork الـ repo على Replit
# 2. Replit Secrets — أضف:
#    DATABASE_URL, JWT_SECRET, FIELD_ENCRYPTION_KEY, CORS_ORIGINS
# 3. اضغط Run — replit.nix يثبّت كل شي تلقائيًا
```

تفاصيل بيئة Replit موجودة في `replit.md`.

---

## 5. ترقيات بدون downtime — Zero-downtime upgrades

### Docker Compose
```bash
git pull
docker compose build api web
docker compose up -d --no-deps --build api    # rolling
docker compose up -d --no-deps --build web
```

### PM2
```bash
git pull && pnpm install --frozen-lockfile && pnpm run build
pnpm --filter @workspace/ghayth-erp run build
pm2 reload ghayth-api    # graceful reload — يحافظ على السوكتس المفتوحة
sudo systemctl reload nginx
```

---

## 6. مراقبة وأداء — Monitoring

النظام يصدر pino logs بصيغة JSON. قم بإحالتها إلى:
- **Loki + Grafana** عبر Promtail (الأفضل)
- **Datadog / New Relic** عبر agents
- **Cloud Logging** على GCP / **CloudWatch** على AWS

نقاط مراقبة مهمة:
| Endpoint | الغرض |
|----------|------|
| `GET /api/healthz` | liveness probe |
| `GET /api/_routes` | list endpoints (محمي بـ admin) |
| `GET /api/admin/queue-stats` | حالة queue + dunning |
| `cron_logs` table | تاريخ تشغيل الـ cron jobs |
| `event_dlq` table | الأحداث الفاشلة (يجب أن تظل فارغة) |

شغّل سكربت اختبار الـ smoke دوريًا:
```bash
node audit/api-smoke.mjs        # 928 endpoint، يطبع p50/p95/p99
```

---

## 7. الأمان — Production hardening checklist

- [ ] جميع secrets في secret manager (لا في .env المُلتزَم)
- [ ] `JWT_SECRET` ≥ 64 byte عشوائي
- [ ] `FIELD_ENCRYPTION_KEY` محفوظ في multiple مستقلة (HSM، Vault، إلخ)
- [ ] `bcrypt` rounds = 12 (الافتراضي)
- [ ] HTTPS enforced (certbot أو Cloudflare)
- [ ] `CORS_ORIGINS` محدّد بدقة (لا wildcard)
- [ ] PostgreSQL لا يستمع إلا على localhost (أو VPC) — لا public bind
- [ ] PM2 يشغّل as `ghayth` user، ليس root
- [ ] firewall: 22 (SSH key-only), 80, 443 فقط
- [ ] cron تنظيف logs يعمل (`weeklyDataCleanup` تلقائيًا)
- [ ] backup يومي محفوظ off-site (S3 + lifecycle 90 يوم)
- [ ] Postgres `max_connections` ≥ `PG_POOL_MAX × عدد instances`
- [ ] استعراض `audit_logs` و `event_dlq` أسبوعيًا

---

## 8. استكشاف الأخطاء — Troubleshooting

| العَرَض | السبب المحتمل | الحل |
|---------|--------------|------|
| API returns 500 on every request | `JWT_SECRET` غير موجود | اضبطه في .env وأعد التشغيل |
| Login يُرجع 401 رغم البيانات الصحيحة | `bcrypt` mismatch (تغيّر hash) | reset كلمة المرور عبر admin SQL |
| Migrations تفشل | DB schema قديم/مكسور | استعِد من backup ثم apply migrations يدويًا |
| `event_dlq` يكبر | event handler يرمي أخطاء | راجع `pino` logs وعالج السبب |
| Cron logs > 1M صف | retention cron معطل | تأكد إن `weeklyDataCleanup` يشتغل |
| Push notifications لا تعمل | VAPID keys مفقودة/خاطئة | شغّل `node scripts/src/generate-vapid-keys.mjs` |
| nginx 502 على `/api/*` | api-server down أو wrong port | `pm2 status` / `docker compose ps` |
| Slow queries على dashboards | indexes ناقصة | شغّل `EXPLAIN ANALYZE` و راجع `benchmarks/db/explain-hotpaths.sql` |

---

## 9. ملفات مرجعية في الـ repo

| الملف | الغرض |
|------|------|
| `Dockerfile.api-server` | multi-stage api-server image |
| `Dockerfile.frontend` | nginx + Vite static frontend image |
| `docker-compose.yml` | الـ stack الكامل (db + api + web) |
| `ecosystem.config.cjs` | PM2 cluster + reload + memory caps |
| `deploy/nginx.conf.template` | nginx reverse-proxy config |
| `scripts/src/generate-vapid-keys.mjs` | VAPID keypair generator |
| `scripts/backup.sh` | نسخ احتياطي للقاعدة |
| `scripts/restore.sh` | استرجاع |
| `audit/api-smoke.mjs` | فحص دوري لكل الـ GET endpoints |
| `benchmarks/` | Performance benchmarks (k6/Lighthouse/pgbench) |
