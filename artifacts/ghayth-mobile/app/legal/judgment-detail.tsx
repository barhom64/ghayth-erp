/**
 * تفاصيل الحكم القضائي
 * GET /api/legal/judgments/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Judgment {
  id: number;
  ref?: string;
  caseRef?: string;
  caseTitle?: string;
  court?: string;
  judgmentType?: string;
  judgmentDate?: string;
  status?: string;
  outcome?: string;
  awardedAmount?: number;
  currency?: string;
  responsibleLawyer?: string;
  summary?: string;
  details?: string;
  appealDeadline?: string;
  appealStatus?: string;
  enforcementStatus?: string;
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

const OUTCOME_COLORS: Record<string, string> = {
  favorable: '#22C55E', unfavorable: '#EF4444', partial: '#F59E0B', settled: '#3B82F6',
};

export default function JudgmentDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: judgment, isLoading } = useList<Judgment>(`/api/legal/judgments/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الحكم…" />;
  if (!judgment) return <GEmptyState icon="hammer-outline" title="حكم غير موجود" description="تعذّر العثور على بيانات الحكم القضائي" />;

  const ref = judgment.ref ?? `#${judgment.id}`;
  const st = statusBadge(judgment.status ?? '');
  const outcomeColor = OUTCOME_COLORS[(judgment.outcome ?? '').toLowerCase()] ?? c.brand;
  const appealDeadlineNear = judgment.appealDeadline && new Date(judgment.appealDeadline) < new Date(Date.now() + 14 * 24 * 3600 * 1000);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `حكم ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{judgment.caseTitle ?? '—'}</Text>
          {judgment.court ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{judgment.court}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {judgment.outcome ? (
              <View style={{ backgroundColor: outcomeColor + '30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: outcomeColor, fontWeight: '700' }}>{judgment.outcome}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {judgment.awardedAmount !== undefined ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(judgment.awardedAmount, judgment.currency)}</Text>
            <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>المبلغ المحكوم به</Text>
          </View>
        ) : <Ionicons name="hammer-outline" size={40} color={c.onPrimary + '80'} />}
      </View>

      {/* تحذير موعد الطعن */}
      {appealDeadlineNear && !judgment.appealStatus && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>موعد الطعن يقترب: {fmtDate(judgment.appealDeadline)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'رقم القضية', value: judgment.caseRef },
            { label: 'نوع الحكم', value: judgment.judgmentType },
            { label: 'المحامي المسؤول', value: judgment.responsibleLawyer },
            { label: 'تاريخ الحكم', value: judgment.judgmentDate ? fmtDate(judgment.judgmentDate) : undefined },
            { label: 'موعد الطعن', value: judgment.appealDeadline ? fmtDate(judgment.appealDeadline) : undefined },
            { label: 'حالة الطعن', value: judgment.appealStatus },
            { label: 'حالة التنفيذ', value: judgment.enforcementStatus },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 150, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {judgment.summary ? (
          <GCard>
            <GText variant="caption" color="muted">ملخص الحكم</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{judgment.summary}</Text>
          </GCard>
        ) : null}

        {judgment.details ? (
          <GCard>
            <GText variant="caption" color="muted">تفاصيل الحكم</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{judgment.details}</Text>
          </GCard>
        ) : null}

        {judgment.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{judgment.notes}</Text>
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
