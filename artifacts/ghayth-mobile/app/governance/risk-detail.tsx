/**
 * تفاصيل المخاطر
 * GET /api/governance/risks/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GButton, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Risk {
  id: number;
  ref?: string;
  title?: string;
  description?: string;
  category?: string;
  owner?: string;
  department?: string;
  status?: string;
  likelihood?: string;
  impact?: string;
  riskLevel?: string;
  riskScore?: number;
  inherentRisk?: string;
  residualRisk?: string;
  mitigationPlan?: string;
  contingencyPlan?: string;
  treatmentStrategy?: string;
  reviewDate?: string;
  identifiedAt?: string;
  controls?: { id: number; title?: string; type?: string; status?: string }[];
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const RISK_COLORS: Record<string, string> = {
  low: '#22C55E', medium: '#F59E0B', high: '#EF4444', critical: '#7C3AED',
  منخفض: '#22C55E', متوسط: '#F59E0B', عالٍ: '#EF4444', حرج: '#7C3AED',
};

export default function RiskDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: risk, isLoading } = useList<Risk>(`/api/governance/risks/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الخطر…" />;
  if (!risk) return <GEmptyState icon="alert-circle-outline" title="خطر غير موجود" description="تعذّر العثور على بيانات الخطر" />;

  const ref = risk.ref ?? `#${risk.id}`;
  const st = statusBadge(risk.status ?? '');
  const riskLevel = (risk.riskLevel ?? risk.inherentRisk ?? '').toLowerCase();
  const riskColor = RISK_COLORS[riskLevel] ?? '#F59E0B';
  const controls = risk.controls ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `خطر ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: riskColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{risk.title ?? '—'}</Text>
          {risk.category ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{risk.category}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {risk.riskLevel ? (
              <View style={{ backgroundColor: '#FFFFFF30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: '#FFF', fontWeight: '600' }}>مستوى: {risk.riskLevel}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {risk.riskScore !== undefined ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 32, fontWeight: '800', color: '#FFF' }}>{risk.riskScore}</Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>درجة الخطر</Text>
          </View>
        ) : <Ionicons name="alert-circle-outline" size={40} color="#FFFFFF80" />}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {/* بيانات الخطر */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المالك', value: risk.owner },
            { label: 'القسم', value: risk.department },
            { label: 'الاحتمالية', value: risk.likelihood },
            { label: 'الأثر', value: risk.impact },
            { label: 'الخطر الكامن', value: risk.inherentRisk },
            { label: 'الخطر المتبقي', value: risk.residualRisk },
            { label: 'استراتيجية المعالجة', value: risk.treatmentStrategy },
            { label: 'تاريخ المراجعة', value: risk.reviewDate ? fmtDate(risk.reviewDate) : undefined },
            { label: 'تاريخ التعرف', value: risk.identifiedAt ? fmtDate(risk.identifiedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {risk.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{risk.description}</Text>
          </GCard>
        ) : null}

        {risk.mitigationPlan ? (
          <GCard>
            <GText variant="caption" color="muted">خطة التخفيف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{risk.mitigationPlan}</Text>
          </GCard>
        ) : null}

        {risk.contingencyPlan ? (
          <GCard>
            <GText variant="caption" color="muted">خطة الطوارئ</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{risk.contingencyPlan}</Text>
          </GCard>
        ) : null}

        {controls.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">الضوابط ({controls.length})</GText>
            {controls.map((ctrl, i) => (
              <View key={ctrl.id ?? i} style={[{ paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{ctrl.type ?? '—'}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right' }}>{ctrl.title ?? '—'}</Text>
                </View>
              </View>
            ))}
          </GCard>
        )}
        <GButton
          title="إجراء تصحيحي (CAPA)"
          icon="build-outline"
          variant="secondary"
          onPress={() => router.push({ pathname: '/governance/capa-new' as never, params: { riskId: id } })}
          style={{ marginTop: 4 }}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
