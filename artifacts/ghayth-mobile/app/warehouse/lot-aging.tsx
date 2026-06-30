import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LotAgingItem {
  id?: number;
  lotNumber?: string;
  productName?: string;
  ageDays?: number;
  qty?: number;
  costValue?: number;
}

export default function LotAgingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LotAgingItem[]>('/api/reports/lot-aging');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقادم الدُفعات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقادم الدُفعات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد بيانات تقادم" description="" />}
        renderItem={({ item }) => {
          const ageColor = (item.ageDays ?? 0) > 180 ? '#EF4444' : (item.ageDays ?? 0) > 90 ? '#F59E0B' : c.text;
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.productName ?? item.lotNumber ?? '—'}</Text>
                {item.ageDays != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: ageColor }}>{item.ageDays} يوم</Text> : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.qty != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>الكمية: {item.qty}</Text> : null}
                {item.costValue != null ? <Text style={{ fontSize: 11, color: c.brand }}>{item.costValue.toLocaleString('ar-SA')} ر.س</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
