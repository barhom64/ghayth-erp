# UPDATING — تعليمات التحديث ومنع التعارضات
**Ghayth ERP — Sync, Push, and Conflict Prevention Guide**

> هذا الدليل يصف كيف يُحدَّث المستودع، يُرفع إلى GitHub، ويُمنع التعارض بين بيئة التطوير على Replit و GitHub repo `barhom64/ghayth-erp`.

---

## 1. القاعدة الذهبية

**Replit هو مصدر الحقيقة (source of truth) للكود التشغيلي.** أي تعديل يجب أن يبدأ من Replit ثم يُرفع إلى GitHub. **لا تُعدّل ملفات الكود مباشرة على GitHub** (باستثناء `.github/workflows/*` — انظر §5).

---

## 2. كيف تُرفع التحديثات إلى GitHub

### 2.1 لا تستخدم `git push` المحلي
أوامر `git push`, `git commit`, `git rebase`, `git reset` **محظورة** في بيئة Replit (sandbox restriction). الدفع يتم حصرًا عبر:

```bash
node scripts/_push2.mjs
```

### 2.2 الخطوات
1. ضع قائمة الملفات المراد رفعها في `/tmp/_push2_state.json`:
   ```json
   {
     "remaining": [
       "path/to/file1.ts",
       "path/to/file2.md"
     ],
     "failures": [],
     "startIdx": 0
   }
   ```
2. شغّل: `node scripts/_push2.mjs`
3. السكربت:
   - يقرأ كل ملف من القرص
   - يجلب الـ SHA الحالية من GitHub API (`GET /repos/.../contents/{path}`)
   - يرفع المحتوى الجديد بـ`PUT` مع الـSHA لمنع overwrite عشوائي
   - 5 محاولات إعادة عند فشل الشبكة
   - يحدّث الحالة في `/tmp/_push2_state.json` للاستئناف عند الانقطاع

### 2.3 أمثلة عملية

**رفع ملف واحد:**
```bash
echo '{"remaining":["replit.md"],"failures":[],"startIdx":0}' > /tmp/_push2_state.json
node scripts/_push2.mjs
```

**رفع كل التعديلات الأخيرة (آخر ساعة):**
```bash
find artifacts lib scripts replit.md -type f -mmin -60 \
  -not -path "*/node_modules/*" -not -path "*/dist/*" \
  | jq -R . | jq -s '{remaining: ., failures: [], startIdx: 0}' \
  > /tmp/_push2_state.json
node scripts/_push2.mjs
```

---

## 3. كيف تتحقق من حالة المستودع

```bash
# 1. ملفات معدّلة محليًا في آخر 6 ساعات
find artifacts lib scripts replit.md -type f -mmin -360 \
  -not -path "*/node_modules/*" -not -path "*/dist/*" 2>/dev/null

# 2. آخر commit محلي
git --no-optional-locks log --oneline -5

# 3. حالة GitHub لملف معيّن (عبر السكربت)
node -e "
import('@replit/connectors-sdk').then(async ({ReplitConnectors}) => {
  const c = new ReplitConnectors();
  const r = await c.proxy('github', '/repos/barhom64/ghayth-erp/commits?per_page=5', {method:'GET'});
  const j = await r.json();
  j.forEach(x => console.log(x.sha.slice(0,7), '-', x.commit.message.split('\n')[0]));
});
"
```

---

## 4. منع التعارضات

### 4.1 قبل أي عمل
1. اقرأ `replit.md` كاملًا — يحتوي على قرارات معمارية و gotchas حرجة
2. شغّل `pnpm typecheck` للتحقق من الأساس النظيف
3. شغّل `pnpm audit:schema && pnpm audit:routes && pnpm audit:boundaries`

### 4.2 أثناء العمل
- **لا تُعدّل ملف على GitHub UI ثم تُعدّله محليًا** — هذا أكبر مصدر تعارض. السكربت يستخدم SHA-checking لكن `_push2.mjs` يفترض أنه آخر من كتب.
- **لا تُشغّل migrations يدويًا في الـDB** — كل تغيير schema عبر ملف SQL جديد في `artifacts/api-server/src/migrations/` (يُطبَّق تلقائيًا عند إقلاع `api-server`).
- **اتبع الترقيم التتابعي للـmigrations** — آخر رقم: `118_fk_indexes.sql`. أضف `119_*.sql`، `120_*.sql` إلخ.

### 4.3 بعد كل تعديل
1. دفع إلى GitHub فورًا (لا تتراكم تعديلات لأيام)
2. حدّث `replit.md` إذا أضفت ميزة معمارية أو غيّرت قرارًا
3. شغّل audit scripts للتأكد من عدم كسر شيء

