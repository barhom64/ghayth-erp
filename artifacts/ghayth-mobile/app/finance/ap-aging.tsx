import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ApAgingBucket {
  vendorId?: number;
  vendorName?: string;
  current?: number;
  days1_30?: number;
  days31_60?: number;
  days61_90?: number;
  over90?: number;
  total?: number;
  currency?: string;
}

export default function ApAgingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ApAgingBucket[]>('/api/finance/ap-aging');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقادم الذمم الدائنة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقادم الذمم الدائنة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.vendorId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد بيانات تقادم" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 6 }}>{item.vendorName ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 8, flexWrap: 'wrap' }}>
              {item.current != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>جاري: {item.current.toLocaleString('ar-SA')}</Text> : null}
              {item.days1_30 != null ? <Text style={{ fontSize: 11, color: '#F59E0B' }}>1-30: {item.days1_30.toLocaleString('ar-SA')}</Text> : null}
              {item.days31_60 != null ? <Text style={{ fontSize: 11, color: '#EF4444' }}>31-60: {item.days31_60.toLocaleString('ar-SA')}</Text> : null}
              {item.over90 != null ? <Text style={{ fontSize: 11, color: '#DC2626', fontWeight: '700' }}>+90: {item.over90.toLocaleString('ar-SA')}</Text> : null}
              {item.total != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>المجموع: {item.total.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
