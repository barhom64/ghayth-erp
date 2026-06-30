import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TransportBooking { id?: number; bookingNumber?: string; clientName?: string; origin?: string; destination?: string; scheduledDate?: string; status?: string; vehicleType?: string; passengerCount?: number; totalFare?: number; }

export default function TransportBookingDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TransportBooking>('/api/transport/bookings/0');
  const d = (data && !Array.isArray(data)) ? data as TransportBooking : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['رقم الحجز', d.bookingNumber ?? '-'],
    ['العميل', d.clientName ?? '-'],
    ['من', d.origin ?? '-'],
    ['إلى', d.destination ?? '-'],
    ['التاريخ', d.scheduledDate ? new Date(d.scheduledDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'],
    ['نوع المركبة', d.vehicleType ?? '-'],
    ['عدد الركاب', String(d.passengerCount ?? 0)],
    ['الأجرة', (d.totalFare ?? 0).toLocaleString('ar-SA') + ' ر.س'],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حجز #' + (d.bookingNumber ?? '') }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{d.bookingNumber ?? '-'}</Text>
        <GStatusBadge status={d.status ?? 'pending'} />
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
