/**
 * تفاصيل الالتزام
 * GET /api/obligations/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Obligation {
  id: number;
  ref?: string;
  title?: string;
  obligationType?: string;
  entityType?: string;
  entityName?: string;
  status?: string;
  amount?: number;
  currency?: string;
  dueAt?: string;
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

export default function ObligationDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: obl, isLoading } = useList<Obligation>(`/api/obligations/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الالتزام…" />;
  if (!obl) return <GEmptyState icon="checkmark-circle-outline" title="التزام غير موجود" description="تعذّر العثور على بيانات الالتزام" />;

  const st = statusBadge(obl.status ?? '');
  const dueDate = obl.dueAt ? new Date(obl.dueAt) : null;
  const overdue = dueDate && dueDate < new Date() && obl.status !== 'paid' && obl.status !== 'settled';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: obl.title ?? 'الالتزام' }} />

      <View style={[styles.header, { backgroundColor: overdue ? '#EF4444' : '#F97316' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{obl.title ?? '—'}</Text>
          {obl.obligationType ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{obl.obligationType}</Text> : null}
          {obl.entityName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{obl.entityName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(obl.amount, obl.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>المبلغ</Text>
        </View>
      </View>

      {overdue && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>تجاوز تاريخ الاستحقاق: {fmtDate(obl.dueAt)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'النوع', value: obl.obligationType },
            { label: 'الكيان', value: `${obl.entityType ?? ''} ${obl.entityName ?? ''}`.trim() || undefined },
            { label: 'تاريخ الاستحقاق', value: obl.dueAt ? fmtDate(obl.dueAt) : undefined },
            { label: 'تاريخ السداد', value: obl.paidAt ? fmtDate(obl.paidAt) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {obl.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{obl.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="التزام جديد" icon="add-circle-outline" variant="secondary" onPress={() => router.push('/finance/obligation-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
