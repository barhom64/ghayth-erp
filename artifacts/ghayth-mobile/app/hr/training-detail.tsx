/**
 * تفاصيل برنامج التدريب
 * GET /api/hr/training/programs/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface TrainingProgram {
  id: number;
  ref?: string;
  title?: string;
  category?: string;
  provider?: string;
  instructor?: string;
  status?: string;
  trainingType?: string;
  startDate?: string;
  endDate?: string;
  duration?: number;
  durationUnit?: string;
  location?: string;
  cost?: number;
  currency?: string;
  maxParticipants?: number;
  currentParticipants?: number;
  description?: string;
  objectives?: string;
  targetAudience?: string;
  participants?: { id: number; name?: string; status?: string }[];
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

export default function TrainingDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: program, isLoading } = useList<TrainingProgram>(`/api/hr/training/programs/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات البرنامج…" />;
  if (!program) return <GEmptyState icon="school-outline" title="برنامج غير موجود" description="تعذّر العثور على بيانات برنامج التدريب" />;

  const ref = program.ref ?? `#${program.id}`;
  const st = statusBadge(program.status ?? '');
  const participants = program.participants ?? [];
  const fillPct = program.maxParticipants
    ? Math.round(((program.currentParticipants ?? participants.length) / program.maxParticipants) * 100)
    : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: program.title ?? 'البرنامج التدريبي' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{program.title ?? '—'}</Text>
          {program.provider ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{program.provider}</Text> : null}
          {program.category ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{program.category}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: c.onPrimary }}>{program.currentParticipants ?? participants.length}</Text>
          {program.maxParticipants ? <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>/ {program.maxParticipants} مشارك</Text> : null}
        </View>
      </View>

      {/* شريط الإشغال */}
      {program.maxParticipants ? (
        <View style={{ height: 6, backgroundColor: c.border }}>
          <View style={{ height: 6, width: `${fillPct}%`, backgroundColor: fillPct >= 90 ? '#EF4444' : '#22C55E' }} />
        </View>
      ) : null}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المدرب', value: program.instructor },
            { label: 'نوع التدريب', value: program.trainingType },
            { label: 'الموقع', value: program.location },
            { label: 'تاريخ البداية', value: program.startDate ? fmtDate(program.startDate) : undefined },
            { label: 'تاريخ الانتهاء', value: program.endDate ? fmtDate(program.endDate) : undefined },
            { label: 'المدة', value: program.duration ? `${program.duration} ${program.durationUnit ?? 'يوم'}` : undefined },
            { label: 'التكلفة', value: program.cost !== undefined ? fmtMoney(program.cost, program.currency) : undefined },
            { label: 'الجمهور المستهدف', value: program.targetAudience },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {program.objectives ? (
          <GCard>
            <GText variant="caption" color="muted">الأهداف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{program.objectives}</Text>
          </GCard>
        ) : null}

        {program.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{program.description}</Text>
          </GCard>
        ) : null}

        {participants.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">المشاركون ({participants.length})</GText>
            {participants.map((p, i) => {
              const ps = statusBadge(p.status ?? '');
              return (
                <View key={p.id ?? i} style={[{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }, i > 0 && { borderTopWidth: 1, borderTopColor: c.border }]}>
                  {ps ? <GStatusBadge status={ps.label} size="sm" /> : null}
                  <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{p.name ?? '—'}</Text>
                </View>
              );
            })}
          </GCard>
        )}

        <GButton title="تسجيل مشاركة موظف" icon="person-add-outline" variant="secondary" onPress={() => router.push({ pathname: '/hr/training-enrollment-new' as never, params: { trainingId: id } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
