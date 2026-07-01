import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LotAgingItem { id?: number; lotNumber?: string; productName?: string; daysOld?: number; quantity?: number; expiryDate?: string; }

export default function LotAgingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LotAgingItem[]>('/api/warehouse/reports/lot-aging');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقادم الدُّفعات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.productName ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>دفعة: {item.lotNumber ?? ''}</Text>
              {item.daysOld != null ? <Text style={{ color: item.daysOld > 90 ? '#e53e3e' : c.textMuted, fontSize: 12 }}>{item.daysOld} يوم</Text> : null}
              {item.quantity != null ? <Text style={{ color: c.brand, fontSize: 12 }}>{item.quantity}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
