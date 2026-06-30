/**
 * الميزانيات
 * GET /api/finance/budgets
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Budget {
  id: number;
  name?: string;
  fiscalYear?: string;
  department?: string;
  totalBudget?: number;
  spent?: number;
  remaining?: number;
  currency?: string;
  status?: string;
  period?: string;
}

function pctColor(pct: number): string {
  if (pct >= 90) return '#EF4444';
  if (pct >= 75) return '#F59E0B';
  return '#22C55E';
}

export default function BudgetsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Budget[]>('/api/finance/budgets');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الميزانيات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الميزانيات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wallet-outline" title="لا توجد ميزانيات" description="" />}
        renderItem={({ item }) => {
          const total = item.totalBudget ?? 0;
          const spent = item.spent ?? 0;
          const pct = total > 0 ? (spent / total) * 100 : 0;
          const color = pctColor(pct);
          return (
            <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 10 }}>
                {item.fiscalYear ? <Text style={{ fontSize: 12, color: c.brand }}>{item.fiscalYear}</Text> : null}
                {item.department ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.department}</Text> : null}
                {item.period ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.period}</Text> : null}
              </View>
              <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4, marginBottom: 8 }}>
                <View style={{ height: 8, width: `${Math.min(pct, 100)}%` as never, backgroundColor: color, borderRadius: 4 }} />
              </View>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>المصروف</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color }}>{spent.toLocaleString('ar-SA')}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color }}>{pct.toFixed(1)}%</Text>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>الإجمالي</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{total.toLocaleString('ar-SA')}</Text>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
