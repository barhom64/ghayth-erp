import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetTcoItem {
  vehicleId?: number;
  plateNumber?: string;
  type?: string;
  fuelCost?: number;
  maintenanceCost?: number;
  insuranceCost?: number;
  totalCost?: number;
  revenue?: number;
  roi?: number;
}

export default function FleetTcoScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FleetTcoItem[]>('/api/bi/reports/fleet-tco');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تكلفة الأسطول…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التكلفة الإجمالية للأسطول' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.vehicleId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="car-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.plateNumber ?? '—'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{(item.totalCost ?? 0).toLocaleString('ar-SA')} ر.س</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.type ? <Text style={{ fontSize: 11, color: c.brand }}>{item.type}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textMuted }}>وقود: {(item.fuelCost ?? 0).toLocaleString('ar-SA')}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>صيانة: {(item.maintenanceCost ?? 0).toLocaleString('ar-SA')}</Text>
              {item.roi != null ? <Text style={{ fontSize: 11, color: item.roi >= 0 ? '#22C55E' : '#EF4444' }}>ROI: {item.roi}%</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
