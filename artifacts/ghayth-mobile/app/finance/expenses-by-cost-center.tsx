import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExpensesByCostCenter {
  costCenterName?: string;
  costCenterId?: number;
  total?: number;
  budgetAmount?: number;
}

export default function ExpensesByCostCenterScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExpensesByCostCenter[]>('/api/finance/reports/expenses-by-cost-center');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المصروفات حسب مركز التكلفة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المصروفات حسب مركز التكلفة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.costCenterId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.costCenterName ?? '—'}</Text>
              {item.total != null ? (
                <Text style={{ fontSize: 13, color: c.text, fontWeight: '600' }}>
                  {Number(item.total).toLocaleString('ar-SA')} ر.س
                </Text>
              ) : null}
            </View>
            {item.budgetAmount != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
                الميزانية: {Number(item.budgetAmount).toLocaleString('ar-SA')} ر.س
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
