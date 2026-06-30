import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RevenueItem {
  period?: string;
  category?: string;
  revenue?: number;
  currency?: string;
}

export default function RevenueAnalysisScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RevenueItem[]>('/api/reports/revenue-analysis');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تحليل الإيرادات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحليل الإيرادات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => `${item.period}-${item.category}-${i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد بيانات إيرادات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.category ?? '—'}</Text>
                {item.period ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }}>{item.period}</Text> : null}
              </View>
              {item.revenue != null ? <Text style={{ fontSize: 14, fontWeight: '700', color: '#22C55E' }}>{item.revenue.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
