/**
 * تحليل انحراف الميزانية
 * GET /api/finance/reports/budget-variance
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BudgetVarianceItem {
  id: number;
  accountName?: string;
  accountCode?: string;
  budgetAmount?: number;
  actualAmount?: number;
  varianceAmount?: number;
  variancePercent?: number;
  currency?: string;
  period?: string;
}

export default function BudgetVarianceScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BudgetVarianceItem[]>('/api/finance/reports/budget-variance');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل انحراف الميزانية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'انحراف الميزانية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="stats-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => {
          const isOver = item.varianceAmount != null && item.varianceAmount > 0;
          return (
            <Pressable
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {item.accountCode ? <Text style={{ fontSize: 12, color: c.brand }}>{item.accountCode}</Text> : null}
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.accountName ?? '—'}</Text>
                {item.variancePercent != null ? (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isOver ? '#EF4444' : '#22C55E' }}>
                    {isOver ? '+' : ''}{item.variancePercent.toFixed(1)}%
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.budgetAmount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>ميزانية: {item.budgetAmount.toLocaleString('ar-SA')}</Text> : null}
                {item.actualAmount != null ? <Text style={{ fontSize: 12, color: c.text }}>فعلي: {item.actualAmount.toLocaleString('ar-SA')}</Text> : null}
              </View>
              {item.period ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }}>{item.period}</Text> : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
