# غيث ERP — عرض المدير العام

## تصدير PDF بضغطة واحدة

```bash
pnpm --filter @workspace/ghayth-erp-deck run export-pdf
```

السكربت يبني العرض ثم يكتشف مسار chromium تلقائياً (يقبل تجاوز عبر `CHROMIUM_PATH`)، وينتج الملف في `deliverables/Ghayth-ERP-Presentation.pdf`.
