/**
 * تفاصيل معلم المشروع
 * GET /api/projects/milestones/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Milestone {
  id: number;
  name?: string;
  title?: string;
  projectName?: string;
  status?: string;
  dueDate?: string;
  completedAt?: string;
  amount?: number;
  currency?: string;
  completionPct?: number;
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

export default function MilestoneDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: ms, isLoading } = useList<Milestone>(`/api/projects/milestones/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات المعلم…" />;
  if (!ms) return <GEmptyState icon="flag-outline" title="معلم غير موجود" description="تعذّر العثور على بيانات معلم المشروع" />;

  const st = statusBadge(ms.status ?? '');
  const dueDate = ms.dueDate ? new Date(ms.dueDate) : null;
  const overdue = dueDate && dueDate < new Date() && ms.status !== 'completed' && ms.status !== 'done';
  const pct = ms.completionPct ?? (ms.status === 'completed' ? 100 : 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: ms.name ?? ms.title ?? 'المعلم' }} />

      <View style={[styles.header, { backgroundColor: overdue ? '#EF4444' : '#0284C7' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{ms.name ?? ms.title ?? '—'}</Text>
          {ms.projectName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{ms.projectName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFF' }}>{pct}%</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>الإنجاز</Text>
        </View>
      </View>

      {overdue && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>تجاوز الموعد: {fmtDate(ms.dueDate)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ height: 8, backgroundColor: c.border, borderRadius: 4 }}>
          <View style={{ height: 8, width: `${pct}%`, backgroundColor: pct === 100 ? '#22C55E' : '#0284C7', borderRadius: 4 }} />
        </View>

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المشروع', value: ms.projectName },
            { label: 'تاريخ الاستحقاق', value: ms.dueDate ? fmtDate(ms.dueDate) : undefined },
            { label: 'تاريخ الإنجاز', value: ms.completedAt ? fmtDate(ms.completedAt) : undefined },
            { label: 'القيمة', value: ms.amount !== undefined ? fmtMoney(ms.amount, ms.currency) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {ms.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{ms.description}</Text>
          </GCard>
        ) : null}

        {ms.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{ms.notes}</Text>
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
