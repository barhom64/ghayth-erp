/**
 * أرصدة الإجازات — عرض تفصيلي لكل أنواع الإجازة ورصيدها
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GText, GButton, GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LeaveBalance {
  leaveTypeId: number;
  name: string;
  entitled: number;
  used: number;
  remaining: number;
}

interface MySpaceData {
  leaveBalances?: LeaveBalance[];
}

function BalanceBar({ used, entitled, c }: { used: number; entitled: number; c: ReturnType<typeof useColors> }) {
  const pct = entitled > 0 ? Math.min((used / entitled) * 100, 100) : 0;
  const color = pct >= 80 ? c.danger : pct >= 50 ? '#F59E0B' : '#22C55E';
  return (
    <View style={[styles.barBg, { backgroundColor: c.surfaceAlt }]}>
      <View style={[styles.barFill, { width: `${pct}%` as never, backgroundColor: color }]} />
    </View>
  );
}

export default function LeaveBalancesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<MySpaceData>('/api/my-space');

  const balances: LeaveBalance[] = data?.leaveBalances ?? [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأرصدة…" />;
  if (isError) return (
    <GEmptyState
      icon="alert-circle-outline"
      title="تعذّر تحميل الأرصدة"
      description="تحقق من اتصالك وحاول مجدداً"
      actionLabel="إعادة المحاولة"
      onAction={refetch}
    />
  );
  if (!balances.length) return (
    <GEmptyState
      icon="calendar-outline"
      title="لا توجد أرصدة إجازة"
      description="لم يتم تسجيل أرصدة إجازة لحسابك بعد"
    />
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: 'أرصدة الإجازات' }} />

      {balances.map(b => {
        const pct = b.entitled > 0 ? Math.round((b.used / b.entitled) * 100) : 0;
        return (
          <GCard key={b.leaveTypeId} style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={[styles.pct, { color: pct >= 80 ? c.danger : pct >= 50 ? '#F59E0B' : '#22C55E' }]}>
                {pct}%
              </Text>
              <GText variant="subheading">{b.name}</GText>
            </View>

            <BalanceBar used={b.used} entitled={b.entitled} c={c} />

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: c.danger }]}>{b.used}</Text>
                <Text style={[styles.statLabel, { color: c.textMuted }]}>مستخدم</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: '#22C55E' }]}>{b.remaining}</Text>
                <Text style={[styles.statLabel, { color: c.textMuted }]}>متبقٍ</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: c.text }]}>{b.entitled}</Text>
                <Text style={[styles.statLabel, { color: c.textMuted }]}>المستحق</Text>
              </View>
            </View>
          </GCard>
        );
      })}

      <GButton
        title="طلب إجازة جديد"
        icon="calendar-outline"
        onPress={() => router.push('/hr/leave-new')}
        style={{ marginTop: 4 }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { gap: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pct: { fontSize: 13, fontWeight: '700' },
  barBg: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 4 },
  statItem: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11 },
});
