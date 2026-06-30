/**
 * تفاصيل حجز النقل
 * GET /api/transport/bookings/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface TransportBooking {
  id: number;
  ref?: string;
  clientName?: string;
  passengerName?: string;
  from?: string;
  to?: string;
  vehiclePlate?: string;
  driverName?: string;
  status?: string;
  scheduledAt?: string;
  completedAt?: string;
  fare?: number;
  currency?: string;
  notes?: string;
  distance?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function TransportBookingDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: booking, isLoading } = useList<TransportBooking>(`/api/transport/bookings/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الحجز…" />;
  if (!booking) return <GEmptyState icon="car-outline" title="حجز غير موجود" description="تعذّر العثور على بيانات حجز النقل" />;

  const st = statusBadge(booking.status ?? '');
  const completed = booking.status === 'completed' || booking.status === 'done';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: booking.ref ?? 'حجز نقل' }} />

      <View style={[styles.header, { backgroundColor: completed ? '#16A34A' : '#0284C7' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{booking.clientName ?? booking.passengerName ?? '—'}</Text>
          {(booking.from && booking.to) ? (
            <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{booking.from} ← {booking.to}</Text>
          ) : null}
          {booking.scheduledAt ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{fmtDate(booking.scheduledAt)}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Ionicons name="car-outline" size={36} color="#FFF" />
          {booking.fare !== undefined && (
            <Text style={{ fontSize: 13, color: '#FFFFFFCC', marginTop: 4 }}>{fmtMoney(booking.fare, booking.currency)}</Text>
          )}
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'العميل / الراكب', value: booking.clientName ?? booking.passengerName },
            { label: 'من', value: booking.from },
            { label: 'إلى', value: booking.to },
            { label: 'المركبة', value: booking.vehiclePlate },
            { label: 'السائق', value: booking.driverName },
            { label: 'موعد الرحلة', value: booking.scheduledAt ? fmtDate(booking.scheduledAt) : undefined },
            { label: 'تاريخ الإنجاز', value: booking.completedAt ? fmtDate(booking.completedAt) : undefined },
            { label: 'الأجرة', value: booking.fare !== undefined ? fmtMoney(booking.fare, booking.currency) : undefined },
            { label: 'المسافة (كم)', value: booking.distance !== undefined ? String(booking.distance) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {booking.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{booking.notes}</Text>
          </GCard>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
