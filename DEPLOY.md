# Ghayth ERP — Deployment Guide

دليل النشر الإنتاجي لـ **غيث ERP**. النشر الإنتاجي القياسي هو **Docker Compose على VPS، يتبع فرع `main` تلقائيًا**.

> Production deployment guide. The canonical production deployment is a single-node **Docker Compose** stack on a VPS that auto-deploys from the `main` branch. Files referenced live at the repo root unless noted.

---

## 1. متطلبات قبل النشر — Pre-flight checklist

| المتطلب | القيمة الإنتاجية | كيفية الحصول عليها |
|---------|----------------|------------------|
| `POSTGRES_PASSWORD` | كلمة مرور قوية | `openssl rand -hex 24` |
| `JWT_SECRET` | 64-byte عشوائي | `openssl rand -hex 32` |
| `FIELD_ENCRYPTION_KEY` | 32-byte hex | `openssl rand -hex 32` (لا تفقده — يفقد البيانات المشفّرة) |
| `SECRETS_ENCRYPTION_KEY` | 32-byte hex | نفس الأمر |
| `CORS_ORIGINS` | عنوان الواجهة | `https://erp.door.sa` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | أول مستخدم admin | كلمة مرور قوية، 10 أحرف+ |
| `VAPID_*` (Push اختياري) | EC P-256 keypair | `node scripts/src/generate-vapid-keys.mjs` |

⚠️ **حذار:** فقدان `FIELD_ENCRYPTION_KEY` بعد التشفير = فقدان البيانات الحساسة (هويات المعتمرين، معلومات بنكية). احتفظ به بنسخة آمنة خارج الـ repo.

---

## 2. النشر الإنتاجي — Docker Compose على VPS

النواة: `docker-compose.prod.yml` (خدمات: `db` Postgres 16 + `api` على 8080 + `redis` + `web` nginx على `127.0.0.1:8088`). الواجهة تبروكسي `/api/*` إلى الـ api داخل شبكة Docker الداخلية. `api` يطبّق الـ migrations تلقائيًا عند الإقلاع.

### 2.1 إعداد أوّلي على سيرفر نظيف (Ubuntu)

سكربت واحد يثبّت Docker + nginx (كـ reverse proxy للمنفذ 80) + ufw، يستنسخ `main`، يولّد `.env` بأسرار عشوائية، يبني ويشغّل الـ stack، ويصدر شهادة HTTPS:

```bash
sudo bash deploy/setup-hostinger-vps.sh erp.door.sa
```

بعدها احفظ كلمة مرور الـ admin المولّدة من `/opt/ghayth-erp/.env`. مرجع المتغيرات: `.env.production.example`.

### 2.2 النشر التلقائي من main — Auto-deploy

`deploy/auto-deploy.sh` يقارن `HEAD` المحلي بـ `origin/main`؛ وإذا تحرّك الريموت يعمل `git reset --hard` ثم `docker compose -f docker-compose.prod.yml up -d --build`. شغّله عبر systemd timer (المستودع عام، فالسحب لا يحتاج أسرار):

```bash
# مثال وحدة systemd تستدعي سكربت المستودع
sudo tee /etc/systemd/system/ghayth-auto-deploy.service >/dev/null <<'EOF'
[Unit]
Description=Ghayth ERP auto deploy from GitHub (main)
[Service]
Type=oneshot
ExecStart=/opt/ghayth-erp/deploy/auto-deploy.sh
EOF

sudo tee /etc/systemd/system/ghayth-auto-deploy.timer >/dev/null <<'EOF'
[Unit]
Description=Run Ghayth ERP auto deploy periodically
[Timer]
OnBootSec=1min
OnUnitActiveSec=2min
AccuracySec=10s
[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now ghayth-auto-deploy.timer
tail -f /var/log/ghayth-auto-deploy.log     # متابعة
```

### 2.3 صيانة شائعة

```bash
cd /opt/ghayth-erp
docker compose -f docker-compose.prod.yml ps                       # الحالة
docker compose -f docker-compose.prod.yml logs -f api              # لوج الـ API
docker compose -f docker-compose.prod.yml exec db psql -U ghayth -d ghayth_erp   # SQL shell
docker compose -f docker-compose.prod.yml up -d --build            # إعادة بناء + تشغيل
```

### 2.4 النسخ الاحتياطي / الاسترجاع

