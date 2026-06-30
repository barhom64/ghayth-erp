/**
 * سلف الرواتب
 * GET /api/finance/salary-advances
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SalaryAdvance {
  id: number;
  employeeName?: string;
  amount?: number;
  currency?: string;
  requestDate?: string;
  repaymentMonths?: number;
  deductedMonths?: number;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function SalaryAdvancesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<SalaryAdvance[]>('/api/finance/salary-advances');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سلف الرواتب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سلف الرواتب' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wallet-outline" title="لا توجد سلف" description="" />}
        renderItem={({ item }) => {
          const deducted = item.deductedMonths ?? 0;
          const total = item.repaymentMonths ?? 1;
          const pct = Math.min(100, Math.round((deducted / total) * 100));
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/finance/salary-advance-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 6 }}>
                {item.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
                {item.requestDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.requestDate)}</Text> : null}
              </View>
              <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2, overflow: 'hidden' }}>
                <View style={{ height: 4, width: `${pct}%` as never, backgroundColor: c.brand, borderRadius: 2 }} />
              </View>
              <Text style={{ fontSize: 10, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>{deducted}/{total} أشهر مستقطعة</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
