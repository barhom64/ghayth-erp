/**
 * Transport route-type catalog — TA-T18-UX-AUDIT-01 (UX-05).
 *
 * Single source of truth for the seven canonical transport route types
 * and their Arabic labels, previously duplicated verbatim across the
 * booking create form, the multi-leg editor, and the umrah context
 * questionnaire. Mirrors the backend route-type CHECK constraint
 * (migration 266).
 */
export const ROUTE_TYPES: { value: string; label: string }[] = [
  { value: "airport_to_makkah",  label: "المطار → مكة" },
  { value: "makkah_to_madinah",  label: "مكة → المدينة" },
  { value: "madinah_to_airport", label: "المدينة → المطار" },
  { value: "makkah_local",       label: "تنقل محلي بمكة" },
  { value: "madinah_local",      label: "تنقل محلي بالمدينة" },
  { value: "ziyarah",            label: "زيارة" },
  { value: "custom",             label: "مخصص" },
];
