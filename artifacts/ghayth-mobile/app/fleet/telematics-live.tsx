import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LiveVehicle {
  vehicleId?: number;
  plateNumber?: string;
  driverName?: string;
  speed?: number;
  status?: string;
  lat?: number;
  lng?: number;
  updatedAt?: string;
}

export default function FleetTelematicsLiveScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LiveVehicle[]>('/api/telematics/live');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المركبات المباشرة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التتبع المباشر' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.vehicleId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="location-outline" title="لا توجد مركبات نشطة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.plateNumber ?? '—'}</Text>
              {item.driverName ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.driverName}</Text> : null}
              {item.updatedAt ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>{new Date(item.updatedAt).toLocaleTimeString('ar-SA')}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {item.speed != null ? <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{item.speed} كم/س</Text> : null}
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.status === 'moving' ? '#22C55E' : '#F59E0B' }} />
                <Text style={{ fontSize: 11, color: c.textMuted }}>{item.status === 'moving' ? 'تتحرك' : 'واقفة'}</Text>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}
