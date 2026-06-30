import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RevenueByActivity {
  activityType?: string;
  revenue?: number;
  count?: number;
}

export default function RevenueByActivityScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RevenueByActivity[]>('/api/finance/reports/revenue-by-activity-type');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإيراد حسب النشاط…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإيراد حسب نوع النشاط' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.activityType ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="stats-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.activityType ?? '—'}</Text>
              {item.revenue != null ? (
                <Text style={{ fontSize: 14, color: c.brand, fontWeight: '600' }}>
                  {Number(item.revenue).toLocaleString('ar-SA')} ر.س
                </Text>
              ) : null}
            </View>
            {item.count != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
                العدد: {item.count}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
