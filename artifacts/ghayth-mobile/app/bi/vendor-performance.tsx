import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VendorPerformance {
  vendorId?: number;
  vendorName?: string;
  totalOrders?: number;
  totalValue?: number;
  onTimeRate?: number;
  defectRate?: number;
  score?: number;
}

export default function VendorPerformanceScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<VendorPerformance[]>('/api/bi/reports/vendor-performance');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أداء الموردين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أداء الموردين' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.vendorId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="car-outline" title="لا يوجد موردون" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.vendorName ?? '—'}</Text>
              {item.score != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: item.score >= 80 ? '#22C55E' : item.score >= 60 ? '#F59E0B' : '#EF4444' }}>{item.score}%</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 14 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>طلبات: {item.totalOrders ?? 0}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>قيمة: {(item.totalValue ?? 0).toLocaleString('ar-SA')}</Text>
              {item.onTimeRate != null ? <Text style={{ fontSize: 12, color: '#22C55E' }}>في الوقت: {item.onTimeRate}%</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
