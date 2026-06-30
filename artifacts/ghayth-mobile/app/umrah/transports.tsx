/**
 * نقل العمرة
 * GET /api/umrah/transports
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahTransport {
  id: number;
  groupName?: string;
  vehicleType?: string;
  vehiclePlate?: string;
  driverName?: string;
  origin?: string;
  destination?: string;
  departureAt?: string;
  passengerCount?: number;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function UmrahTransportsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<UmrahTransport[]>('/api/umrah/transports');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل النقل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نقل العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="bus-outline" title="لا توجد رحلات نقل" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/umrah/transport-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.groupName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.origin ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.origin}</Text> : null}
              {item.origin && item.destination ? <Text style={{ fontSize: 12, color: c.textFaint }}>←</Text> : null}
              {item.destination ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.destination}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.vehiclePlate ? <Text style={{ fontSize: 12, color: c.brand }}>{item.vehiclePlate}</Text> : null}
              {item.passengerCount != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.passengerCount} راكب</Text> : null}
              {item.departureAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.departureAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
