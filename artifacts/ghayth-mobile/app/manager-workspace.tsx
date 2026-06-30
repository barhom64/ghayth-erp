/**
 * مساحة عمل المدير — نظرة شاملة على فريق العمل والمهام المعلقة
 * GET /api/manager/workspace  (أو /api/my-space fallback)
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GScreen, GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface WorkspaceData {
  teamSize?: number;
  presentToday?: number;
  pendingApprovals?: number;
  pendingLeaves?: number;
  openTasks?: number;
  overdueTasksCount?: number;
  teamAttendanceRate?: number;
  recentActivity?: ActivityItem[];
  teamMembers?: TeamMember[];
}

interface ActivityItem {
  id: number | string;
  label: string;
  type?: string;
  status?: string;
  time?: string;
}

interface TeamMember {
  id: number | string;
  name: string;
  jobTitle?: string;
  attendanceStatus?: string;
}

function fmtPct(n?: number): string {
  if (n === undefined || n === null) return '—';
  return `${n.toFixed(0)}%`;
}

export default function ManagerWorkspaceScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading } = useList<WorkspaceData>('/api/manager/workspace');
  const fallback = useList<WorkspaceData>('/api/my-space', undefined, { enabled: !data && !isLoading });
  const d = data ?? fallback.data ?? {};

  if (isLoading || fallback.isLoading) return <GLoadingState text="جارٍ تحميل مساحة العمل…" />;

  const ACTIONS: Array<{ label: string; icon: IoniconName; route: string }> = [
    { label: 'مركز الاعتماد', icon: 'checkmark-done-circle-outline', route: '/(tabs)/approvals' },
    { label: 'التقويم', icon: 'calendar-number-outline', route: '/calendar' },
    { label: 'البحث', icon: 'search-outline', route: '/search' },
    { label: 'لوحة المدير', icon: 'stats-chart-outline', route: '/exec-dashboard' },
    { label: 'تقارير الحضور', icon: 'finger-print-outline', route: '/m/hr/attendance' },
    { label: 'المهام', icon: 'checkbox-outline', route: '/m/operations/tasks' },
  ];

  return (
    <GScreen scrollable>
      <Stack.Screen options={{ title: 'مساحة عمل المدير' }} />
      <View style={{ padding: 16, gap: 16 }}>

        {/* KPI Strip */}
        <View style={styles.kpiRow}>
          <KPIBox label="حاضر اليوم" value={String(d.presentToday ?? 0)} sub={`من ${d.teamSize ?? 0}`} icon="people-outline" color="#22C55E" c={c} />
          <KPIBox label="نسبة الحضور" value={fmtPct(d.teamAttendanceRate)} icon="trending-up-outline" color="#3B82F6" c={c} />
          <KPIBox label="طلبات معلقة" value={String(d.pendingApprovals ?? 0)} icon="time-outline" color="#F59E0B" c={c} onPress={() => router.push('/(tabs)/approvals' as never)} />
          <KPIBox label="مهام مفتوحة" value={String(d.openTasks ?? 0)} sub={d.overdueTasksCount ? `${d.overdueTasksCount} متأخرة` : undefined} icon="checkbox-outline" color="#8B5CF6" c={c} onPress={() => router.push('/m/operations/tasks' as never)} />
        </View>

        {/* Quick Actions */}
        <GText variant="subheading" style={{ fontWeight: '700' }}>الإجراءات السريعة</GText>
        <View style={styles.actionsGrid}>
          {ACTIONS.map(a => (
            <Pressable
              key={a.label}
              onPress={() => router.push(a.route as never)}
              style={({ pressed }) => [styles.actionCard, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
            >
              <Ionicons name={a.icon} size={22} color={c.brand} />
              <GText variant="caption" style={{ textAlign: 'center', marginTop: 6 }}>{a.label}</GText>
            </Pressable>
          ))}
        </View>

        {/* Team Members */}
        {(d.teamMembers?.length ?? 0) > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>الفريق</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              {d.teamMembers!.map((m, i) => {
                const st = statusBadge(m.attendanceStatus ?? '');
                return (
                  <View
                    key={m.id}
                    style={[styles.memberRow, { borderBottomColor: c.border }, i === d.teamMembers!.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <GText variant="body" style={{ fontWeight: '600' }}>{m.name}</GText>
                      {m.jobTitle ? <GText variant="caption" color="muted">{m.jobTitle}</GText> : null}
                    </View>
                    {st && <GStatusBadge status={st.label} size="sm" />}
                  </View>
                );
              })}
            </GCard>
          </>
        )}

        {/* Recent Activity */}
        {(d.recentActivity?.length ?? 0) > 0 && (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>آخر الأنشطة</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              {d.recentActivity!.map((a, i) => {
                const st = statusBadge(a.status ?? '');
                return (
                  <View
                    key={a.id}
                    style={[styles.actRow, { borderBottomColor: c.border }, i === d.recentActivity!.length - 1 && { borderBottomWidth: 0 }]}
                  >
                    <View style={{ flex: 1 }}>
                      <GText variant="body">{a.label}</GText>
                      {a.time ? <GText variant="caption" color="muted">{a.time}</GText> : null}
                    </View>
                    {st && <GStatusBadge status={st.label} size="sm" />}
                  </View>
                );
              })}
            </GCard>
          </>
        )}

        {!d.teamSize && !d.pendingApprovals && !isLoading && (
          <GEmptyState icon="person-circle-outline" title="لا توجد بيانات" description="تحقق من صلاحياتك أو اتصل بمسؤول النظام" />
        )}
      </View>
    </GScreen>
  );
}

function KPIBox({ label, value, sub, icon, color, c, onPress }: {
  label: string; value: string; sub?: string; icon: IoniconName; color: string;
  c: ReturnType<typeof useColors>; onPress?: () => void;
}) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper onPress={onPress} style={[styles.kpiCard, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Ionicons name={icon} size={18} color={color} />
      <GText variant="heading" style={{ color, fontSize: 20, fontWeight: '800', marginTop: 4 }}>{value}</GText>
      {sub ? <GText variant="caption" color="muted" style={{ fontSize: 10 }}>{sub}</GText> : null}
      <GText variant="caption" color="muted">{label}</GText>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  kpiRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  kpiCard: { flex: 1, minWidth: '45%', borderWidth: 1, borderRadius: 12, padding: 12, gap: 2, alignItems: 'center' },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionCard: { width: '30%', borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'center', minHeight: 70 },
  memberRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
  actRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10, borderBottomWidth: 1 },
});
