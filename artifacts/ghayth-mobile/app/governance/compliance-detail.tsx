/**
 * تفاصيل بند الامتثال
 * GET /api/governance/compliance/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface ComplianceItem {
  id: number;
  ref?: string;
  title?: string;
  regulation?: string;
  framework?: string;
  category?: string;
  status?: string;
  responsiblePerson?: string;
  dueDate?: string;
  nextReviewDate?: string;
  description?: string;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function ComplianceDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: item, isLoading } = useList<ComplianceItem>(`/api/governance/compliance/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الامتثال…" />;
  if (!item) return <GEmptyState icon="shield-checkmark-outline" title="بند غير موجود" description="تعذّر العثور على بيانات بند الامتثال" />;

  const st = statusBadge(item.status ?? '');
  const dueDate = item.dueDate ? new Date(item.dueDate) : null;
  const overdue = dueDate && dueDate < new Date() && item.status !== 'compliant';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: item.title ?? 'بند الامتثال' }} />

      <View style={[styles.header, { backgroundColor: overdue ? '#EF4444' : '#059669' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{item.title ?? item.regulation ?? '—'}</Text>
          {item.framework ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{item.framework}</Text> : null}
          {item.category ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{item.category}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
      </View>

      {overdue && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>تجاوز تاريخ الاستحقاق: {fmtDate(item.dueDate)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'اللائحة / النظام', value: item.regulation },
            { label: 'الإطار التنظيمي', value: item.framework },
            { label: 'الفئة', value: item.category },
            { label: 'المسؤول', value: item.responsiblePerson },
            { label: 'تاريخ الاستحقاق', value: item.dueDate ? fmtDate(item.dueDate) : undefined },
            { label: 'المراجعة القادمة', value: item.nextReviewDate ? fmtDate(item.nextReviewDate) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {item.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{item.description}</Text>
          </GCard>
        ) : null}

        {item.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{item.notes}</Text>
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
