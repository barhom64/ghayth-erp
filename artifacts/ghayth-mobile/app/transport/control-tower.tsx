import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ControlTowerData {
  activeTrips?: number;
  pendingBookings?: number;
  availableDrivers?: number;
  activeVehicles?: number;
  alerts?: Array<{ type: string; message: string }>;
}

export default function ControlTowerScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ControlTowerData>('/api/transport/control-tower');

  if (isLoading) return <GLoadingState text="جارٍ تحميل برج المراقبة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const d = data as ControlTowerData | null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'برج المراقبة' }} />
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'رحلات نشطة', value: d?.activeTrips ?? 0, color: c.brand },
          { label: 'حجوزات معلقة', value: d?.pendingBookings ?? 0, color: '#F59E0B' },
          { label: 'سائقون متاحون', value: d?.availableDrivers ?? 0, color: '#22C55E' },
          { label: 'مركبات نشطة', value: d?.activeVehicles ?? 0, color: c.text },
        ].map(item => (
          <View key={item.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, flex: 1, minWidth: 140, alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: item.color }}>{item.value}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'center' }}>{item.label}</Text>
          </View>
        ))}
      </View>
      {d?.alerts && d.alerts.length > 0 ? (
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 16 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>التنبيهات</Text>
          {d.alerts.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row-reverse', gap: 8, paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.border }}>
              <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '600' }}>{a.type}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, flex: 1, textAlign: 'right' }}>{a.message}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
