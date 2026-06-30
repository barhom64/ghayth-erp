import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BranchPerformance {
  branchId?: number;
  branchName?: string;
  revenue?: number;
  expenses?: number;
  employees?: number;
  tickets?: number;
  score?: number;
}

export default function BranchPerformanceScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BranchPerformance[]>('/api/bi/reports/branch-performance');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أداء الفروع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أداء الفروع' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.branchId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.branchName ?? '—'}</Text>
              {item.score != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: item.score >= 80 ? '#22C55E' : item.score >= 60 ? '#F59E0B' : '#EF4444' }}>{item.score}%</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 16 }}>
              <Text style={{ fontSize: 12, color: '#22C55E' }}>إيراد: {(item.revenue ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 12, color: '#EF4444' }}>مصروف: {(item.expenses ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>موظفون: {item.employees ?? 0}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
