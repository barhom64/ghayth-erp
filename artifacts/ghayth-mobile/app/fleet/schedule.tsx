/**
 * جدول الأسطول
 * GET /api/fleet/schedule
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FleetScheduleItem {
  id: number;
  vehiclePlate?: string;
  driverName?: string;
  scheduledAt?: string;
  tripType?: string;
  origin?: string;
  destination?: string;
  estimatedReturnAt?: string;
  status?: string;
  clientName?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

export default function FleetScheduleScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FleetScheduleItem[]>('/api/fleet/schedule');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الجدول…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جدول الأسطول' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد رحلات مجدولة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.vehiclePlate ?? '—'}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.driverName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.clientName ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.clientName}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <Text style={{ fontSize: 11, color: c.textFaint }}>⏰</Text>
              <Text style={{ fontSize: 12, color: c.text }}>{fmtDate(item.scheduledAt)}</Text>
            </View>
            {(item.origin || item.destination) ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 4 }}>
                {item.origin ?? '—'} ← {item.destination ?? '—'}
              </Text>
            ) : null}
            {item.tripType ? <Text style={{ fontSize: 11, color: c.brand, textAlign: 'right' }}>{item.tripType}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
