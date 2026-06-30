/**
 * تفاصيل ملف التحصيل
 * GET /api/finance/collection/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface CollectionCase {
  id: number;
  ref?: string;
  clientName?: string;
  total?: number;
  paid?: number;
  remaining?: number;
  currency?: string;
  status?: string;
  currentStageName?: string;
  dueDate?: string;
  lastContactDate?: string;
  assigneeName?: string;
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

const STAGE_COLORS: Record<string, string> = {
  reminder: '#F59E0B',
  warning: '#F97316',
  legal: '#DC2626',
  settled: '#16A34A',
};

export default function CollectionDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: col, isLoading } = useList<CollectionCase>(`/api/finance/collection/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات التحصيل…" />;
  if (!col) return <GEmptyState icon="alert-circle-outline" title="ملف غير موجود" description="تعذّر العثور على بيانات ملف التحصيل" />;

  const st = statusBadge(col.status ?? '');
  const settled = col.status === 'settled' || col.status === 'closed';
  const total = col.total ?? 0;
  const paid = col.paid ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const headerColor = settled ? '#16A34A' : (STAGE_COLORS[col.currentStageName?.toLowerCase() ?? ''] ?? '#DC2626');

  const overdue = col.dueDate && new Date(col.dueDate) < new Date() && !settled;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: col.ref ?? 'ملف تحصيل' }} />

      <View style={[styles.header, { backgroundColor: headerColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{col.clientName ?? '—'}</Text>
          {col.currentStageName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{col.currentStageName}</Text> : null}
          {col.dueDate ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>استحقاق: {fmtDate(col.dueDate)}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(col.remaining ?? (total - paid), col.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>المتبقي</Text>
        </View>
      </View>

      {overdue && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>تجاوز موعد الاستحقاق: {fmtDate(col.dueDate)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4 }}>
          <View style={{ height: 8, width: `${pct}%`, backgroundColor: pct === 100 ? '#22C55E' : '#F97316', borderRadius: 4 }} />
        </View>

        <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
          <GCard style={{ flex: 1, alignItems: 'center' }}>
            <GText variant="caption" color="muted">المحصّل</GText>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#16A34A' }}>{fmtMoney(paid, col.currency)}</Text>
          </GCard>
          <GCard style={{ flex: 1, alignItems: 'center' }}>
            <GText variant="caption" color="muted">المتبقي</GText>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#EF4444' }}>{fmtMoney(col.remaining ?? (total - paid), col.currency)}</Text>
          </GCard>
        </View>

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'العميل', value: col.clientName },
            { label: 'مرحلة التحصيل', value: col.currentStageName },
            { label: 'المسؤول', value: col.assigneeName },
            { label: 'تاريخ الاستحقاق', value: col.dueDate ? fmtDate(col.dueDate) : undefined },
            { label: 'آخر تواصل', value: col.lastContactDate ? fmtDate(col.lastContactDate) : undefined },
            { label: 'إجمالي المطلوب', value: fmtMoney(total, col.currency) },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {col.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{col.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="متابعة التحصيل" icon="refresh-outline" variant="secondary" onPress={() => router.push('/finance/collection-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
