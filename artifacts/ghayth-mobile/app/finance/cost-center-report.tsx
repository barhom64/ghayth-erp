import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CostCenterReport {
  id?: number;
  name?: string;
  totalDebits?: number;
  totalCredits?: number;
  netBalance?: number;
  budgetedAmount?: number;
  variance?: number;
}

export default function FinanceCostCenterReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CostCenterReport[]>('/api/finance/cost-center-report');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير مراكز التكلفة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير مراكز التكلفة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="pie-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => {
          const net = item.netBalance ?? 0;
          return (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }}>{item.name ?? '—'}</Text>
                <Text style={{ fontSize: 13, color: net >= 0 ? '#22C55E' : '#EF4444', fontWeight: '600' }}>
                  {net.toLocaleString('ar-SA')} ر.س
                </Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: c.textMuted }}>مدين: {(item.totalDebits ?? 0).toLocaleString('ar-SA')}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>دائن: {(item.totalCredits ?? 0).toLocaleString('ar-SA')}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}