---

## 5. استثناء: GitHub Actions

ملفات `.github/workflows/*.yml` **لا يمكن رفعها** عبر `_push2.mjs` (GitHub يرفض contents API لها). يجب تعديلها مباشرة على GitHub UI أو عبر personal access token محلي.

---

## 6. ما لا يُرفع إلى GitHub (`.gitignore`)

| النوع | المسار | السبب |
| --- | --- | --- |
| Dependencies | `node_modules/`, `pnpm-store/` | يُعاد تثبيتها عبر `pnpm install` |
| Build outputs | `*/dist/`, `*/.cache/`, `*/.vite/` | يُعاد بناؤها |
| Local config | `.local/`, `attached_assets/` | خاصة بجلسة Replit |
| Env files | `artifacts/api-server/.env` | secrets — استخدم `.env.example` كمرجع |
| Generated audit | `audit/inventory.json`, `audit/api-smoke-results.json`, `audit/report/*.csv`, `audit/report/*.txt` | ناتج عن سكربتات (يُعاد توليده) |
| Stale FE inventory | `existing_*.txt`, `imported_*.txt` (root) | ملفات قديمة من April — لم تعد مفيدة |

> **ملاحظة:** سكربتات الـaudit نفسها (`audit/*.mjs`) مُتعقَّبة في git — يحتاجها أي مطور لإعادة توليد التقارير.

---

## 7. تنظيف المستودع — Cleanup Checklist

شهريًا، شغّل:
```bash
# 1. حذف الـbuild outputs المحلية
find . -type d -name dist -not -path "*/node_modules/*" -exec rm -rf {} +
find . -type d -name .cache -not -path "*/node_modules/*" -exec rm -rf {} +

# 2. تنظيف cron_logs أقدم من 30 يومًا (يُحفظ التطور التشغيلي)
psql "$DATABASE_URL" -c "DELETE FROM cron_logs WHERE \"createdAt\" < NOW() - INTERVAL '30 days';"
psql "$DATABASE_URL" -c "DELETE FROM user_activity_log WHERE \"createdAt\" < NOW() - INTERVAL '30 days';"

# 3. تنظيف /tmp
rm -f /tmp/_push2_state.json /tmp/code_tables.txt /tmp/recent.txt
```

---

## 8. أوامر دفع كاملة جاهزة

### دفع تقرير + ملفات audit:
```bash
cat > /tmp/_push2_state.json << 'EOF'
{
  "remaining": [
    "GHAITH_FULL_SYSTEM_VERIFICATION_REPORT.md",
    "replit.md",
    "UPDATING.md",
    ".gitignore"
  ],
  "failures": [],
  "startIdx": 0
}
EOF
node scripts/_push2.mjs
```

### دفع كل تعديلات api-server في آخر 24 ساعة:
```bash
find artifacts/api-server/src -type f \( -name "*.ts" -o -name "*.sql" \) -mmin -1440 \
  | jq -R . | jq -s '{remaining: ., failures: [], startIdx: 0}' \
  > /tmp/_push2_state.json
node scripts/_push2.mjs
```

---

## 9. جدول المسؤوليات

| العملية | الأداة | بمن يُسمح |
| --- | --- | --- |
| تعديل الكود | محرر Replit | كل المطورين |
| الدفع إلى GitHub | `scripts/_push2.mjs` | كل المطورين |
| تطبيق migration | إقلاع `api-server` تلقائيًا | تلقائي |
| حذف ملف على GitHub | GitHub UI أو API يدويًا | المسؤول فقط |
| تعديل `.github/workflows/*` | GitHub UI مباشرة | المسؤول فقط |
| تنظيف logs DB | psql دوريًا | DBA |
| إنشاء فترة مالية | API `/api/finance/periods` | المحاسب |

---

## 10. في حالة التعارض (Conflict Resolution)

إذا فشل `_push2.mjs` بـ422 (SHA mismatch):
1. السبب: شخص آخر عدّل الملف على GitHub بعد آخر pull محلي
2. الحل:
   ```bash
   # اجلب النسخة من GitHub
   curl -s "https://raw.githubusercontent.com/barhom64/ghayth-erp/main/PATH/TO/FILE" > /tmp/remote-version
   # قارن مع المحلي
   diff /tmp/remote-version PATH/TO/FILE
   # ادمج يدويًا، ثم أعد المحاولة
   ```

---

— *آخر تحديث: 2026-05-06*
