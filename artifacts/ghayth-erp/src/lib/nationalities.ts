/**
 * Centralized nationality list (Arabic). ISO 3166-based — the list is
 * intentionally static because nationalities are a fixed real-world
 * lookup, not company-configurable data. Import this from anywhere the
 * UI needs a nationality picker so we don't repeat short hardcoded
 * lists (which historically defaulted to ~9 GCC/SA countries and
 * forced everyone else to pick "أخرى").
 *
 * Sort order: GCC + الدول العربية الشائعة → آسيا → بقية القارات أبجدياً.
 * This matches the demographic mix of employees / pilgrims in the
 * Saudi market the ERP targets.
 */
export const NATIONALITIES: ReadonlyArray<{ value: string; label: string }> = [
  // GCC
  { value: "سعودي",      label: "سعودي" },
  { value: "إماراتي",    label: "إماراتي" },
  { value: "كويتي",      label: "كويتي" },
  { value: "بحريني",     label: "بحريني" },
  { value: "قطري",       label: "قطري" },
  { value: "عماني",      label: "عماني" },
  // Arab world
  { value: "يمني",       label: "يمني" },
  { value: "مصري",       label: "مصري" },
  { value: "سوداني",     label: "سوداني" },
  { value: "أردني",      label: "أردني" },
  { value: "لبناني",     label: "لبناني" },
  { value: "سوري",       label: "سوري" },
  { value: "فلسطيني",    label: "فلسطيني" },
  { value: "عراقي",      label: "عراقي" },
  { value: "ليبي",       label: "ليبي" },
  { value: "تونسي",      label: "تونسي" },
  { value: "جزائري",     label: "جزائري" },
  { value: "مغربي",      label: "مغربي" },
  { value: "موريتاني",   label: "موريتاني" },
  { value: "صومالي",     label: "صومالي" },
  { value: "جيبوتي",     label: "جيبوتي" },
  { value: "إثيوبي",     label: "إثيوبي" },
  { value: "إريتري",     label: "إريتري" },
  { value: "جزر القمر",  label: "جزر القمر" },
  // South Asia
  { value: "هندي",          label: "هندي" },
  { value: "باكستاني",      label: "باكستاني" },
  { value: "بنغلاديشي",     label: "بنغلاديشي" },
  { value: "سريلانكي",      label: "سريلانكي" },
  { value: "نيبالي",        label: "نيبالي" },
  { value: "أفغاني",        label: "أفغاني" },
  // East / Southeast Asia
  { value: "فلبيني",        label: "فلبيني" },
  { value: "إندونيسي",      label: "إندونيسي" },
  { value: "ماليزي",        label: "ماليزي" },
  { value: "تايلندي",       label: "تايلندي" },
  { value: "فيتنامي",       label: "فيتنامي" },
  { value: "بورمي",         label: "بورمي" },
  { value: "صيني",          label: "صيني" },
  { value: "ياباني",        label: "ياباني" },
  { value: "كوري جنوبي",    label: "كوري جنوبي" },
  // West / Central Asia
  { value: "تركي",          label: "تركي" },
  { value: "إيراني",        label: "إيراني" },
  { value: "أذربيجاني",     label: "أذربيجاني" },
  { value: "كازاخستاني",    label: "كازاخستاني" },
  { value: "أوزبكي",        label: "أوزبكي" },
  { value: "طاجيكي",        label: "طاجيكي" },
  { value: "قرغيزي",        label: "قرغيزي" },
  { value: "تركمانستاني",   label: "تركمانستاني" },
  // Sub-Saharan Africa (top sources)
  { value: "نيجيري",        label: "نيجيري" },
  { value: "كيني",          label: "كيني" },
  { value: "أوغندي",        label: "أوغندي" },
  { value: "تنزاني",        label: "تنزاني" },
  { value: "غاني",          label: "غاني" },
  { value: "سنغالي",        label: "سنغالي" },
  { value: "تشادي",         label: "تشادي" },
  { value: "نيجري",         label: "نيجري" },
  { value: "مالي",          label: "مالي" },
  { value: "كاميروني",      label: "كاميروني" },
  { value: "زيمبابوي",      label: "زيمبابوي" },
  { value: "جنوب أفريقي",   label: "جنوب أفريقي" },
  // Europe
  { value: "بريطاني",       label: "بريطاني" },
  { value: "أيرلندي",       label: "أيرلندي" },
  { value: "فرنسي",         label: "فرنسي" },
  { value: "ألماني",        label: "ألماني" },
  { value: "إيطالي",        label: "إيطالي" },
  { value: "إسباني",        label: "إسباني" },
  { value: "هولندي",        label: "هولندي" },
  { value: "بلجيكي",        label: "بلجيكي" },
  { value: "سويسري",        label: "سويسري" },
  { value: "نمساوي",        label: "نمساوي" },
  { value: "بولندي",        label: "بولندي" },
  { value: "روماني",        label: "روماني" },
  { value: "روسي",          label: "روسي" },
  { value: "أوكراني",       label: "أوكراني" },
  { value: "بلغاري",        label: "بلغاري" },
  { value: "صربي",          label: "صربي" },
  { value: "بوسني",         label: "بوسني" },
  { value: "ألباني",        label: "ألباني" },
  { value: "يوناني",        label: "يوناني" },
  // Americas
  { value: "أمريكي",        label: "أمريكي" },
  { value: "كندي",          label: "كندي" },
  { value: "مكسيكي",        label: "مكسيكي" },
  { value: "برازيلي",       label: "برازيلي" },
  { value: "أرجنتيني",      label: "أرجنتيني" },
  { value: "كولومبي",       label: "كولومبي" },
  { value: "فنزويلي",       label: "فنزويلي" },
  { value: "بيروفي",        label: "بيروفي" },
  // Oceania
  { value: "أسترالي",       label: "أسترالي" },
  { value: "نيوزيلندي",     label: "نيوزيلندي" },
  // Fallback
  { value: "أخرى",          label: "أخرى" },
];

/**
 * Set form lookup. Returns whether a given nationality string is a known
 * value (case-sensitive). Used to detect legacy/imported data with
 * arbitrary nationality text that should be normalized.
 */
export const isKnownNationality = (value: string): boolean =>
  NATIONALITIES.some((n) => n.value === value);
