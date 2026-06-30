import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VehicleTco { vehicleId?: number; plate?: string; acquisitionCost?: number; fuelCost?: number; maintenanceCost?: number; insuranceCost?: number; violationCost?: number; totalCost?: number; costPerKm?: number; }

export default function VehicleTcoScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<VehicleTco>('/api/fleet/vehicles/0/tco');
  const d = (data && !Array.isArray(data)) ? data as VehicleTco : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['تكلفة الاقتناء', (d.acquisitionCost ?? 0).toLocaleString('ar-SA') + ' ر.س'],
    ['تكلفة الوقود', (d.fuelCost ?? 0).toLocaleString('ar-SA') + ' ر.س'],
    ['تكلفة الصيانة', (d.maintenanceCost ?? 0).toLocaleString('ar-SA') + ' ر.س'],
    ['تكلفة التأمين', (d.insuranceCost ?? 0).toLocaleString('ar-SA') + ' ر.س'],
    ['تكلفة المخالفات', (d.violationCost ?? 0).toLocaleString('ar-SA') + ' ر.س'],
    ['إجمالي التكلفة', (d.totalCost ?? 0).toLocaleString('ar-SA') + ' ر.س'],
    ['التكلفة/كم', (d.costPerKm ?? 0).toLocaleString('ar-SA') + ' ر.س'],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تكلفة ملكية المركبة (TCO)' }} />
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14, fontWeight: label === 'إجمالي التكلفة' ? '700' : '400' }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
