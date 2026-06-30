/**
 * تفاصيل العهدة
 * GET /api/finance/custodies/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Custody {
  id: number;
  ref?: string;
  employeeName?: string;
  description?: string;
  amount?: number;
  spentAmount?: number;
  returnedAmount?: number;
  remainingAmount?: number;
  currency?: string;
  status?: string;
  date?: string;
  settledAt?: string;
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

export default function CustodyDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: custody, isLoading } = useList<Custody>(`/api/finance/custodies/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات العهدة…" />;
  if (!custody) return <GEmptyState icon="briefcase-outline" title="عهدة غير موجودة" description="تعذّر العثور على بيانات العهدة" />;

  const st = statusBadge(custody.status ?? '');
  const spentPct = custody.amount && custody.spentAmount !== undefined ? Math.min(100, Math.round((custody.spentAmount / custody.amount) * 100)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: custody.ref ?? 'العهدة' }} />

      <View style={[styles.header, { backgroundColor: '#7C3AED' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{custody.employeeName ?? '—'}</Text>
          {custody.description ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{custody.description}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(custody.amount, custody.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>إجمالي العهدة</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {custody.spentAmount !== undefined && (
            <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#EF4444' }}>{fmtMoney(custody.spentAmount, custody.currency)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المصروف</Text>
            </GCard>
          )}
          {custody.remainingAmount !== undefined && (
            <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#22C55E' }}>{fmtMoney(custody.remainingAmount, custody.currency)}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المتبقي</Text>
            </GCard>
          )}
        </View>

        {custody.amount && custody.spentAmount !== undefined ? (
          <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3 }}>
            <View style={{ height: 6, width: `${spentPct}%`, backgroundColor: spentPct >= 90 ? '#EF4444' : '#7C3AED', borderRadius: 3 }} />
          </View>
        ) : null}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الموظف', value: custody.employeeName },
            { label: 'تاريخ العهدة', value: custody.date ? fmtDate(custody.date) : undefined },
            { label: 'تاريخ التسوية', value: custody.settledAt ? fmtDate(custody.settledAt) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {custody.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{custody.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="عهدة جديدة" icon="briefcase-outline" variant="secondary" onPress={() => router.push('/finance/custody-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
