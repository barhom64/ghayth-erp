/**
 * تفاصيل المخالفة المرورية
 * GET /api/fleet/traffic-violations/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface TrafficViolation {
  id: number;
  ref?: string;
  violationNumber?: string;
  violationType?: string;
  vehiclePlate?: string;
  driverName?: string;
  status?: string;
  fineAmount?: number;
  currency?: string;
  violationDate?: string;
  location?: string;
  paidAt?: string;
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

export default function FleetViolationDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: viol, isLoading } = useList<TrafficViolation>(`/api/fleet/traffic-violations/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات المخالفة…" />;
  if (!viol) return <GEmptyState icon="warning-outline" title="مخالفة غير موجودة" description="تعذّر العثور على بيانات المخالفة" />;

  const st = statusBadge(viol.status ?? '');
  const isPaid = viol.status === 'paid';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: viol.violationNumber ?? 'مخالفة مرورية' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: isPaid ? '#059669' : '#EF4444' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{viol.violationType ?? '—'}</Text>
          {viol.vehiclePlate ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{viol.vehiclePlate}</Text> : null}
          {viol.driverName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{viol.driverName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFF' }}>{fmtMoney(viol.fineAmount, viol.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>الغرامة</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'رقم المخالفة', value: viol.violationNumber },
            { label: 'نوع المخالفة', value: viol.violationType },
            { label: 'تاريخ المخالفة', value: viol.violationDate ? fmtDate(viol.violationDate) : undefined },
            { label: 'الموقع', value: viol.location },
            { label: 'تاريخ السداد', value: viol.paidAt ? fmtDate(viol.paidAt) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {viol.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{viol.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="مخالفة جديدة" icon="warning-outline" variant="secondary" onPress={() => router.push('/fleet/violation-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
