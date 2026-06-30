/**
 * تفاصيل التفويض
 * GET /api/hr/delegations/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Delegation {
  id: number;
  ref?: string;
  delegatorName?: string;
  delegatorId?: number;
  delegateeName?: string;
  delegateeId?: number;
  scope?: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  reason?: string;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function DelegationDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: del, isLoading } = useList<Delegation>(`/api/hr/delegations/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات التفويض…" />;
  if (!del) return <GEmptyState icon="swap-horizontal-outline" title="تفويض غير موجود" description="تعذّر العثور على بيانات التفويض" />;

  const st = statusBadge(del.status ?? '');
  const now = new Date();
  const toDate = del.toDate ? new Date(del.toDate) : null;
  const isActive = toDate && toDate >= now && del.status === 'active';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'التفويض' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#6366F1' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 14, color: '#FFFFFFCC', textAlign: 'right' }}>من</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{del.delegatorName ?? '—'}</Text>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 6, marginVertical: 4 }}>
            <Ionicons name="arrow-back-outline" size={16} color="#FFFFFFAA" />
          </View>
          <Text style={{ fontSize: 14, color: '#FFFFFFCC', textAlign: 'right' }}>إلى</Text>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{del.delegateeName ?? '—'}</Text>
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        {isActive ? (
          <View style={{ alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={32} color="#22C55E" />
            <Text style={{ fontSize: 11, color: '#FFFFFFAA', marginTop: 4 }}>نشط</Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المفوَّض', value: del.delegatorName },
            { label: 'المفوَّض إليه', value: del.delegateeName },
            { label: 'نطاق التفويض', value: del.scope },
            { label: 'من تاريخ', value: del.fromDate ? fmtDate(del.fromDate) : undefined },
            { label: 'إلى تاريخ', value: del.toDate ? fmtDate(del.toDate) : undefined },
            { label: 'السبب', value: del.reason },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {del.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{del.notes}</Text>
          </GCard>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
