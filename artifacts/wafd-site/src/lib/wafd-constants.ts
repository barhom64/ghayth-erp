/**
 * WAFD — ثوابت الشركة المركزية (الواجهة الأمامية)
 * وفد: كيان مؤنث — "هي ترافقك، هي تخطط، هي تستقبلك"
 *
 * ===== الفصل الكامل للأرقام =====
 * WAFD_PHONE      → رقم الشركة الرسمي (واتساب الأعمال) — للواجهة العامة والتواصل الرسمي
 * OWNER_PHONE     → رقم المدير التنفيذي — للإشعارات الداخلية فقط (لا يظهر في الواجهة)
 */

// ===== رقم الشركة الرسمي (واتساب الأعمال — للواجهة العامة) =====
export const WAFD_PHONE = "966125369972"; // 012 536 9972 بصيغة دولية
export const WAFD_PHONE_DISPLAY = "+966 12 536 9972";
export const WAFD_PHONE_LOCAL = "012 536 9972";
export const WAFD_EMAIL = "umrah@wafd.life";
export const WAFD_WEBSITE = "wafd.life";

// ===== رقم المدير التنفيذي (للإشعارات الداخلية فقط — لا يظهر في الواجهة) =====
export const OWNER_PHONE = "966559758585";
export const OWNER_PHONE_DISPLAY = "+966 55 975 8585";

// رسائل واتساب مخصصة حسب السياق
export const WAFD_WA_MESSAGES = {
  general: "السلام عليكم، أود الاستفسار عن خدمات وفد للعمرة",
  visa: "السلام عليكم، أود الاستفسار عن خدمة تأشيرة العمرة",
  hotel_makkah: "السلام عليكم، أود الاستفسار عن حجز فندق في مكة المكرمة",
  hotel_madinah: "السلام عليكم، أود الاستفسار عن حجز فندق في المدينة المنورة",
  transport: "السلام عليكم، أود الاستفسار عن خدمة النقل والتنقلات",
  program_economy: "السلام عليكم، أود الاستفسار عن برنامج وفد الاقتصادي للعمرة",
  program_premium: "السلام عليكم، أود الاستفسار عن برنامج وفد المميز للعمرة",
  program_last_ten: "السلام عليكم، أود الاستفسار عن برنامج وفد للعشر الأواخر",
  program_family: "السلام عليكم، أود الاستفسار عن برنامج وفد للعائلة",
  contact: "السلام عليكم، وصلت إلى صفحة التواصل وأريد الاستفسار",
  blog: "السلام عليكم، قرأت مقالاً في موقع وفد وأريد الاستفسار عن الخدمات",
  landing: "السلام عليكم، رأيت عرض وفد الخاص وأريد الاستفسار",
  partnership: "السلام عليكم، أود الاستفسار عن الشراكة مع وفد لخدمة ضيوف الرحمن",
  forum: "السلام عليكم، أود حجز مقعد في منتدى العمرة والزيارة 2026 بالمدينة المنورة",
};

export function wafdWhatsAppLink(msgKey: keyof typeof WAFD_WA_MESSAGES = "general") {
  return `https://wa.me/${WAFD_PHONE}?text=${encodeURIComponent(WAFD_WA_MESSAGES[msgKey])}`;
}

/**
 * دفاع أمامي: الروابط القادمة من لوحة تحكم المحتوى تُعرض في <a href>. نمنع مخططات
 * التنفيذ (javascript:/data:/vbscript:) لتفادي XSS المخزَّن حتى لو تجاوز أحدهم تحقّق
 * الخادم. مسموح فقط: http(s)://… أو مسار جذري نسبي (/…) أو مرساة (#…) أو mailto:/tel:.
 */
const SAFE_HREF_RE = /^(https?:\/\/|\/(?!\/)|#|mailto:|tel:)/i;
export function toSafeHref(url: string | null | undefined): string {
  const v = (url ?? "").trim();
  return SAFE_HREF_RE.test(v) ? v : "#";
}
