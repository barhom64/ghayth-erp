import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ScheduleRow { id?: number; period?: string; depreciation?: number; bookValue?: number; }

export default function FixedAssetScheduleScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ScheduleRow[]>('/api/finance/fixed-assets/0/schedule');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جدول إهلاك الأصل' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="stats-chart-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.period ?? ''}</Text>
            {item.depreciation != null && (
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
                الإهلاك: {item.depreciation.toLocaleString('ar-SA')} ر.س
              </Text>
            )}
            {item.bookValue != null && (
              <Text style={{ color: c.textMuted, fontSize: 12 }}>
                القيمة الدفترية: {item.bookValue.toLocaleString('ar-SA')} ر.س
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
