import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MyTrip {
  id?: number;
  status?: string;
  origin?: string;
  destination?: string;
  startedAt?: string;
  endedAt?: string;
  distanceKm?: number;
  vehiclePlate?: string;
}

export default function MeTripsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MyTrip[]>('/api/fleet/me/trips');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل رحلاتي…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const statusLabel = (s?: string) => {
    if (s === 'completed') return 'مكتملة';
    if (s === 'in_progress') return 'جارية';
    if (s === 'scheduled') return 'مجدولة';
    return s ?? '—';
  };
  const statusColor = (s?: string) => s === 'completed' ? '#22C55E' : s === 'in_progress' ? '#3B82F6' : '#9CA3AF';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'رحلاتي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="car-outline" title="لا توجد رحلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                {item.origin ?? '—'} ← {item.destination ?? '—'}
              </Text>
              <Text style={{ fontSize: 11, color: statusColor(item.status) }}>{statusLabel(item.status)}</Text>
            </View>
            {item.vehiclePlate ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.vehiclePlate}</Text>
            ) : null}
            {item.distanceKm != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>
                {item.distanceKm} كم
              </Text>
            ) : null}
            {item.startedAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.startedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
