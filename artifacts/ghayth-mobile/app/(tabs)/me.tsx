/**
 * مساحتي — بطاقة الموظف والاختصارات الشخصية
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GScreen, GCard, GAvatar, GText, GLoadingState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { statusBadge } from '@/lib/moduleSections';
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface LeaveBalance { name: string; entitled: number; used: number; remaining: number }
interface MySpaceData {
  attendance?: { status: string; checkIn?: string; checkOut?: string } | null;
  leaveBalances?: LeaveBalance[];
  lastPayslip?: { netSalary?: number; period?: string; currency?: string } | null;
  todayTasks?: Array<{ id: number; title: string; status: string }>;
  openRequests?: Array<{ id: number; type: string; title: string; status: string }>;
}

interface QuickAction { label: string; icon: IoniconName; route: string }

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'تسجيل الحضور', icon: 'finger-print-outline',      route: '/hr/attendance' },
  { label: 'طلب إجازة',     icon: 'calendar-outline',          route: '/hr/leave-new' },
  { label: 'طلبات الإجازة', icon: 'list-outline',              route: '/m/hr/leave-requests' },
  { label: 'كشف الراتب',    icon: 'document-text-outline',     route: '/m/hr/payroll' },
];

export default function MeScreen() {
  const c = useColors();
  const { user, logout } = useAuth();
  const router = useRouter();
  const { data, isLoading } = useList<MySpaceData>('/api/my-space');

  if (isLoading) return <GLoadingState text="جارٍ التحميل…" />;

  const att = data?.attendance;
  const annualLeave = data?.leaveBalances?.find(b => b.entitled >= 15) ?? data?.leaveBalances?.[0];
  const salary = data?.lastPayslip;

  return (
    <GScreen scrollable>
      {/* بطاقة الموظف */}
      <GCard style={[styles.empCard, { backgroundColor: c.primary }]}>
        <View style={styles.empRow}>
          <GAvatar name={user?.name} size="lg" />
          <View style={styles.empInfo}>
            <GText variant="heading" color={c.onPrimary}>{user?.name ?? '—'}</GText>
            {user?.jobTitle ? <GText variant="label" color={c.onPrimary + 'CC'}>{user.jobTitle}</GText> : null}
            {user?.companyName ? <GText variant="caption" color={c.onPrimary + '99'} style={{ marginTop: 2 }}>{user.companyName}</GText> : null}
          </View>
        </View>
      </GCard>

      {/* بطاقات سريعة */}
      <View style={styles.cardsRow}>
        {/* حضور اليوم */}
        <GCard style={{ flex: 1 }}>
          <GText variant="caption" color={c.textMuted}>حضور اليوم</GText>
          {att ? <GStatusBadge status={statusBadge(att.status)?.label ?? att.status} size="sm" /> : <GText variant="caption" color={c.textFaint}>—</GText>}
          {att?.checkIn ? <GText variant="caption" color={c.textMuted} style={{ marginTop: 4 }}>دخول: {att.checkIn}</GText> : null}
        </GCard>
        {/* رصيد الإجازات */}
        <GCard style={{ flex: 1 }}>
          <GText variant="caption" color={c.textMuted}>رصيد الإجازة</GText>
          <GText variant="subheading" style={{ marginTop: 4 }}>{annualLeave?.remaining ?? '—'}</GText>
          <GText variant="caption" color={c.textFaint}>يوم متبقٍ</GText>
        </GCard>
        {/* آخر راتب */}
        <GCard style={{ flex: 1 }}>
          <GText variant="caption" color={c.textMuted}>آخر راتب</GText>
          {salary ? (
            <>
              <GText variant="subheading" style={{ marginTop: 4 }}>{Number(salary.netSalary ?? 0).toLocaleString('ar-SA')}</GText>
              <GText variant="caption" color={c.textFaint}>{salary.currency ?? 'ر.س'} — {salary.period ?? '—'}</GText>
            </>
          ) : <GText variant="caption" color={c.textFaint}>—</GText>}
        </GCard>
      </View>

      {/* الاختصارات */}
      <GText variant="subheading" style={{ paddingHorizontal: 16, marginTop: 8, marginBottom: 8 }}>اختصارات</GText>
      <GCard style={{ marginHorizontal: 16 }}>
        {QUICK_ACTIONS.map((qa, i) => (
          <Pressable
            key={qa.label}
            onPress={() => router.push(qa.route as never)}
            style={({ pressed }) => [
              styles.actionRow,
              { backgroundColor: pressed ? c.surfaceAlt : 'transparent' },
              i < QUICK_ACTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border },
            ]}
          >
            <Ionicons name="chevron-back" size={16} color={c.textFaint} />
            <Text style={{ flex: 1, fontSize: 15, color: c.text, textAlign: 'right', marginRight: 12 }}>{qa.label}</Text>
            <View style={[styles.actionIcon, { backgroundColor: c.surfaceAlt }]}>
              <Ionicons name={qa.icon} size={18} color={c.brand} />
            </View>
          </Pressable>
        ))}
      </GCard>

      {/* تسجيل الخروج */}
      <Pressable
        onPress={logout}
        style={[styles.logoutBtn, { borderColor: c.danger }]}
      >
        <Ionicons name="log-out-outline" size={18} color={c.danger} />
        <Text style={{ fontSize: 15, color: c.danger, fontWeight: '600', marginRight: 8 }}>تسجيل الخروج</Text>
      </Pressable>
    </GScreen>
  );
}

const styles = StyleSheet.create({
  empCard: { margin: 16, padding: 20 },
  empRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  empInfo: { flex: 1 },
  cardsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12 },
  actionIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, marginTop: 24, marginBottom: 16, paddingVertical: 14, borderWidth: 1, borderRadius: 10 },
});
