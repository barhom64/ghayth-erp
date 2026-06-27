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
import type { ComponentProps } from 'react';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface MySpaceData {
  employee?: { name: string; jobTitle?: string; company?: string; department?: string };
  attendance?: { status: string; checkInTime?: string; checkOutTime?: string };
  leaveBalance?: { annual: number; used: number; remaining: number };
  lastSalary?: { amount: number; month: string; currency?: string };
}

interface QuickAction { label: string; icon: IoniconName; route: string }

const QUICK_ACTIONS: QuickAction[] = [
  { label: 'تسجيل الحضور', icon: 'finger-print-outline',      route: '/hr/attendance' },
  { label: 'طلب إجازة',     icon: 'calendar-outline',          route: '/hr/leave-new' },
  { label: 'طلبات الإجازة', icon: 'list-outline',              route: '/hr/leaves' },
  { label: 'كشف الراتب',    icon: 'document-text-outline',     route: '/m/hr/payslips' },
];

export default function MeScreen() {
  const c = useColors();
  const { user, logout } = useAuth();
  const router = useRouter();
  const { data, isLoading } = useList<MySpaceData>('/api/me/summary');

  if (isLoading) return <GLoadingState text="جارٍ التحميل…" />;

  const emp = data?.employee;
  const att = data?.attendance;
  const leave = data?.leaveBalance;
  const salary = data?.lastSalary;

  return (
    <GScreen scrollable>
      {/* بطاقة الموظف */}
      <GCard style={[styles.empCard, { backgroundColor: c.primary }]}>
        <View style={styles.empRow}>
          <GAvatar name={emp?.name ?? user?.name} size="lg" />
          <View style={styles.empInfo}>
            <GText variant="heading" color={c.onPrimary}>{emp?.name ?? user?.name ?? '—'}</GText>
            {emp?.jobTitle ? <GText variant="label" color={c.onPrimary + 'CC'}>{emp.jobTitle}</GText> : null}
            {emp?.company ? <GText variant="caption" color={c.onPrimary + '99'} style={{ marginTop: 2 }}>{emp.company}</GText> : null}
          </View>
        </View>
      </GCard>

      {/* بطاقات سريعة */}
      <View style={styles.cardsRow}>
        {/* حضور اليوم */}
        <GCard style={{ flex: 1 }}>
          <GText variant="caption" color={c.textMuted}>حضور اليوم</GText>
          {att ? <GStatusBadge status={att.status} size="sm" /> : <GText variant="caption" color={c.textFaint}>—</GText>}
          {att?.checkInTime ? <GText variant="caption" color={c.textMuted} style={{ marginTop: 4 }}>دخول: {att.checkInTime}</GText> : null}
        </GCard>
        {/* رصيد الإجازات */}
        <GCard style={{ flex: 1 }}>
          <GText variant="caption" color={c.textMuted}>رصيد الإجازة</GText>
          <GText variant="subheading" style={{ marginTop: 4 }}>{leave?.remaining ?? '—'}</GText>
          <GText variant="caption" color={c.textFaint}>يوم متبقٍ</GText>
        </GCard>
        {/* آخر راتب */}
        <GCard style={{ flex: 1 }}>
          <GText variant="caption" color={c.textMuted}>آخر راتب</GText>
          {salary ? (
            <>
              <GText variant="subheading" style={{ marginTop: 4 }}>{salary.amount.toLocaleString('ar-SA')}</GText>
              <GText variant="caption" color={c.textFaint}>{salary.currency ?? 'ر.س'} — {salary.month}</GText>
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
