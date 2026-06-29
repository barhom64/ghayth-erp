/**
 * لوحة القيادة — الصفحة الرئيسية للتطبيق
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GScreen, GCard, GText, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { canApprove } from '@/lib/modules';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface DashboardData {
  totalEmployees?: number;
  totalClients?: number;
  totalRevenue?: number;
  pendingInvoices?: number;
  activeTasksToday?: number;
  presentToday?: number;
  pendingLeaveRequests?: number;
  warehouseAlerts?: number;
  projects?: { total: number; active: number };
  tickets?: { open: number; breached: number };
  vehicles?: { total: number; active: number };
}

interface QuickLink { label: string; icon: IoniconName; route: string; managerOnly?: boolean }

const QUICK_LINKS: QuickLink[] = [
  { label: 'تسجيل الحضور', icon: 'finger-print-outline',           route: '/hr/attendance' },
  { label: 'طلب إجازة',     icon: 'calendar-outline',              route: '/hr/leave-new' },
  { label: 'طلباتي',         icon: 'list-outline',                  route: '/hr/my-requests' },
  { label: 'مركز الاعتماد', icon: 'checkmark-done-circle-outline', route: '/(tabs)/approvals', managerOnly: true },
  { label: 'الإشعارات',     icon: 'notifications-outline',         route: '/(tabs)/notifications' },
];

export default function DashboardScreen() {
  const c = useColors();
  const { user } = useAuth();
  const router = useRouter();
  const { data, isLoading } = useList<DashboardData>('/api/dashboard/summary');
  const isManager = canApprove(user?.userRoles);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'مساء النور';

  if (isLoading) return <GLoadingState text="جارٍ التحميل…" />;

  return (
    <GScreen scrollable>
      {/* تحية المستخدم */}
      <View style={[styles.greetingBox, { backgroundColor: c.primary }]}>
        <Text style={[styles.greeting, { color: c.onPrimary }]}>{greeting} {user?.name ?? ''}</Text>
        <Text style={[styles.greetingSub, { color: c.onPrimary + 'CC' }]}>مرحباً بك في غيث ERP</Text>
      </View>

      {/* البطاقات الإحصائية */}
      <View style={styles.statsRow}>
        <StatCard
          label="حضور اليوم"
          value={String(data?.presentToday ?? 0)}
          icon="finger-print-outline"
          tone="success"
          c={c}
        />
        <StatCard
          label="إجازات معلقة"
          value={String(data?.pendingLeaveRequests ?? 0)}
          icon="time-outline"
          tone="warning"
          c={c}
        />
        <StatCard
          label="مهام اليوم"
          value={String(data?.activeTasksToday ?? 0)}
          icon="checkbox-outline"
          tone="info"
          c={c}
        />
      </View>

      {/* الوصول السريع */}
      <GText variant="subheading" style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 8 }}>
        الوصول السريع
      </GText>
      <View style={styles.quickGrid}>
        {QUICK_LINKS.filter(ql => !ql.managerOnly || isManager).map(ql => (
          <Pressable
            key={ql.label}
            onPress={() => router.push(ql.route as never)}
            style={({ pressed }) => [styles.quickItem, { backgroundColor: pressed ? c.surfaceAlt : c.surface, borderColor: c.border }]}
          >
            <Ionicons name={ql.icon} size={24} color={c.brand} />
            <Text style={{ fontSize: 12, color: c.text, textAlign: 'center', marginTop: 6, fontWeight: '500' }}>{ql.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* مؤشرات إضافية */}
      <GText variant="subheading" style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 8 }}>
        لمحة عامة
      </GText>
      <View style={styles.statsRow}>
        <StatCard label="الموظفون" value={String(data?.totalEmployees ?? 0)} icon="people-outline" tone="default" c={c} />
        <StatCard label="فواتير معلقة" value={String(data?.pendingInvoices ?? 0)} icon="receipt-outline" tone="warning" c={c} />
        <StatCard label="تنبيهات مخزن" value={String(data?.warehouseAlerts ?? 0)} icon="warning-outline" tone="danger" c={c} />
      </View>
    </GScreen>
  );
}

function StatCard({ label, value, icon, tone, c }: {
  label: string; value: string; icon: IoniconName;
  tone: 'success' | 'warning' | 'info' | 'danger' | 'default'; c: ReturnType<typeof useColors>;
}) {
  const toneColor = { success: '#22C55E', warning: '#F59E0B', info: '#3B82F6', danger: '#EF4444', default: c.textMuted }[tone];
  const toneBg = { success: '#F0FDF4', warning: '#FFFBEB', info: '#EFF6FF', danger: '#FEF2F2', default: c.surfaceAlt }[tone];
  return (
    <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: toneBg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={toneColor} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: '700', color: c.text, marginTop: 6 }}>{value}</Text>
      <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center', marginTop: 2 }}>{label}</Text>
    </GCard>
  );
}

const styles = StyleSheet.create({
  greetingBox: { padding: 24, paddingTop: 20 },
  greeting: { fontSize: 20, fontWeight: '700', textAlign: 'right' },
  greetingSub: { fontSize: 14, textAlign: 'right', marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 8, padding: 16 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  quickItem: { width: '22%', borderRadius: 10, borderWidth: 1, paddingVertical: 14, alignItems: 'center', marginBottom: 4 },
  actRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, justifyContent: 'flex-end' },
});
