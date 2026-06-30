import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BudgetVsActual {
  id?: number;
  name?: string;
  budgeted?: number;
  actual?: number;
  variance?: number;
  variancePct?: number;
  period?: string;
}

export default function FinanceBudgetVsActualScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BudgetVsActual[]>('/api/finance/budget-vs-actual');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المقارنة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الميزانية مقابل الفعلي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => {
          const varColor = (item.variance ?? 0) >= 0 ? '#22C55E' : '#EF4444';
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }}>{item.name ?? '—'}</Text>
                {item.variancePct != null ? (
                  <Text style={{ fontSize: 12, color: varColor, fontWeight: '600' }}>
                    {item.variancePct >= 0 ? '+' : ''}{item.variancePct.toFixed(1)}%
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
                <Text style={{ fontSize: 11, color: c.textMuted }}>مُدرج: {(item.budgeted ?? 0).toLocaleString('ar-SA')} ر.س</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>فعلي: {(item.actual ?? 0).toLocaleString('ar-SA')} ر.س</Text>
              </View>
              {item.period ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2, textAlign: 'right' }}>{item.period}</Text> : null}
            </View>
          );
        }}
      />
    </View>
  );
}
