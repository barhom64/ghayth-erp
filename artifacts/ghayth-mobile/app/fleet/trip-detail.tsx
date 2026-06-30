/**
 * تفاصيل رحلة الأسطول
 * GET /api/fleet/trips/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Trip {
  id: number;
  ref?: string;
  tripNumber?: string;
  driverName?: string;
  vehiclePlate?: string;
  vehicleModel?: string;
  clientName?: string;
  origin?: string;
  destination?: string;
  departureTime?: string;
  arrivalTime?: string;
  distanceKm?: number;
  fuelConsumed?: number;
  status?: string;
  purpose?: string;
  notes?: string;
  cost?: number;
  currency?: string;
  passengerCount?: number;
  cargo?: string;
  gpsTrackingId?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

export default function TripDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: trip, isLoading } = useList<Trip>(`/api/fleet/trips/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الرحلة…" />;
  if (!trip) return <GEmptyState icon="car-outline" title="رحلة غير موجودة" description="تعذّر العثور على بيانات الرحلة" />;

  const ref = trip.tripNumber ?? trip.ref ?? `#${trip.id}`;
  const st = statusBadge(trip.status ?? '');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `رحلة ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.onPrimary }}>{trip.origin ?? '—'}</Text>
            <Ionicons name="arrow-back" size={16} color={c.onPrimary + 'AA'} />
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.onPrimary }}>{trip.destination ?? '—'}</Text>
          </View>
          {trip.clientName ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right', marginTop: 4 }}>{trip.clientName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        {trip.distanceKm ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: c.onPrimary }}>{trip.distanceKm}</Text>
            <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>كيلومتر</Text>
          </View>
        ) : null}
      </View>

      {/* KPI strip */}
      <View style={[styles.kpiRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.kpiItem}>
          <Ionicons name="person-outline" size={18} color={c.textMuted} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, marginTop: 2 }}>{trip.driverName ?? '—'}</Text>
          <Text style={{ fontSize: 10, color: c.textMuted }}>السائق</Text>
        </View>
        <View style={[styles.kpiDivider, { backgroundColor: c.border }]} />
        <View style={styles.kpiItem}>
          <Ionicons name="car-outline" size={18} color={c.textMuted} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, marginTop: 2 }}>{trip.vehiclePlate ?? '—'}</Text>
          <Text style={{ fontSize: 10, color: c.textMuted }}>{trip.vehicleModel ?? 'المركبة'}</Text>
        </View>
        <View style={[styles.kpiDivider, { backgroundColor: c.border }]} />
        <View style={styles.kpiItem}>
          <Ionicons name="water-outline" size={18} color={c.textMuted} />
          <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, marginTop: 2 }}>{trip.fuelConsumed ? `${trip.fuelConsumed} ل` : '—'}</Text>
          <Text style={{ fontSize: 10, color: c.textMuted }}>الوقود</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الغرض', value: trip.purpose },
            { label: 'وقت المغادرة', value: fmtDate(trip.departureTime) },
            { label: 'وقت الوصول', value: fmtDate(trip.arrivalTime) },
            { label: 'المسافة', value: trip.distanceKm ? `${trip.distanceKm} كم` : undefined },
            { label: 'عدد الركاب', value: trip.passengerCount ? `${trip.passengerCount} راكب` : undefined },
            { label: 'البضاعة/الحمولة', value: trip.cargo },
            { label: 'التكلفة', value: trip.cost ? `${trip.cost.toLocaleString('ar-SA')} ${trip.currency ?? 'ر.س'}` : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {trip.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{trip.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="رحلة جديدة" icon="compass-outline" variant="secondary" onPress={() => router.push('/fleet/trip-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  kpiRow: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 12 },
  kpiItem: { flex: 1, alignItems: 'center' },
  kpiDivider: { width: 1, marginVertical: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
