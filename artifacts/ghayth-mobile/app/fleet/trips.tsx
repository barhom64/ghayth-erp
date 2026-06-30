/**
 * الرحلات
 * GET /api/fleet/trips
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Trip {
  id: number;
  tripNumber?: string;
  vehiclePlate?: string;
  driverName?: string;
  origin?: string;
  destination?: string;
  scheduledAt?: string;
  distance?: number;
  status?: string;
  clientName?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

export default function TripsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Trip[]>('/api/fleet/trips');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الرحلات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الرحلات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="compass-outline" title="لا توجد رحلات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/fleet/trip-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.vehiclePlate ?? '—'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, flex: 1, textAlign: 'right' }}>{item.driverName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {(item.origin || item.destination) ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                {item.origin ?? '—'} ← {item.destination ?? '—'}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.scheduledAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.scheduledAt)}</Text> : null}
              {item.distance != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.distance} كم</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
