/**
 * حقل تاريخ بنظام modal — بدون حزمة native خارجية
 * يقبل / يعيد قيمة بتنسيق YYYY-MM-DD
 */
import React, { useState, useMemo } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseDate(val: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(val);
  if (!m) return null;
  return { y: parseInt(m[1]), m: parseInt(m[2]), d: parseInt(m[3]) };
}

interface Props {
  label?: string;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  minDate?: string;
  maxDate?: string;
  placeholder?: string;
}

export function DateInput({ label, value, onChange, error, minDate, maxDate, placeholder = 'اختر تاريخًا' }: Props) {
  const c = useColors();
  const [open, setOpen] = useState(false);

  const now = new Date();
  const parsed = parseDate(value);
  const [selYear, setSelYear]   = useState(parsed?.y ?? now.getFullYear());
  const [selMonth, setSelMonth] = useState(parsed?.m ?? now.getMonth() + 1);
  const [selDay, setSelDay]     = useState(parsed?.d ?? now.getDate());

  const minP = parseDate(minDate ?? '');
  const maxP = parseDate(maxDate ?? '');

  // سنوات: من 3 سنوات مضت إلى سنة قادمة
  const years = useMemo(() => {
    const base = now.getFullYear();
    return Array.from({ length: 5 }, (_, i) => base - 2 + i);
  }, []);

  const days = useMemo(() => {
    const count = daysInMonth(selYear, selMonth);
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [selYear, selMonth]);

  const displayValue = parsed
    ? `${parsed.d} ${MONTHS_AR[parsed.m - 1]} ${parsed.y}`
    : '';

  const onConfirm = () => {
    const mm = String(selMonth).padStart(2, '0');
    const dd = String(selDay).padStart(2, '0');
    const maxDay = daysInMonth(selYear, selMonth);
    const safeDay = Math.min(selDay, maxDay);
    const dds = String(safeDay).padStart(2, '0');
    onChange(`${selYear}-${mm}-${dds}`);
    setOpen(false);
  };

  const onOpen = () => {
    const p = parseDate(value);
    if (p) { setSelYear(p.y); setSelMonth(p.m); setSelDay(p.d); }
    else { setSelYear(now.getFullYear()); setSelMonth(now.getMonth() + 1); setSelDay(now.getDate()); }
    setOpen(true);
  };

  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={[styles.label, { color: c.textMuted }]}>{label}</Text> : null}
      <Pressable
        onPress={onOpen}
        style={[
          styles.field,
          { borderColor: error ? c.danger : c.inputBorder, backgroundColor: c.inputBg },
        ]}
      >
        <Ionicons name="calendar-outline" size={17} color={c.brand} style={{ marginLeft: 8 }} />
        <Text style={{ flex: 1, color: displayValue ? c.text : c.textFaint, fontSize: 15, textAlign: 'right' }}>
          {displayValue || placeholder}
        </Text>
      </Pressable>
      {error ? <Text style={[styles.errorText, { color: c.danger }]}>{error}</Text> : null}

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: c.surface }]}>
          <View style={[styles.handle, { backgroundColor: c.border }]} />

          {/* السنة */}
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>السنة</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
            {years.map(y => (
              <TouchableOpacity
                key={y}
                onPress={() => setSelYear(y)}
                style={[styles.chip, { backgroundColor: selYear === y ? c.brand : c.surfaceAlt, borderColor: selYear === y ? c.brand : c.border }]}
              >
                <Text style={{ color: selYear === y ? '#FFF' : c.text, fontWeight: '600', fontSize: 14 }}>{y}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* الشهر */}
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>الشهر</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
            {MONTHS_AR.map((name, i) => {
              const m = i + 1;
              return (
                <TouchableOpacity
                  key={m}
                  onPress={() => setSelMonth(m)}
                  style={[styles.chip, { backgroundColor: selMonth === m ? c.brand : c.surfaceAlt, borderColor: selMonth === m ? c.brand : c.border }]}
                >
                  <Text style={{ color: selMonth === m ? '#FFF' : c.text, fontWeight: '600', fontSize: 13 }}>{name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* اليوم */}
          <Text style={[styles.sectionLabel, { color: c.textMuted }]}>اليوم</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scroll}>
            {days.map(d => (
              <TouchableOpacity
                key={d}
                onPress={() => setSelDay(d)}
                style={[styles.chip, styles.dayChip, { backgroundColor: selDay === d ? c.brand : c.surfaceAlt, borderColor: selDay === d ? c.brand : c.border }]}
              >
                <Text style={{ color: selDay === d ? '#FFF' : c.text, fontWeight: '600', fontSize: 14 }}>{d}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* معاينة + تأكيد */}
          <View style={styles.footer}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>
              {`${selDay} ${MONTHS_AR[selMonth - 1]} ${selYear}`}
            </Text>
            <TouchableOpacity
              onPress={onConfirm}
              style={[styles.confirmBtn, { backgroundColor: c.brand }]}
            >
              <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 15 }}>تأكيد</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '500', textAlign: 'right', marginBottom: 6 },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 13, minHeight: 48 },
  errorText: { fontSize: 12, textAlign: 'right', marginTop: 4 },
  overlay: { flex: 1, backgroundColor: '#00000050' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 36, paddingTop: 12 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '600', paddingHorizontal: 16, marginBottom: 8, textAlign: 'right' },
  scroll: { paddingHorizontal: 12, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
  dayChip: { minWidth: 40 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 8 },
  confirmBtn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10 },
});
