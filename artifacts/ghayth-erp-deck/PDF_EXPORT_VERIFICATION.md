# تحقق تصدير PDF — الأيقونات والمخطط المعماري

تاريخ الفحص: 2026-04-19  
المرجع: المهمة #126

## الإجراء

```bash
pnpm --filter @workspace/ghayth-erp-deck run export-pdf
```

ينتج: `deliverables/Ghayth-ERP-Presentation.pdf` (19 صفحة، 1920×1080، DPR=2).

## ما تم فحصه

تم استخراج صور JPEG عبر `pdftoppm` لعينة من الشرائح:

| شريحة | المحتوى الحرج | النتيجة |
| ----- | ------------- | ------- |
| 5 (HR) | أيقونة SVG inline (شخصان) + عناوين Tajawal | ✅ حادّة |
| 8 (FLT) | أيقونة شاحنة + رمز خلفي شفّاف | ✅ حادّة |
| 11 (PRJ) | أيقونة كانبان عمودية + رمز خلفي | ✅ حادّة |
| 14 (PRT) | أيقونة بوابات + ثلاث بطاقات | ✅ حادّة |
| 15 (HowItWorks) | `ArchitectureDiagram` بـ4 طبقات وأسهم وعناصر `<text>` Tajawal | ✅ نص عربي حاد داخل SVG، أسهم سليمة |

## النقاط الفنية المؤكَّدة

1. **خطوط Tajawal داخل `<text>` SVG**: تُحمَّل من Google Fonts في `index.html` ويتوقّف Puppeteer عند `document.fonts.ready` قبل الطباعة، لذا تُرسَم فعلياً (لا تتحوّل إلى fallback).
2. **الأيقونات الـ SVG inline في `ModuleIcons.tsx`**: تحافظ على الحدّة عند `deviceScaleFactor: 2` و `--font-render-hinting=none`.
3. **الأسهم/العلامات (`<marker>`)**: يحوّلها Chromium إلى مسارات vector فلا تتأثر بالضغط.
4. **الألوان عبر `var(--slide-*)`**: تُحسم بقاعدة `print-color-adjust: exact` المضافة في السكربت.

## بدون مشاكل مرصودة

لم نحتج إلى تضمين الخطوط داخل SVG (`<defs><style>@font-face…`) لأن تحميلها على مستوى الصفحة كافٍ ضمن نفس المستند. إن ظهرت لاحقاً مشكلة في بيئة بلا اتصال بالإنترنت، الحلّ المقترح: تنزيل ملفات Tajawal محلياً وتضمينها كـ `@font-face` في `index.css` بصيغة base64.
