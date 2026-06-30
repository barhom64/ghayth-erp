/**
 * تفاصيل أمر الإرسال
 * GET /api/transport/dispatch-orders/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface DispatchOrder {
  id: number;
  ref?: string;
  vehiclePlate?: string;
  driverName?: string;
  origin?: string;
  destination?: string;
  status?: string;
  scheduledAt?: string;
  dispatchedAt?: string;
  arrivedAt?: string;
  cargoDescription?: string;
  weight?: number;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  dispatched: '#0284C7',
  arrived: '#16A34A',
  completed: '#16A34A',
  cancelled: '#DC2626',
};

export default function TransportDispatchDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: dispatch, isLoading } = useList<DispatchOrder>(`/api/transport/dispatch-orders/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الإرسال…" />;
  if (!dispatch) return <GEmptyState icon="compass-outline" title="أمر غير موجود" description="تعذّر العثور على بيانات أمر الإرسال" />;

  const st = statusBadge(dispatch.status ?? '');
  const headerColor = STATUS_COLORS[dispatch.status ?? ''] ?? '#6B7280';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: dispatch.ref ?? 'أمر إرسال' }} />

      <View style={[styles.header, { backgroundColor: headerColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{dispatch.vehiclePlate ?? '—'}</Text>
          {dispatch.driverName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{dispatch.driverName}</Text> : null}
          {(dispatch.origin && dispatch.destination) ? (
            <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{dispatch.origin} ← {dispatch.destination}</Text>
          ) : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <Ionicons name="navigate-outline" size={36} color="#FFF" />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المركبة', value: dispatch.vehiclePlate },
            { label: 'السائق', value: dispatch.driverName },
            { label: 'نقطة الانطلاق', value: dispatch.origin },
            { label: 'الوجهة', value: dispatch.destination },
            { label: 'موعد الإرسال', value: dispatch.scheduledAt ? fmtDate(dispatch.scheduledAt) : undefined },
            { label: 'وقت الإرسال الفعلي', value: dispatch.dispatchedAt ? fmtDate(dispatch.dispatchedAt) : undefined },
            { label: 'وقت الوصول', value: dispatch.arrivedAt ? fmtDate(dispatch.arrivedAt) : undefined },
            { label: 'وزن الحمولة (كغ)', value: dispatch.weight !== undefined ? String(dispatch.weight) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {dispatch.cargoDescription ? (
          <GCard>
            <GText variant="caption" color="muted">وصف الحمولة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{dispatch.cargoDescription}</Text>
          </GCard>
        ) : null}

        {dispatch.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{dispatch.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="بدء رحلة جديدة" icon="compass-outline" variant="secondary" onPress={() => router.push('/fleet/trip-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
