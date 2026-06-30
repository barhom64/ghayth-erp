import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SeasonalPattern { month?: string; revenue?: number; tickets?: number; }

export default function SeasonalPatterns() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SeasonalPattern[]>('/api/intelligence/seasonal-patterns');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأنماط الموسمية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bar-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.month ?? '—'}</Text>
            <Text style={{ color: c.brand, fontSize: 14 }}>{item.revenue?.toLocaleString('ar-SA') ?? '—'} ر.س</Text>
          </View>
        )}
      />
    </View>
  );
}
