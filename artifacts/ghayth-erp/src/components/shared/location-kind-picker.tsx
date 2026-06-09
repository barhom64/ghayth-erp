import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// #1812 operational review — the user explicitly called out
// "from/to without location type" as a downstream blocker. Booking
// rules depend on the kind (airport pickups need an extra buffer,
// hotel dropoffs need a hotel name, warehouse pickups need a forklift
// flag, etc.). This picker is the single Arabic-first surface across
// every place the operator needs to classify a transport endpoint.
//
// IMPORTANT: the value vocabulary mirrors LOCATION_KINDS in the
// transport-bookings router. Adding a new kind requires:
//   1. Update LOCATION_KINDS in transport-bookings.ts
//   2. Update LOCATION_KIND_LABELS below
//   3. Refresh the matching test (transportBookingGeoAndLocationKind.test.ts)

export const LOCATION_KIND_LABELS: Record<string, string> = {
  airport:        "مطار",
  gate:           "بوابة / منفذ",
  hotel:          "فندق",
  mazar:          "مزار / موقع زيارة",
  warehouse:      "مستودع",
  project:        "مشروع",
  customer_site:  "موقع عميل",
  depot:          "مستودع تشغيلي",
  mosque:         "مسجد",
  other:          "أخرى",
};

interface Props {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}

export function LocationKindPicker({
  value, onChange, placeholder = "نوع الموقع",
  id, disabled,
}: Props) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => onChange(v || undefined)}
      disabled={disabled}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(LOCATION_KIND_LABELS).map(([k, label]) => (
          <SelectItem key={k} value={k}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
