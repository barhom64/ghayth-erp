import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AbcItem {
  productId?: number;
  productName?: string;
  class?: 'A' | 'B' | 'C';
  annualUsageValue?: number;
  cumulativePct?: number;
  currency?: string;
}

const classColor: Record<string, string> = { A: '#22C55E', B: '#F59E0B', C: '#EF4444' };

export default function AbcClassificationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AbcItem[]>('/api/abc-classification');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تصنيف ABC…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تصنيف ABC' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.productId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="analytics-outline" title="لا يوجد تصنيف ABC" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 4, borderRightColor: classColor[item.class ?? ''] ?? c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.productName ?? '—'}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: classColor[item.class ?? ''] ?? c.text }}>{item.class ?? '—'}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.annualUsageValue != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.annualUsageValue.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.cumulativePct != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.cumulativePct.toFixed(1)}% تراكمي</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
