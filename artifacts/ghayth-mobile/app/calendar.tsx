/**
 * التقويم الموحّد — يعرض الأحداث من كل الوحدات (مهام، إجازات، جلسات، رحلات...)
 * GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GScreen, GText, GCard, GEmptyState, GLoadingState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface CalendarEvent {
  id: number | string;
  title: string;
  date: string;
  time?: string;
  type: string;
  entityType?: string;
  module?: string;
  status?: string;
  assigneeName?: string;
}

interface CalendarResp {
  events?: CalendarEvent[];
  data?: CalendarEvent[];
}

const TYPE_META: Record<string, { icon: IoniconName; color: string; label: string }> = {
  leave: { icon: 'calendar-outline', color: '#3B82F6', label: 'إجازة' },
  task: { icon: 'checkbox-outline', color: '#8B5CF6', label: 'مهمة' },
  trip: { icon: 'navigate-outline', color: '#F59E0B', label: 'رحلة' },
  maintenance: { icon: 'build-outline', color: '#EF4444', label: 'صيانة' },
  legal_session: { icon: 'hammer-outline', color: '#6366F1', label: 'جلسة قضائية' },
  payment: { icon: 'cash-outline', color: '#10B981', label: 'دفعة' },
  insurance: { icon: 'shield-outline', color: '#EC4899', label: 'تأمين' },
  obligation: { icon: 'alert-circle-outline', color: '#EF4444', label: 'التزام' },
  meeting: { icon: 'people-outline', color: '#F59E0B', label: 'اجتماع' },
  training: { icon: 'school-outline', color: '#10B981', label: 'تدريب' },
  recruitment: { icon: 'person-add-outline', color: '#3B82F6', label: 'توظيف' },
};

function toArabicDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('ar-SA', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function endOfMonth(d: Date): string {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

export default function CalendarScreen() {
  const c = useColors();
  const [month, setMonth] = useState(() => new Date());

  const from = startOfMonth(month);
  const to = endOfMonth(month);

  const { data, isLoading } = useList<CalendarResp>('/api/calendar', { from, to });
  const events = data?.events ?? data?.data ?? [];

  const monthLabel = month.toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' });

  const prevMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const nextMonth = () => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const sorted = [...events].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  // Group by date
  const grouped: Record<string, CalendarEvent[]> = {};
  for (const ev of sorted) {
    const d = (ev.date ?? '').slice(0, 10);
    if (!grouped[d]) grouped[d] = [];
    grouped[d].push(ev);
  }
  const dates = Object.keys(grouped).sort();

  return (
    <GScreen>
      <Stack.Screen options={{ title: 'التقويم الموحّد' }} />
      {/* Month navigator */}
      <View style={[styles.monthNav, { borderBottomColor: c.border }]}>
        <Pressable onPress={nextMonth} hitSlop={8}>
          <Ionicons name="chevron-forward-outline" size={20} color={c.brand} />
        </Pressable>
        <GText variant="subheading" style={{ fontWeight: '700' }}>{monthLabel}</GText>
        <Pressable onPress={prevMonth} hitSlop={8}>
          <Ionicons name="chevron-back-outline" size={20} color={c.brand} />
        </Pressable>
      </View>

      {isLoading && <GLoadingState text="جاري تحميل الأحداث…" />}

      {!isLoading && dates.length === 0 && (
        <GEmptyState icon="calendar-outline" title="لا توجد أحداث" description="لم يُعثر على أحداث لهذا الشهر" />
      )}

      <FlatList
        data={dates}
        keyExtractor={(d) => d}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        renderItem={({ item: dateKey }) => {
          const dayEvents = grouped[dateKey];
          return (
            <View style={{ marginBottom: 16 }}>
              <GText variant="caption" color="muted" style={{ marginBottom: 6, fontWeight: '700' }}>
                {toArabicDate(dateKey)}
              </GText>
              <GCard style={{ gap: 0, padding: 0 }}>
                {dayEvents.map((ev, idx) => {
                  const meta = TYPE_META[ev.type] ?? TYPE_META[ev.entityType ?? ''] ?? { icon: 'ellipse-outline' as IoniconName, color: c.brand, label: ev.type };
                  return (
                    <View
                      key={`${ev.id}-${idx}`}
                      style={[
                        styles.eventRow,
                        { borderBottomColor: c.border },
                        idx === dayEvents.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <View style={[styles.dot, { backgroundColor: meta.color }]} />
                      <View style={{ flex: 1 }}>
                        <GText variant="body" style={{ fontWeight: '600' }}>{ev.title}</GText>
                        {ev.assigneeName && <GText variant="caption" color="muted">{ev.assigneeName}</GText>}
                      </View>
                      <View style={[styles.pill, { backgroundColor: meta.color + '20' }]}>
                        <GText variant="caption" style={{ color: meta.color }}>{meta.label}</GText>
                      </View>
                      {ev.time && <GText variant="caption" color="muted" style={{ minWidth: 42 }}>{ev.time}</GText>}
                    </View>
                  );
                })}
              </GCard>
            </View>
          );
        }}
      />
    </GScreen>
  );
}

const styles = StyleSheet.create({
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
});
