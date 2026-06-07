// ─────────────────────────────────────────────────────────────────────────────
// مطابقة الصلاحيات — المنطق الموحّد لبوّابات الواجهة (#1413، الخطة الجذرية §3 م4)
//
// الواجهة قد تطلب صلاحية إمّا خشنة `module:action` (مثل finance:approve) أو دقيقة
// `module.feature:action` (مثل finance.invoices:approve). جسر /permissions/my صار
// يصدر النوعين معًا من منح RBAC v2، لكن قد لا تملك بعض الشركات سوى المجموعة
// القديمة الخشنة. لذا تعتبر هذه الدالة الصلاحية الدقيقة مُحقَّقة أيضًا بمنحة خشنة
// مطابقة — مجموعة فوقية صارمة: تُرجِع true في كل الحالات التي كانت تُرجِعها سابقًا
// وتزيد عليها، فلا يختفي أي زرّ كان ظاهرًا (ترحيل البوّابات إلى الدقيق بلا انحدار).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * هل تُغطّي مجموعة الصلاحيات الممنوحة الصلاحيةَ المطلوبة؟
 *
 * يطابق بالترتيب: الكلّي `*` ← المطابقة الحرفية ← `scope:*` (وايلدكارد على نفس
 * النطاق) ← `module:*` (وايلدكارد الموديول) ← `module:action` (تراجُع خشن لمفتاح
 * دقيق). `module` هو الجزء قبل أوّل نقطة من النطاق.
 */
export function permissionMatches(granted: readonly string[], required: string): boolean {
  if (!required) return true;
  if (granted.includes("*")) return true;
  if (granted.includes(required)) return true; // exact (fine or coarse)

  const [scopePart, action] = required.split(":");
  if (!scopePart) return false;
  if (granted.includes(`${scopePart}:*`)) return true; // feature/scope wildcard

  const moduleKey = scopePart.split(".")[0]; // coarse module of a fine key
  if (moduleKey && moduleKey !== scopePart) {
    if (granted.includes(`${moduleKey}:*`)) return true;                 // module wildcard
    if (action && granted.includes(`${moduleKey}:${action}`)) return true; // coarse grant satisfies fine ask
  } else if (granted.includes(`${moduleKey}:*`)) {
    return true; // coarse key whose module wildcard is granted
  }
  return false;
}
