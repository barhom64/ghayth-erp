import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AlertDailyCount {
  date?: string;
  total?: number;
  suppressed?: number;
  delivered?: number;
}

export default function AlertFatigueDailyScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AlertDailyCount[]>('/api/bi/alert-fatigue/daily-count');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإحصاء اليومي للتنبيهات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإحصاء اليومي للتنبيهات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.date ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="stats-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>
                {item.date ? new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) : '—'}
              </Text>
              <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>{item.total ?? 0} تنبيه</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 16, marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: '#22C55E' }}>مُسلَّم: {item.delivered ?? 0}</Text>
              <Text style={{ fontSize: 12, color: '#9CA3AF' }}>مكبوت: {item.suppressed ?? 0}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
