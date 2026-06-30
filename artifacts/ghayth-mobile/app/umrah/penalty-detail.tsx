/**
 * تفاصيل الغرامة
 * GET /api/umrah/penalties/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface UmrahPenalty {
  id: number;
  type?: string;
  pilgrimName?: string;
  agentName?: string;
  amount?: number;
  currency?: string;
  status?: string;
  createdAt?: string;
  paidAt?: string;
  reason?: string;
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

export default function UmrahPenaltyDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: pen, isLoading } = useList<UmrahPenalty>(`/api/umrah/penalties/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الغرامة…" />;
  if (!pen) return <GEmptyState icon="alert-circle-outline" title="غرامة غير موجودة" description="تعذّر العثور على بيانات الغرامة" />;

  const st = statusBadge(pen.status ?? '');
  const paid = pen.status === 'paid' || !!pen.paidAt;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: pen.type ?? 'غرامة' }} />

      <View style={[styles.header, { backgroundColor: paid ? '#16A34A' : '#F59E0B' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{pen.type ?? '—'}</Text>
          {pen.pilgrimName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{pen.pilgrimName}</Text> : null}
          {pen.agentName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{pen.agentName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(pen.amount, pen.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>قيمة الغرامة</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الحاج / المعتمر', value: pen.pilgrimName },
            { label: 'الوكيل', value: pen.agentName },
            { label: 'تاريخ الإصدار', value: pen.createdAt ? fmtDate(pen.createdAt) : undefined },
            { label: 'تاريخ السداد', value: pen.paidAt ? fmtDate(pen.paidAt) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {pen.reason ? (
          <GCard>
            <GText variant="caption" color="muted">السبب</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{pen.reason}</Text>
          </GCard>
        ) : null}

        {pen.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{pen.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="غرامة جديدة" icon="warning-outline" variant="secondary" onPress={() => router.push('/umrah/penalty-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
