/**
 * قائمة حجوزات النقل
 * GET /api/transport/bookings
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Booking {
  id: number;
  bookingNumber?: string;
  clientName?: string;
  origin?: string;
  destination?: string;
  scheduledAt?: string;
  status?: string;
  passengerCount?: number;
  vehicleType?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'قيد المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

export default function TransportBookingListScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Booking[]>('/api/transport/bookings');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحجوزات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حجوزات النقل' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="car-outline" title="لا توجد حجوزات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/fleet/transport-booking-detail' as never, params: { id: item.id } })}
            style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.bookingNumber ?? `#${item.id}`}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{item.clientName ?? '—'}</Text>
              {item.origin && item.destination ? (
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {item.origin} ← {item.destination}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                {item.scheduledAt ? (
                  <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.scheduledAt)}</Text>
                ) : null}
                {item.passengerCount != null ? (
                  <Text style={{ fontSize: 11, color: c.textFaint }}>{item.passengerCount} راكب</Text>
                ) : null}
                {item.vehicleType ? (
                  <Text style={{ fontSize: 11, color: c.textFaint }}>{item.vehicleType}</Text>
                ) : null}
              </View>
            </View>
            <Ionicons name="chevron-back-outline" size={16} color={c.textMuted} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
});
