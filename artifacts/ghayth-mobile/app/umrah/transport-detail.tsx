/**
 * تفاصيل رحلة النقل (عمرة)
 * GET /api/umrah/transport/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface UmrahTransport {
  id: number;
  ref?: string;
  fromLocation?: string;
  toLocation?: string;
  vehiclePlate?: string;
  driverName?: string;
  seasonTitle?: string;
  capacity?: number;
  enrolled?: number;
  cost?: number;
  currency?: string;
  status?: string;
  tripDate?: string;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function UmrahTransportDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: trip, isLoading } = useList<UmrahTransport>(`/api/umrah/transport/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الرحلة…" />;
  if (!trip) return <GEmptyState icon="bus-outline" title="رحلة غير موجودة" description="تعذّر العثور على بيانات رحلة النقل" />;

  const st = statusBadge(trip.status ?? '');
  const fillPct = trip.capacity ? Math.round(((trip.enrolled ?? 0) / trip.capacity) * 100) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `${trip.fromLocation ?? '—'} → ${trip.toLocation ?? '—'}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#0284C7' }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }}>{trip.fromLocation ?? '—'}</Text>
            <Ionicons name="arrow-back-outline" size={14} color="#FFFFFFAA" />
            <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFF' }}>{trip.toLocation ?? '—'}</Text>
          </View>
          {trip.seasonTitle ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{trip.seasonTitle}</Text> : null}
          {trip.driverName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{trip.driverName} — {trip.vehiclePlate}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>{trip.enrolled ?? 0}/{trip.capacity ?? '—'}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>مقعد</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF', marginTop: 4 }}>{fmtMoney(trip.cost, trip.currency)}</Text>
        </View>
      </View>

      {trip.capacity ? (
        <View style={{ height: 6, backgroundColor: c.border }}>
          <View style={{ height: 6, width: `${fillPct}%`, backgroundColor: fillPct >= 90 ? '#EF4444' : '#22C55E' }} />
        </View>
      ) : null}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'تاريخ الرحلة', value: trip.tripDate ? fmtDate(trip.tripDate) : undefined },
            { label: 'من', value: trip.fromLocation },
            { label: 'إلى', value: trip.toLocation },
            { label: 'المركبة', value: trip.vehiclePlate },
            { label: 'السائق', value: trip.driverName },
            { label: 'الموسم', value: trip.seasonTitle },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {trip.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{trip.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="حجز نقل جديد" icon="bus-outline" variant="secondary" onPress={() => router.push('/umrah/transport-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
