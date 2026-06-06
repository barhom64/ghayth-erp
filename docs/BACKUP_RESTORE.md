# النسخ الاحتياطي والتعافي من الكوارث
# Backup & Disaster Recovery

> **المرجع:** #1608 (تحت المظلة #1594). يوثّق هذا الملف نسخ/استرجاع قاعدة بيانات غيث (PostgreSQL) عبر `DATABASE_URL`، مع **تمرين استرجاع تجريبي مُتحقَّق فعليًا**.

## الأدوات

| السكربت | الوظيفة |
| --- | --- |
| `scripts/backup.sh` | نسخة منطقية كاملة (schema + data + sequences) → ملف `backups/ghayth-erp-<UTC>.sql.gz` مضغوط. لا يكتب الـplaintext على القرص. `--no-owner --no-privileges` لقابلية النقل. |
| `scripts/restore.sh` | استرجاع **هدّام** (`--clean --if-exists`): يحذف ويعيد بناء كل كائن في الـdump. يرفض العمل بلا `--yes`، ويرفض وجهة تحوي `prod/production/live` إلا مع `--i-know-what-im-doing`. |

> ⚠️ مجلد `backups/` و`*.sql.gz` مُستبعَدان في `.gitignore` — **ممنوع رفع أي dump للمستودع** (يحوي بيانات شخصية PDPL وبيانات حية).

## الإعداد

كلا السكربتين يقرآن الاتصال من:
- `DATABASE_URL` (مفضّل) — مثال: `postgres://user:pass@host:5432/db`
- أو متغيرات منفصلة: `DB_NAME / DB_USER / DB_PASSWORD / DB_HOST / DB_PORT` (نفس افتراضيات `db/bootstrap.sh`).

المتطلبات: `pg_dump` و`psql` و`gunzip` (حزمة `postgresql-client-16` أو نظيرتها).

## أخذ نسخة احتياطية

```bash
DATABASE_URL=postgres://… bash scripts/backup.sh
# → backups/ghayth-erp-2026-06-06T20-37-17Z.sql.gz
bash scripts/backup.sh --out /mnt/snapshots   # وجهة مخصّصة
```

**الجدول الموصى به (راجع تعليقات `backup.sh`):**
- كل ساعة أثناء ساعات العمل.
- نسخة ليلية كاملة تُحفظ 30 يومًا.
- نسخة أسبوعية كاملة تُحفظ سنة (offsite).
- التنظيف: `find <dir> -name '*.sql.gz' -mtime +N -delete`.

## الاسترجاع

```bash
DATABASE_URL=postgres://… bash scripts/restore.sh backups/ghayth-erp-<UTC>.sql.gz --yes
# إنتاج (يتطلب تأكيدًا إضافيًا):
DATABASE_URL=postgres://…prod… bash scripts/restore.sh dump.sql.gz --yes --i-know-what-im-doing
```

## تمرين الاسترجاع التجريبي (مُتحقَّق فعليًا — 2026-06-06)

نُفّذ على قاعدة محلية مُقلَعة من `db/bootstrap.sh`:

| الخطوة | الأمر | النتيجة |
| --- | --- | --- |
| 1. زرع صف علامة | `INSERT INTO clients … 'DR-MARKER-قبل-النسخ'` | id=2 ✅ |
| 2. أخذ نسخة | `bash scripts/backup.sh` | `…20-37-17Z.sql.gz` (196K) ✅ |
| 3. إتلاف | `DELETE FROM clients;` | حُذفت ✅ |
| 4. استرجاع | `bash scripts/restore.sh <file> --yes` | `✓ Restore complete.` ✅ |
| 5. تحقق | `SELECT … WHERE name LIKE 'DR-MARKER%'` | **الصف عاد** (id=2) ✅ |

**الخلاصة:** دورة backup → إتلاف → restore تعمل end-to-end وتعيد بناء قاعدة البيانات بالكامل بما فيها بيانات المستخدم.

## خطوات ما بعد الاسترجاع

1. `pnpm db:dump-schema` — للتأكد أن `db/schema.sql` يطابق القاعدة المسترجعة.
2. `pnpm typecheck` — للتأكد من توافق الأنواع.
3. اختبار دخان للـAPI ورحلة مالية (`scripts/verify-finance-posting-journey.sh`).

## RPO / RTO (توصية)

- **RPO** (أقصى فقد بيانات): ساعة واحدة (بالنسخ الساعية). يمكن خفضه عبر WAL archiving / PITR على مستوى البنية التحتية.
- **RTO** (زمن الاسترجاع): دقائق لقاعدة بحجم نموذجي عبر `restore.sh`.
- **الأسرار**: لا تُحفظ في الـdump (`--no-privileges`)؛ تُدار عبر `.env`/خزنة الأسرار، وتُستعاد من إعداد البنية التحتية لا من النسخة.
