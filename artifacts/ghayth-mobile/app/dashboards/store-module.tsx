import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface StoreModuleDashboard {
  totalRevenue?: number;
  totalOrders?: number;
  pendingOrders?: number;
  activeProducts?: number;
  lowStockProducts?: number;
  avgOrderValue?: number;
  todayOrders?: number;
  cancelledOrders?: number;
  [key: string]: unknown;
}

export default function StoreModuleDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<StoreModuleDashboard>('/api/module-dashboards/store');
  const d = (data && !Array.isArray(data)) ? data as StoreModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة المتجر…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة المتجر' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: '#22C55E' }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color: '#22C55E' }}>{(d?.totalRevenue ?? 0).toLocaleString('ar-SA')}</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>إجمالي الإيرادات (ر.س)</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'إجمالي الطلبات', value: d?.totalOrders ?? 0, color: c.text },
            { label: 'طلبات معلقة', value: d?.pendingOrders ?? 0, color: '#F59E0B' },
            { label: 'طلبات اليوم', value: d?.todayOrders ?? 0, color: '#3B82F6' },
            { label: 'منتجات نشطة', value: d?.activeProducts ?? 0, color: c.brand },
            { label: 'مخزون منخفض', value: d?.lowStockProducts ?? 0, color: '#EF4444' },
            { label: 'ملغي', value: d?.cancelledOrders ?? 0, color: '#EF4444' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {d?.avgOrderValue != null ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>متوسط قيمة الطلب</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{d.avgOrderValue.toLocaleString('ar-SA')} ر.س</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
