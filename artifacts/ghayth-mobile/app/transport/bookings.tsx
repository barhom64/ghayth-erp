/**
 * حجوزات النقل
 * GET /api/transport/bookings
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TransportBooking {
  id: number;
  bookingNumber?: string;
  customerName?: string;
  origin?: string;
  destination?: string;
  scheduledAt?: string;
  lineCount?: number;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function TransportBookingsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<TransportBooking[]>('/api/transport/bookings');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل حجوزات النقل…" />;
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
            onPress={() => router.push({ pathname: '/transport/booking-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.bookingNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.bookingNumber}</Text> : null}
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.customerName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.origin ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.origin}</Text> : null}
              {item.origin && item.destination ? <Text style={{ fontSize: 12, color: c.textFaint }}>←</Text> : null}
              {item.destination ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.destination}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.lineCount != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.lineCount} خط</Text> : null}
              {item.scheduledAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.scheduledAt)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