```bash
# نسخة احتياطية
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U ghayth -F c ghayth_erp > /opt/backups/ghayth/$(date +%F).dump

# استرجاع
cat /opt/backups/ghayth/2026-05-30.dump | \
  docker compose -f docker-compose.prod.yml exec -T db pg_restore -U ghayth -d ghayth_erp --clean
```

### 2.5 تهيئة قاعدة بيانات جديدة من dumps (اختياري)

لسيرفر جديد تمامًا تريد تحميله من `db/*.sql` بدل ترك الـ migrations تبنيه:

```bash
bash deploy/bootstrap-prod-db.sh           # يرفض الكتابة فوق DB غير فارغة
FORCE_RESET=true bash deploy/bootstrap-prod-db.sh   # يمسح ويعيد البناء (حذر!)
```

التثبيت من أرشيف بدل git: `GHAYTH_ARCHIVE_URL=... sudo bash deploy/install-from-archive.sh erp.door.sa`.

---

## 3. التطوير / الـ staging — Replit

النظام يعمل على Replit كبيئة تطوير/staging من نفس مصدر `main`. تفاصيل البيئة في `replit.md`. للتشغيل المحلي بـ Docker للتجربة فقط: `docker compose up --build` (يستخدم `docker-compose.yml` التطويري).

---

## 4. مراقبة وأداء — Monitoring

النظام يصدر pino logs بصيغة JSON. أحلها إلى Loki+Grafana / Datadog / Cloud Logging.

| Endpoint | الغرض |
|----------|------|
| `GET /api/healthz` | liveness probe |
| `GET /api/_routes` | list endpoints (محمي بـ admin) |
| `GET /api/admin/queue-stats` | حالة queue + dunning |
| `cron_logs` table | تاريخ تشغيل الـ cron jobs |
| `event_dlq` table | الأحداث الفاشلة (يجب أن تظل فارغة) |

---

## 5. الأمان — Production hardening checklist

- [ ] جميع secrets في `/opt/ghayth-erp/.env` بصلاحية `600` (لا في الـ repo)
- [ ] `JWT_SECRET` ≥ 64 byte عشوائي
- [ ] `FIELD_ENCRYPTION_KEY` محفوظ بنسخة آمنة مستقلة
- [ ] HTTPS enforced (certbot)
- [ ] `CORS_ORIGINS` محدّد بدقة (لا wildcard)
- [ ] PostgreSQL لا يُنشر للعموم — يبقى داخل شبكة Docker الداخلية فقط
- [ ] firewall: 22 (SSH key-only), 80, 443 فقط
- [ ] backup يومي محفوظ off-site
- [ ] استعراض `audit_logs` و `event_dlq` أسبوعيًا

---

## 6. استكشاف الأخطاء — Troubleshooting

| العَرَض | السبب المحتمل | الحل |
|---------|--------------|------|
| API returns 500 on every request | secret ناقص في `.env` | اضبطه وأعد `up -d` |
| Login يُرجع 401 رغم البيانات الصحيحة | hash mismatch | reset كلمة المرور عبر admin SQL |
| Migrations تفشل عند الإقلاع | DB schema قديم/مكسور | استعِد من backup ثم أعد التشغيل |
| `event_dlq` يكبر | event handler يرمي أخطاء | راجع لوج `api` وعالج السبب |
| nginx 502 على `/api/*` | حاوية api غير صحّية | `docker compose -f docker-compose.prod.yml ps` |

---

## 7. ملفات مرجعية في الـ repo

| الملف | الغرض |
|------|------|
| `docker-compose.prod.yml` | الـ stack الإنتاجي (db + api + redis + web) |
| `Dockerfile.api-server` | صورة api-server |
| `Dockerfile.frontend` | صورة nginx + Vite static frontend |
| `deploy/setup-hostinger-vps.sh` | إعداد سيرفر نظيف (Docker + nginx + HTTPS) |
| `deploy/auto-deploy.sh` | نشر تلقائي من `main` (systemd timer) |
| `deploy/bootstrap-prod-db.sh` | تحميل قاعدة بيانات جديدة من `db/*.sql` |
| `deploy/install-from-archive.sh` | تثبيت من أرشيف بدل git |
| `deploy/nginx.conf.template` | إعداد nginx داخل حاوية الـ web |
| `.env.production.example` | مرجع متغيرات البيئة الإنتاجية |
