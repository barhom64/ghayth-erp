import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BudgetVarianceItem {
  id?: number;
  accountCode?: string;
  accountName?: string;
  budgeted?: number;
  actual?: number;
  variance?: number;
  category?: string;
}

export default function FinanceBudgetVarianceReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BudgetVarianceItem[]>('/api/finance/budget/variance');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير الانحراف…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير انحراف الميزانية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => {
          const v = item.variance ?? 0;
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, flex: 1 }}>{item.accountName ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: v >= 0 ? '#22C55E' : '#EF4444', fontWeight: '600' }}>
                  {v >= 0 ? '+' : ''}{v.toLocaleString('ar-SA')} ر.س
                </Text>
              </View>
              {item.accountCode ? <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>{item.accountCode}</Text> : null}
            </View>
          );
        }}
      />
    </View>
  );
}
