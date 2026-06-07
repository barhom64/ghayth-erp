// Single source of truth for the pilgrim status dropdown / filter chip
// labels. Three pages (`pilgrims.tsx` list, `pilgrim-detail.tsx` header
// strip, and the bulk-status modal) were each carrying their own copy
// of this dictionary — they drifted ("متأخر" vs "متجاوز" for the same
// `overstayed` value, "ملغي" vs "ملغى" for `cancelled`) and the same
// pilgrim's status rendered differently in different cells of the same
// session. One module, one canonical wording, identical for every
// consumer.
//
// The labels here mirror the `umrah` block of `STATUS_MAP` in
// `<PageStatusBadge>` — the badge is the visual canonical, this list is
// the textual canonical, and they agree by construction.

export interface UmrahPilgrimStatusOption {
  value: string;
  label: string;
}

export const UMRAH_PILGRIM_STATUS_OPTIONS: readonly UmrahPilgrimStatusOption[] = [
  { value: "pending",    label: "لم يصل" },
  { value: "arrived",    label: "وصل" },
  { value: "active",     label: "نشط" },
  { value: "overstayed", label: "متجاوز" },
  { value: "departed",   label: "غادر" },
  { value: "violated",   label: "مخالف" },
  { value: "cancelled",  label: "ملغى" },
];
