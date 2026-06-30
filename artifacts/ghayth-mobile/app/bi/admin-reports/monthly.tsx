import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MonthlyReportItem {
  metric?: string;
  value?: number;
  unit?: string;
  monthLabel?: string;
  yoy?: number;
}

export default function BiAdminReportsMonthlyScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MonthlyReportItem[]>('/api/bi/admin-reports/monthly');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التقرير الشهري…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التقرير الشهري' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.metric ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, color: c.text }}>{item.metric ?? '—'}</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: c.text }}>
                {item.value?.toLocaleString('ar-SA') ?? '—'} {item.unit ?? ''}
              </Text>
            </View>
            {item.yoy != null ? (
              <Text style={{ fontSize: 11, color: item.yoy >= 0 ? '#22C55E' : '#EF4444', marginTop: 2, textAlign: 'left' }}>
                {item.yoy >= 0 ? '+' : ''}{item.yoy}% سنوياً
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
