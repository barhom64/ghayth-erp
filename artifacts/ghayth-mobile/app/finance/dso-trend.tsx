import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DsoTrendItem {
  period?: string;
  dso?: number;
  avgReceivables?: number;
  revenue?: number;
}

export default function DsoTrendScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DsoTrendItem[]>('/api/dso-trend');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل اتجاه DSO…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'اتجاه أيام التحصيل DSO' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.period ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد بيانات DSO" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.period ?? '—'}</Text>
              {item.dso != null ? <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{item.dso.toFixed(0)} يوم</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.avgReceivables != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>متوسط الذمم: {item.avgReceivables.toLocaleString('ar-SA')}</Text> : null}
              {item.revenue != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>الإيراد: {item.revenue.toLocaleString('ar-SA')}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
