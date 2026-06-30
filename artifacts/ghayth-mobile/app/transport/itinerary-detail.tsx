/**
 * تفاصيل خط سير نقل — رحلات مجدولة
 * GET /api/transport/itineraries/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Leg {
  id?: number;
  sequence?: number;
  fromLocation?: string;
  toLocation?: string;
  estimatedDuration?: number;
  distanceKm?: number;
  notes?: string;
}

interface Itinerary {
  id: number;
  title?: string;
  description?: string;
  totalDistanceKm?: number;
  estimatedDurationMin?: number;
  status?: string;
  legs?: Leg[];
}

function fmtDuration(min?: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h} ساعة${m > 0 ? ` ${m} دقيقة` : ''}` : `${m} دقيقة`;
}

export default function ItineraryDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: itin, isLoading } = useList<Itinerary>(`/api/transport/itineraries/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل خط السير…" />;
  if (!itin) return <GEmptyState icon="layers-outline" title="غير موجود" description="لم يُعثر على خط السير" />;

  const legs = itin.legs ?? [];
  const st = statusBadge(itin.status ?? '');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: itin.title ?? `خط سير #${itin.id}` }} />

      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{itin.title ?? `خط سير #${itin.id}`}</Text>
        {itin.description ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right', marginTop: 4 }}>{itin.description}</Text> : null}
        {st ? <View style={{ marginTop: 8, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
      </View>

      <View style={[styles.summaryRow, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.summaryItem}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{itin.totalDistanceKm ?? '—'} كم</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>إجمالي المسافة</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
        <View style={styles.summaryItem}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{fmtDuration(itin.estimatedDurationMin)}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>المدة التقديرية</Text>
        </View>
        <View style={[styles.summaryDivider, { backgroundColor: c.border }]} />
        <View style={styles.summaryItem}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{legs.length}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>محطات</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {legs.length > 0 ? (
          <>
            <GText variant="subheading" style={{ fontWeight: '700' }}>محطات خط السير</GText>
            <GCard style={{ gap: 0, padding: 0 }}>
              {legs.map((leg, i) => (
                <View key={leg.id ?? i} style={[styles.legRow, { borderBottomColor: c.border }, i === legs.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={[styles.legNumber, { backgroundColor: c.primary }]}>
                    <Text style={{ color: c.onPrimary, fontSize: 12, fontWeight: '700' }}>{leg.sequence ?? i + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                      {leg.fromLocation ?? '—'} ← {leg.toLocation ?? '—'}
                    </Text>
                    <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                      {leg.distanceKm ? `${leg.distanceKm} كم · ` : ''}{fmtDuration(leg.estimatedDuration)}
                    </Text>
                    {leg.notes ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>{leg.notes}</Text> : null}
                  </View>
                </View>
              ))}
            </GCard>
          </>
        ) : (
          <GEmptyState icon="compass-outline" title="لا توجد محطات" description="لم تُضف محطات لهذا الخط بعد" />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { padding: 20 },
  summaryRow: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 12 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryDivider: { width: 1, marginVertical: 4 },
  legRow: { flexDirection: 'row', alignItems: 'flex-start', padding: 12, gap: 10, borderBottomWidth: 1 },
  legNumber: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
