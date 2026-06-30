/**
 * تفاصيل مشكلة / عائق المشروع
 * GET /api/projects/issues/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface ProjectIssue {
  id: number;
  title?: string;
  description?: string;
  projectName?: string;
  assigneeName?: string;
  priority?: string;
  status?: string;
  createdAt?: string;
  resolvedAt?: string;
  impact?: string;
  resolution?: string;
  notes?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#DC2626',
  high: '#F97316',
  medium: '#F59E0B',
  low: '#22C55E',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function ProjectIssueDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: issue, isLoading } = useList<ProjectIssue>(`/api/projects/issues/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات المشكلة…" />;
  if (!issue) return <GEmptyState icon="bug-outline" title="مشكلة غير موجودة" description="تعذّر العثور على بيانات المشكلة" />;

  const st = statusBadge(issue.status ?? '');
  const headerColor = PRIORITY_COLORS[issue.priority ?? ''] ?? '#6B7280';
  const resolved = issue.status === 'resolved' || issue.status === 'closed';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: issue.title ?? 'المشكلة' }} />

      <View style={[styles.header, { backgroundColor: resolved ? '#16A34A' : headerColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{issue.title ?? '—'}</Text>
          {issue.projectName ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{issue.projectName}</Text> : null}
          {issue.priority ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>أولوية: {issue.priority}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={resolved ? 'checkmark-circle' : 'bug-outline'} size={36} color="#FFF" />
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المشروع', value: issue.projectName },
            { label: 'المسؤول', value: issue.assigneeName },
            { label: 'تاريخ الرصد', value: issue.createdAt ? fmtDate(issue.createdAt) : undefined },
            { label: 'تاريخ الحل', value: issue.resolvedAt ? fmtDate(issue.resolvedAt) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {issue.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{issue.description}</Text>
          </GCard>
        ) : null}

        {issue.impact ? (
          <GCard>
            <GText variant="caption" color="muted">الأثر</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{issue.impact}</Text>
          </GCard>
        ) : null}

        {issue.resolution ? (
          <GCard>
            <GText variant="caption" color="muted">الحل المُطبَّق</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{issue.resolution}</Text>
          </GCard>
        ) : null}

        {issue.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{issue.notes}</Text>
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
