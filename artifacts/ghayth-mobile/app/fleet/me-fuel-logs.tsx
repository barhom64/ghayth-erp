import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FuelLog {
  id?: number;
  liters?: number;
  costPerLiter?: number;
  totalCost?: number;
  odometer?: number;
  fuelledAt?: string;
  vehiclePlate?: string;
  stationName?: string;
}

export default function MeFuelLogsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FuelLog[]>('/api/fleet/me/fuel-logs');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجلات الوقود…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجلات الوقود' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="water-outline" title="لا توجد سجلات وقود" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                {item.liters != null ? `${item.liters} لتر` : '—'}
              </Text>
              {item.totalCost != null ? (
                <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>
                  {Number(item.totalCost).toLocaleString('ar-SA')} ر.س
                </Text>
              ) : null}
            </View>
            {item.vehiclePlate ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.vehiclePlate}</Text>
            ) : null}
            {item.odometer != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>
                العداد: {item.odometer.toLocaleString('ar-SA')} كم
              </Text>
            ) : null}
            {item.fuelledAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.fuelledAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
