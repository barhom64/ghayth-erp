# قواعد كتالوج المكتبات (pnpm catalog discipline)

> آخر تحديث: 2026-05-09  
> الملف الموثوق: `pnpm-workspace.yaml` — قسم `catalog:`

## لماذا الكتالوج؟

في monorepo بـ 5 تطبيقات + 5 مكتبات داخلية، أي مكتبة طرف ثالث مستخدمة في تطبيقَين أو أكثر يجب أن تأتي من **نسخة واحدة موحّدة** لا أن تُكرَّر بنسخ مختلفة في كل `package.json`. هذا يضمن:

- ترقية مكتبة من مكان واحد بدلًا من 5 ملفات.
- صفر فرصة لتعارض `react@19.1.0` مع `react@19.2.0` بين تطبيقَين في نفس البناء.
- فحص مرئي سريع لما يُعتمَد عليه فعلًا.

## القاعدة الذهبية

> **إذا كانت مكتبة طرف ثالث تظهر في `package.json` لتطبيقين أو أكثر، يجب أن تكون في الكتالوج وأن تُستخدم بـ `"catalog:"` في كل `package.json`.**

## كيف تضيف مكتبة جديدة

1. افتح `pnpm-workspace.yaml`.
2. أضف السطر تحت `catalog:`:
   ```yaml
   catalog:
     'my-new-lib': ^1.2.3
   ```
3. في `package.json` لكل تطبيق يحتاجها:
   ```json
   "my-new-lib": "catalog:"
   ```
4. شغّل `pnpm install` ثم `pnpm typecheck`.
5. اعمل commit: `chore(deps): add my-new-lib via catalog`.

## كيف تُحدّث مكتبة

استخدم `pnpm up` على مستوى الكتالوج، **ليس** على مستوى تطبيق:

```bash
# بأمر واحد للجميع
pnpm up --recursive --latest <package-name>

# أو يدويًا في pnpm-workspace.yaml ثم
pnpm install
```

ثم تأكد من:
- `pnpm typecheck` (كل الباكدجات)
- `pnpm lint:patterns`
- `pnpm audit:schema`

## مكتبات ممنوعة (Library Bans)

لتجنّب تكدّس bundle وتقسيم تجربة المطوّر، الأنظمة التالية مُجمَّدة على اختيار **واحد** فقط:

| الفئة | المعتمد | الممنوع |
|-------|--------|--------|
| Toast / Notifications | `sonner` (في portals) + `@radix-ui/react-toast` (في main) | لا `react-hot-toast`، لا `react-toastify` |
| Routing | `wouter` (3 تطبيقات) — `react-router-dom` في `ghayth-erp-deck` فقط لأسباب تاريخية | لا `tanstack-router`، لا إضافة router ثاني لتطبيق آخر |
| Icons | `lucide-react` فقط | لا `react-icons`، لا `@heroicons/react` (يُسحب react-icons تدريجيًا من portals) |
| Charts | `recharts` | لا `chart.js`، لا `nivo` |
| Forms | `react-hook-form` + `zod` + `@hookform/resolvers` | لا `formik`، لا تحقق يدوي يحلّ محل zod |
| Animation | `tw-animate-css` | لا `tailwindcss-animate` (بديل قديم) |
| HTTP client (frontend) | `fetch` + `@tanstack/react-query` | لا `axios`، لا `swr` |
| Date | `date-fns` (portals) — في main يُستخدم Intl + dayHelpers محلية | لا `moment`، لا `dayjs`، لا `luxon` |

## Native dialogs ممنوعة

- ❌ `window.alert(...)` — استخدم `toast.error(...)` من `sonner` (أو `useToast` في main).
- ❌ `window.confirm(...)` — استخدم `<AlertDialog>` من shadcn/ui.
- ❌ `window.prompt(...)` — استخدم `<Dialog>` مع `<Input>`.

السبب: native dialogs تكسر RTL، تُجبر تجربة OS-default، ولا تتكامل مع توك RTL/dark-mode، ولا يُمكن اختبارها في e2e بسهولة.

## Navigation ممنوعة

- ❌ `window.location.href = "/x"` للتنقّل داخل التطبيق — استخدم `useLocation()` من wouter (`navigate("/x")`).
- ❌ `window.location.reload()` لتحديث البيانات — استخدم `queryClient.invalidateQueries(...)`.
- ✅ مسموح فقط: `window.location.href = redirectURL` للتوجّه إلى endpoint خارجي (OAuth callback، تنزيل ملف).

## مراجعة دورية

كل ربع سنة:
1. شغّل `pnpm outdated --recursive` وراجع الترقيات الكبرى.
2. شغّل `pnpm dedupe` ونظّف dependencies المكرّرة في الـ lockfile.
3. تحقق من أي مكتبة جديدة دخلت `package.json` بنسخة حرفية ولم تذهب للكتالوج — هذا انحراف يجب تصحيحه فورًا.

## مراجع داخلية

- `LIBRARIES_AND_CONSISTENCY_AUDIT_2026-05-09.md` — تحليل شامل لانحراف المكتبات وقت إنشاء هذا الملف.
- `pnpm-workspace.yaml` — مصدر الحقيقة الوحيد للنسخ.
- `scripts/src/lint-patterns.mjs` — يفحص الأنماط الممنوعة في المستودع.
