/**
 * تحليل المصروفات
 * GET /api/finance/reports/expenses-analysis
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExpenseAnalysis {
  id: number;
  category?: string;
  totalAmount?: number;
  previousAmount?: number;
  changePercent?: number;
  currency?: string;
  period?: string;
}

export default function ExpensesAnalysisScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExpenseAnalysis[]>('/api/finance/reports/expenses-analysis');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تحليل المصروفات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحليل المصروفات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => {
          const isUp = item.changePercent != null && item.changePercent > 0;
          return (
            <Pressable
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.category ?? '—'}</Text>
                {item.changePercent != null ? (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isUp ? '#EF4444' : '#22C55E' }}>
                    {isUp ? '▲' : '▼'}{Math.abs(item.changePercent).toFixed(1)}%
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.totalAmount != null ? (
                  <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '700' }}>
                    {item.totalAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                  </Text>
                ) : null}
                {item.period ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.period}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
