// ─────────────────────────────────────────────────────────────────────────────
// PERMISSION LEVELS — النموذج المبسّط الموحّد للصلاحيات (طبقة عرض عربية)
// ─────────────────────────────────────────────────────────────────────────────
// طبقة *إضافية* فوق نموذج الصلاحيات الخماسي القائم (Module × Feature × Action ×
// Scope × Conditions). لا تغيّر محرك الفرض (authzEngine) إطلاقًا — بل تترجم
// الأفعال/النطاقات التقنية إلى **مستويات ونطاقات عربية بسيطة** يتحكم بها مالك
// غير تقني من الواجهة، وتُوسّع هذه المستويات إلى أفعال النموذج القائم عند الحفظ.
//
// المبدأ: المالك يختار لكل ميزة «مستوى» واحدًا + «نطاقًا» واحدًا — بدل تحديد 14
// فعلًا و9 نطاقات يدويًا. الواجهة تعرض هذا؛ المحرك يفرض الأفعال الموسّعة.

import type { Action, Scope } from "./featureCatalog.js";

// ── تسميات الأفعال بالعربية (للعرض في الواجهة) ──
export const ACTION_LABELS_AR: Record<Action, string> = {
  view: "عرض",
  list: "عرض القائمة",
  create: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  approve: "اعتماد",
  reject: "رفض",
  cancel: "إلغاء",
  export: "تصدير",
  print: "طباعة",
  share: "مشاركة",
  submit: "رفع/تقديم",
  reopen: "إرجاع/إعادة فتح",
  close: "إغلاق",
};

// ── تسميات النطاقات بالعربية ──
export const SCOPE_LABELS_AR: Record<Scope, string> = {
  self: "الخاص بي فقط",
  team: "فريقي (مرؤوسيّ)",
  department: "قسمي",
  department_tree: "قسمي والأقسام التابعة",
  branch: "فرعي",
  branches: "فروع محددة",
  company: "الشركة كاملة",
  multi_company: "شركات محددة",
  all: "كل الشركات",
};

// ── المستويات المبسّطة: كل مستوى يشمل ما قبله (تراكمي) ──
// key مستقر للتخزين؛ labelAr للعرض؛ actions الأفعال التي يوسّع إليها.
export type PermissionLevelKey = "none" | "view" | "contribute" | "approve" | "manage";

export interface PermissionLevel {
  key: PermissionLevelKey;
  labelAr: string;
  descriptionAr: string;
  rank: number;          // ترتيب تصاعدي للصلاحية
  actions: Action[];     // الأفعال المُوسّعة (تراكمية)
}

export const PERMISSION_LEVELS: PermissionLevel[] = [
  {
    key: "none",
    labelAr: "بلا صلاحية",
    descriptionAr: "لا يرى ولا يعدّل هذه الميزة إطلاقًا.",
    rank: 0,
    actions: [],
  },
  {
    key: "view",
    labelAr: "عرض فقط",
    descriptionAr: "يطّلع ويطبع ويصدّر — دون أي تعديل.",
    rank: 1,
    actions: ["view", "list", "export", "print"],
  },
  {
    key: "contribute",
    labelAr: "إدخال وإنشاء مسودة",
    descriptionAr: "يُنشئ ويقدّم مسودات للاعتماد — لا يعتمدها بنفسه.",
    rank: 2,
    actions: ["view", "list", "export", "print", "create", "submit"],
  },
  {
    key: "approve",
    labelAr: "اعتماد / رفض / إرجاع",
    descriptionAr: "يعتمد أو يرفض أو يُرجع ما يقدّمه الآخرون (مدير قسم/فرع).",
    rank: 3,
    actions: ["view", "list", "export", "print", "create", "submit", "approve", "reject", "reopen"],
  },
  {
    key: "manage",
    labelAr: "تحكم كامل",
    descriptionAr: "كل ما سبق + تعديل وحذف وإلغاء وإغلاق ومشاركة.",
    rank: 4,
    actions: ["view", "list", "export", "print", "create", "submit", "approve", "reject", "reopen", "update", "delete", "cancel", "close", "share"],
  },
];

const LEVEL_BY_KEY = new Map(PERMISSION_LEVELS.map((l) => [l.key, l]));

/** يوسّع مستوى مبسّط إلى مجموعة الأفعال التقنية، مقصورًا على أفعال الميزة المتاحة. */
export function expandLevel(level: PermissionLevelKey, availableActions?: Action[]): Action[] {
  const def = LEVEL_BY_KEY.get(level);
  if (!def) return [];
  if (!availableActions) return [...def.actions];
  const avail = new Set(availableActions);
  return def.actions.filter((a) => avail.has(a));
}

/**
 * يستنتج المستوى المبسّط من مجموعة أفعال مُسندة (للعرض في الواجهة): أعلى مستوى
 * تكون كل أفعاله المتاحة مشمولة في المجموعة. يتجاهل الأفعال غير المتاحة للميزة
 * حتى لا يُخفَّض المستوى بسبب فعل لا تدعمه الميزة أصلًا.
 */
export function levelOfActions(granted: Action[], availableActions?: Action[]): PermissionLevelKey {
  const have = new Set(granted);
  const avail = availableActions ? new Set(availableActions) : null;
  let best: PermissionLevelKey = "none";
  // When a feature lacks the distinguishing actions of a higher level, that
  // level's available-action set collapses onto a lower one — treat them as
  // indistinguishable and never promote past the lowest level with that
  // signature (avoids reporting "manage" for a view/create-only feature).
  const seenSignatures = new Set<string>();
  for (const lvl of [...PERMISSION_LEVELS].sort((a, b) => a.rank - b.rank)) {
    const required = avail ? lvl.actions.filter((a) => avail.has(a)) : lvl.actions;
    const signature = [...required].sort().join(",");
    if (lvl.key !== "none" && seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);
    if (required.length === 0 && lvl.key !== "none") continue;
    if (required.every((a) => have.has(a))) best = lvl.key;
  }
  return best;
}

// ── نطاقات السلطة المبسّطة (5 بدل 9) — كل واحد يربط بنطاق النموذج القائم ──
export type ScopeTierKey = "self" | "department" | "branch" | "company" | "all";

export interface ScopeTier {
  key: ScopeTierKey;
  labelAr: string;
  rank: number;
  scope: Scope; // النطاق المقابل في النموذج القائم
}

export const SCOPE_TIERS: ScopeTier[] = [
  { key: "self",       labelAr: "الخاص بي فقط", rank: 0, scope: "self" },
  { key: "department", labelAr: "قسمي",          rank: 1, scope: "department_tree" },
  { key: "branch",     labelAr: "فرعي",          rank: 2, scope: "branch" },
  { key: "company",    labelAr: "الشركة كاملة",  rank: 3, scope: "company" },
  { key: "all",        labelAr: "كل الشركات",    rank: 4, scope: "all" },
];

/** الكتالوج الكامل الذي تستهلكه الواجهة لعرض مُحدِّد بسيط بالعربية. */
export function getPermissionLevelCatalog() {
  return {
    levels: PERMISSION_LEVELS.map(({ key, labelAr, descriptionAr, rank }) => ({ key, labelAr, descriptionAr, rank })),
    scopeTiers: SCOPE_TIERS.map(({ key, labelAr, rank }) => ({ key, labelAr, rank })),
    actionLabels: ACTION_LABELS_AR,
    scopeLabels: SCOPE_LABELS_AR,
  };
}
