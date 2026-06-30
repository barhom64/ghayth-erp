/**
 * تفاصيل مخالفة العمرة
 * GET /api/umrah/violations/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface UmrahViolation {
  id: number;
  type?: string;
  mutamerName?: string;
  agentName?: string;
  penaltyAmount?: number;
  currency?: string;
  status?: string;
  detectedAt?: string;
  resolvedAt?: string;
  description?: string;
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

export default function UmrahViolationDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: viol, isLoading } = useList<UmrahViolation>(`/api/umrah/violations/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات المخالفة…" />;
  if (!viol) return <GEmptyState icon="warning-outline" title="مخالفة غير موجودة" description="تعذّر العثور على بيانات المخالفة" />;

  const st = statusBadge(viol.status ?? '');
  const resolved = viol.status === 'resolved' || viol.status === 'closed';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: viol.type ?? 'مخالفة عمرة' }} />

      <View style={[styles.header, { backgroundColor: resolved ? '#16A34A' : '#DC2626' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{viol.type ?? '—'}</Text>
          {viol.mutamerName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{viol.mutamerName}</Text> : null}
          {viol.agentName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{viol.agentName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        {viol.penaltyAmount !== undefined && (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(viol.penaltyAmount, viol.currency)}</Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>الغرامة</Text>
          </View>
        )}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المعتمر', value: viol.mutamerName },
            { label: 'الوكيل', value: viol.agentName },
            { label: 'تاريخ الرصد', value: viol.detectedAt ? fmtDate(viol.detectedAt) : undefined },
            { label: 'تاريخ الحل', value: viol.resolvedAt ? fmtDate(viol.resolvedAt) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {viol.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{viol.description}</Text>
          </GCard>
        ) : null}

        {viol.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{viol.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="مخالفة جديدة" icon="warning-outline" variant="secondary" onPress={() => router.push('/umrah/violation-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
