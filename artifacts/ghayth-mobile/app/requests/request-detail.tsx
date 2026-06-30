/**
 * تفاصيل الطلب
 * GET /api/requests/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Request {
  id: number;
  ref?: string;
  title?: string;
  type?: string;
  priority?: string;
  status?: string;
  requesterName?: string;
  assigneeName?: string;
  createdAt?: string;
  dueDate?: string;
  description?: string;
  notes?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: '#22C55E',
  medium: '#F59E0B',
  high: '#EF4444',
  critical: '#7C3AED',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  critical: 'حرجة',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function RequestDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: req, isLoading } = useList<Request>(`/api/requests/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الطلب…" />;
  if (!req) return <GEmptyState icon="file-tray-full-outline" title="طلب غير موجود" description="تعذّر العثور على بيانات الطلب" />;

  const st = statusBadge(req.status ?? '');
  const priorityColor = PRIORITY_COLORS[req.priority ?? ''] ?? c.brand;
  const priorityLabel = PRIORITY_LABELS[req.priority ?? ''] ?? req.priority ?? '';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: req.ref ?? 'الطلب' }} />

      <View style={[styles.header, { backgroundColor: priorityColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{req.title ?? '—'}</Text>
          {req.type ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{req.type}</Text> : null}
          {req.requesterName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{req.requesterName}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {priorityLabel ? (
              <View style={{ backgroundColor: '#FFFFFF30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: '#FFF' }}>{priorityLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'مقدّم الطلب', value: req.requesterName },
            { label: 'المسؤول', value: req.assigneeName },
            { label: 'النوع', value: req.type },
            { label: 'تاريخ الطلب', value: req.createdAt ? fmtDate(req.createdAt) : undefined },
            { label: 'تاريخ الاستحقاق', value: req.dueDate ? fmtDate(req.dueDate) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {req.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{req.description}</Text>
          </GCard>
        ) : null}

        {req.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{req.notes}</Text>
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
