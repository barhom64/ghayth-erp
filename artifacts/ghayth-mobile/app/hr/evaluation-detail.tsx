/**
 * تفاصيل تقييم الأداء
 * GET /api/hr/evaluations/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Evaluation {
  id: number;
  ref?: string;
  employeeName?: string;
  employeeNumber?: string;
  employeeId?: number;
  evaluatorName?: string;
  period?: string;
  evaluationType?: string;
  status?: string;
  overallScore?: number;
  maxScore?: number;
  grade?: string;
  department?: string;
  jobTitle?: string;
  evaluationDate?: string;
  criteria?: EvalCriteria[];
  strengths?: string;
  areasForImprovement?: string;
  developmentPlan?: string;
  comments?: string;
}

interface EvalCriteria {
  id?: number;
  title?: string;
  weight?: number;
  score?: number;
  maxScore?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function scoreColor(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.9) return '#22C55E';
  if (pct >= 0.7) return '#3B82F6';
  if (pct >= 0.5) return '#F59E0B';
  return '#EF4444';
}

export default function EvaluationDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: evaluation, isLoading } = useList<Evaluation>(`/api/hr/evaluations/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات التقييم…" />;
  if (!evaluation) return <GEmptyState icon="star-outline" title="تقييم غير موجود" description="تعذّر العثور على بيانات التقييم" />;

  const ref = evaluation.ref ?? `#${evaluation.id}`;
  const st = statusBadge(evaluation.status ?? '');
  const criteria = evaluation.criteria ?? [];
  const maxScore = evaluation.maxScore ?? 100;
  const overallScore = evaluation.overallScore ?? 0;
  const pct = Math.round((overallScore / maxScore) * 100);
  const sc = scoreColor(overallScore, maxScore);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `تقييم ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: sc }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{evaluation.employeeName ?? '—'}</Text>
          {evaluation.jobTitle ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{evaluation.jobTitle}</Text> : null}
          {evaluation.period ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{evaluation.period}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {evaluation.grade ? (
              <View style={{ backgroundColor: '#FFFFFF30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFF' }}>{evaluation.grade}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 32, fontWeight: '800', color: '#FFF' }}>{pct}%</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>{overallScore}/{maxScore}</Text>
        </View>
      </View>

      {/* شريط التقدم */}
      <View style={{ height: 6, backgroundColor: c.border }}>
        <View style={{ height: 6, width: `${pct}%`, backgroundColor: sc }} />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المقيِّم', value: evaluation.evaluatorName },
            { label: 'القسم', value: evaluation.department },
            { label: 'نوع التقييم', value: evaluation.evaluationType },
            { label: 'تاريخ التقييم', value: evaluation.evaluationDate ? fmtDate(evaluation.evaluationDate) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {criteria.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">معايير التقييم</GText>
            {criteria.map((cr, i) => {
              const crMax = cr.maxScore ?? 10;
              const crScore = cr.score ?? 0;
              const crPct = Math.round((crScore / crMax) * 100);
              const crColor = scoreColor(crScore, crMax);
              return (
                <View key={cr.id ?? i} style={[{ paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: crColor, fontWeight: '700' }}>{crScore}/{crMax}</Text>
                    <Text style={{ fontSize: 13, color: c.text, fontWeight: '600', textAlign: 'right' }}>{cr.title ?? '—'}</Text>
                  </View>
                  <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2 }}>
                    <View style={{ height: 4, width: `${crPct}%`, backgroundColor: crColor, borderRadius: 2 }} />
                  </View>
                </View>
              );
            })}
          </GCard>
        )}

        {evaluation.strengths ? (
          <GCard>
            <GText variant="caption" color="muted">نقاط القوة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{evaluation.strengths}</Text>
          </GCard>
        ) : null}

        {evaluation.areasForImprovement ? (
          <GCard>
            <GText variant="caption" color="muted">مجالات التحسين</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{evaluation.areasForImprovement}</Text>
          </GCard>
        ) : null}

        {evaluation.developmentPlan ? (
          <GCard>
            <GText variant="caption" color="muted">خطة التطوير</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{evaluation.developmentPlan}</Text>
          </GCard>
        ) : null}

        <GButton title="تقييم جديد" icon="star-outline" variant="secondary" onPress={() => router.push({ pathname: '/hr/evaluation-new' as never, params: { employeeId: String(evaluation?.employeeId ?? '') } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
