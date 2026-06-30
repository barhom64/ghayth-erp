/**
 * تفاصيل النشاط والمتابعة
 * GET /api/crm/activities/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Activity {
  id: number;
  title?: string;
  subject?: string;
  activityType?: string;
  relatedName?: string;
  assigneeName?: string;
  status?: string;
  dueDate?: string;
  completedAt?: string;
  createdAt?: string;
  description?: string;
  outcome?: string;
  notes?: string;
}

const TYPE_ICONS: Record<string, string> = {
  call: 'call-outline',
  email: 'mail-outline',
  meeting: 'people-outline',
  task: 'checkmark-circle-outline',
  visit: 'location-outline',
  demo: 'desktop-outline',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function ActivityDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: act, isLoading } = useList<Activity>(`/api/crm/activities/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات النشاط…" />;
  if (!act) return <GEmptyState icon="checkmark-circle-outline" title="نشاط غير موجود" description="تعذّر العثور على بيانات النشاط" />;

  const st = statusBadge(act.status ?? '');
  const dueDate = act.dueDate ? new Date(act.dueDate) : null;
  const overdue = dueDate && dueDate < new Date() && act.status !== 'completed' && act.status !== 'done';
  const iconName = (TYPE_ICONS[act.activityType ?? ''] ?? 'ellipse-outline') as never;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: act.title ?? act.subject ?? 'النشاط' }} />

      <View style={[styles.header, { backgroundColor: overdue ? '#EF4444' : '#8B5CF6' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{act.title ?? act.subject ?? '—'}</Text>
          {act.activityType ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{act.activityType}</Text> : null}
          {act.relatedName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{act.relatedName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={iconName} size={36} color="#FFF" />
        </View>
      </View>

      {overdue && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>تجاوز الموعد: {fmtDate(act.dueDate)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المسؤول', value: act.assigneeName },
            { label: 'مرتبط بـ', value: act.relatedName },
            { label: 'تاريخ الاستحقاق', value: act.dueDate ? fmtDate(act.dueDate) : undefined },
            { label: 'تاريخ الإنجاز', value: act.completedAt ? fmtDate(act.completedAt) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {act.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{act.description}</Text>
          </GCard>
        ) : null}

        {act.outcome ? (
          <GCard>
            <GText variant="caption" color="muted">النتيجة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{act.outcome}</Text>
          </GCard>
        ) : null}

        {act.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{act.notes}</Text>
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
