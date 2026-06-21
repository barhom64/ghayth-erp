// ─────────────────────────────────────────────────────────────────────────────
// مطابقة الصلاحيات — المنطق الموحّد لبوّابات الواجهة (#1413، الخطة الجذرية §3 م4)
//
// الواجهة قد تطلب صلاحية إمّا خشنة `module:action` (مثل finance:approve) أو دقيقة
// `module.feature:action` (مثل finance.invoices:approve). جسر /permissions/my صار
// يُصدِر منح RBAC v2 بالصيغة الدقيقة فقط (feature.action)، بينما تبقى المجموعة
// القديمة في `role_permissions` خشنة. هذه الدالة توحّد القراءة:
//
//   • طلب خشن `module:action` ← يتحقّق إن مُنح حرفيًا، أو `module:*`، أو **أي**
//     منحة دقيقة داخل الموديول `module.<أي>:action` (فتُضيء البوّابات الخشنة من
//     منح RBAC الدقيقة).
//   • طلب دقيق `module.feature:action` ← يتحقّق حرفيًا، أو `feature:*`، أو
//     `module:*`، أو منحة خشنة قديمة `module:action` (توافقية مع الشركات التي لم
//     تتبنَّ التحكّم الدقيق). للشركات على RBAC (لا منح خشنة) يكون الطلب الدقيق
//     **دقيقًا تمامًا** — لا تسرّب بين ميزات الموديول.
//
// مجموعة فوقية صارمة لمنطق ما قبلها: تُرجِع true في كل ما كانت تُرجِعه وتزيد، فلا
// يختفي أي زرّ كان ظاهرًا.
// ─────────────────────────────────────────────────────────────────────────────

/** هل تُغطّي مجموعة الصلاحيات الممنوحة الصلاحيةَ المطلوبة؟ */
export function permissionMatches(granted: readonly string[], required: string): boolean {
  if (!required) return true;
  if (granted.includes("*")) return true;
  if (granted.includes(required)) return true; // exact (fine or legacy coarse)

  const [scopePart, action] = required.split(":");
  if (!scopePart) return false;
  if (granted.includes(`${scopePart}:*`)) return true; // wildcard on the same scope

  const moduleKey = scopePart.split(".")[0];
  const isFineAsk = scopePart.includes(".");

  if (granted.includes(`${moduleKey}:*`)) return true; // module wildcard

  // منحة wildcard على مستوى الموديول بالصيغة الدقيقة: `module.*:action` /
  // `module.*:*` (مثل `finance.*` الممنوحة للمدير المالي، تُسقَط من جسر
  // /permissions/my حرفيًا «finance.*:action»). بدون هذا، طلبٌ دقيق مثل
  // `finance.journals:list` لا يطابق منحة المدير `finance.*` فتختفي عنه أزرار
  // وصفحات دقيقة الحراسة. إضافي بحت لحاملي `module.*` (المدراء) — لا يُخفي
  // شيئًا كان ظاهرًا. RBAC-REV-WILDCARD.
  if (granted.includes(`${moduleKey}.*:*`)) return true;
  if (action && granted.includes(`${moduleKey}.*:${action}`)) return true;

  if (isFineAsk) {
    // legacy coarse grant satisfies a fine ask (compat for non-granular tenants)
    if (action && granted.includes(`${moduleKey}:${action}`)) return true;
    return false;
  }

  // coarse ask: any fine grant within the module for the same action satisfies it
  if (action) {
    const prefix = `${moduleKey}.`;
    const suffix = `:${action}`;
    for (const g of granted) {
      if (g.startsWith(prefix) && g.endsWith(suffix)) return true;
    }
  }
  return false;
}
