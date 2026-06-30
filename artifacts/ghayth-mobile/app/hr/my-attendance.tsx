/**
 * سجل حضوري — سجل الحضور الشخصي بالشهر من /api/my-space/attendance
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AttendanceRow {
  id: number;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  lateMinutes?: number;
  status: string;
  overtimeMinutes?: number;
  workHours?: number | null;
  totalDeductions?: number;
  violationCount?: number;
}

interface MonthlyStats {
  presentDays?: number;
  lateDays?: number;
  totalLateMinutes?: number;
  totalDeduction?: number;
  overtimeMinutes?: number;
}

interface AttendanceResp {
  data?: AttendanceRow[];
  total?: number;
  monthly?: MonthlyStats | null;
}

const STATUS_LABELS: Record<string, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  on_leave: 'إجازة',
  excused: 'مستأذن',
  holiday: 'إجازة رسمية',
};

const STATUS_BADGE: Record<string, string> = {
  present: 'active',
  absent: 'rejected',
  late: 'pending',
  on_leave: 'approved',
  excused: 'approved',
  holiday: 'draft',
};

function formatTime(val?: string | null): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return val; }
}

function formatDateShort(val: string): string {
  try {
    return new Date(val).toLocaleDateString('ar-SA', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch { return val; }
}

function fmtMinutes(m?: number): string {
  if (!m) return '0 د';
  const h = Math.floor(m / 60);
  const min = m % 60;
  return h > 0 ? `${h} س ${min} د` : `${min} د`;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(ym: string): string {
  try {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('ar-SA', { year: 'numeric', month: 'long' });
  } catch { return ym; }
}

export default function MyAttendanceScreen() {
  const c = useColors();
  const [month, setMonth] = useState(currentMonth());
  const { data: resp, isLoading, isError, refetch } = useList<AttendanceResp>('/api/my-space/attendance', { month });

  const rows = resp?.data ?? [];
  const stats = resp?.monthly;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={styles.container}
      data={rows}
      keyExtractor={r => String(r.id)}
      onRefresh={refetch}
      refreshing={isLoading}
      ListHeaderComponent={
        <>
          <Stack.Screen options={{ title: 'سجل حضوري' }} />

          {/* تنقل الشهر */}
          <View style={[styles.monthNav, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Pressable onPress={() => setMonth(m => addMonths(m, 1))} style={styles.navBtn} disabled={month >= currentMonth()}>
              <Ionicons name="chevron-forward" size={22} color={month >= currentMonth() ? c.textFaint : c.brand} />
            </Pressable>
            <GText variant="subheading">{monthLabel(month)}</GText>
            <Pressable onPress={() => setMonth(m => addMonths(m, -1))} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={22} color={c.brand} />
            </Pressable>
          </View>

          {/* إحصاء شهري */}
          {stats && (
            <GCard style={styles.statsCard}>
              <View style={styles.statsRow}>
                <StatItem label="أيام الحضور" value={String(stats.presentDays ?? 0)} tone="success" c={c} />
                <StatItem label="التأخر" value={String(stats.lateDays ?? 0)} tone="warning" c={c} />
                <StatItem label="وقت إضافي" value={fmtMinutes(stats.overtimeMinutes)} tone="info" c={c} />
              </View>
              {(stats.totalLateMinutes ?? 0) > 0 && (
                <Text style={{ color: c.textMuted, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                  إجمالي وقت التأخر: {fmtMinutes(stats.totalLateMinutes)}
                </Text>
              )}
            </GCard>
          )}

          {isLoading && <GLoadingState text="جارٍ تحميل السجل…" />}
          {isError && (
            <GEmptyState icon="alert-circle-outline" title="تعذّر تحميل البيانات" description="تحقق من اتصالك وحاول مجدداً" actionLabel="إعادة المحاولة" onAction={refetch} />
          )}
        </>
      }
      ListEmptyComponent={
        !isLoading && !isError ? (
          <GEmptyState icon="time-outline" title="لا توجد سجلات" description="لا توجد بيانات حضور لهذا الشهر" />
        ) : null
      }
      renderItem={({ item }) => (
        <GCard style={styles.dayCard}>
          <View style={styles.dayHeader}>
            <GStatusBadge status={STATUS_BADGE[item.status] ?? 'pending'} size="sm" />
            <GText variant="label">{formatDateShort(item.date)}</GText>
          </View>
          <View style={styles.dayRow}>
            <View style={styles.timeCell}>
              <Text style={{ fontSize: 11, color: c.textFaint, marginBottom: 2 }}>خروج</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{formatTime(item.checkOut)}</Text>
            </View>
            {(item.workHours ?? 0) > 0 && (
              <View style={styles.timeCell}>
                <Text style={{ fontSize: 11, color: c.textFaint, marginBottom: 2 }}>ساعات العمل</Text>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#22C55E' }}>
                  {Number(item.workHours ?? 0).toFixed(1)} س
                </Text>
              </View>
            )}
            <View style={styles.timeCell}>
              <Text style={{ fontSize: 11, color: c.textFaint, marginBottom: 2 }}>دخول</Text>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{formatTime(item.checkIn)}</Text>
            </View>
          </View>
          {(item.lateMinutes ?? 0) > 0 && (
            <Text style={{ color: '#F59E0B', fontSize: 12, textAlign: 'center', marginTop: 4 }}>
              تأخر {fmtMinutes(item.lateMinutes)}
            </Text>
          )}
        </GCard>
      )}
    />
  );
}

function StatItem({ label, value, tone, c }: { label: string; value: string; tone: 'success' | 'warning' | 'info'; c: ReturnType<typeof useColors> }) {
  const colors = { success: '#22C55E', warning: '#F59E0B', info: '#3B82F6' };
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors[tone] }}>{value}</Text>
      <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, gap: 10, paddingBottom: 40 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 4 },
  navBtn: { padding: 6 },
  statsCard: { gap: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around' },
  dayCard: { gap: 6 },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 6 },
  timeCell: { alignItems: 'center' },
});
