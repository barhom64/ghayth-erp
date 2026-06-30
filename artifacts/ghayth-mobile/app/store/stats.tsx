import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface StoreStats {
  activeProducts?: number;
  totalOrders?: number;
  pendingOrders?: number;
  totalRevenue?: number;
  [key: string]: unknown;
}

export default function StoreStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<StoreStats>('/api/store/stats');
  const d = (data && !Array.isArray(data)) ? data as StoreStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات المتجر…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات المتجر' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', marginBottom: 16, borderTopWidth: 4, borderTopColor: c.brand }}>
          <Text style={{ fontSize: 40, fontWeight: '700', color: c.brand }}>{(d?.totalRevenue ?? 0).toLocaleString('ar-SA')}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>إجمالي الإيرادات (ر.س)</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {[
            { label: 'منتجات نشطة', value: String(d?.activeProducts ?? 0), color: '#22C55E' },
            { label: 'إجمالي الطلبات', value: String(d?.totalOrders ?? 0), color: c.text },
            { label: 'طلبات معلقة', value: String(d?.pendingOrders ?? 0), color: (d?.pendingOrders ?? 0) > 0 ? '#F59E0B' : c.text },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: m.color, marginBottom: 4 }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
