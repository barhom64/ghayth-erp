/**
 * تفاصيل عملية الفحص
 * GET /api/properties/inspections/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface PropertyInspection {
  id: number;
  ref?: string;
  type?: string;
  unitName?: string;
  inspectorName?: string;
  status?: string;
  inspectionDate?: string;
  completedAt?: string;
  overallCondition?: string;
  score?: number;
  issues?: string;
  recommendations?: string;
  notes?: string;
}

const CONDITION_COLORS: Record<string, string> = {
  excellent: '#16A34A',
  good: '#22C55E',
  fair: '#F59E0B',
  poor: '#EF4444',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function PropertyInspectionDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: insp, isLoading } = useList<PropertyInspection>(`/api/properties/inspections/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الفحص…" />;
  if (!insp) return <GEmptyState icon="eye-outline" title="فحص غير موجود" description="تعذّر العثور على بيانات عملية الفحص" />;

  const st = statusBadge(insp.status ?? '');
  const conditionColor = CONDITION_COLORS[insp.overallCondition ?? ''] ?? c.text;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: insp.type ?? insp.ref ?? 'فحص العقار' }} />

      <View style={[styles.header, { backgroundColor: '#0284C7' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{insp.unitName ?? '—'}</Text>
          {insp.type ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{insp.type}</Text> : null}
          {insp.inspectorName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{insp.inspectorName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        {insp.score !== undefined ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '800', color: '#FFF' }}>{insp.score}</Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>النقاط</Text>
          </View>
        ) : (
          <Ionicons name="eye-outline" size={40} color="#FFFFFF88" />
        )}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {insp.overallCondition ? (
          <GCard style={{ alignItems: 'center', paddingVertical: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: conditionColor }}>{insp.overallCondition}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>الحالة العامة</Text>
          </GCard>
        ) : null}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المفتش', value: insp.inspectorName },
            { label: 'تاريخ الفحص', value: insp.inspectionDate ? fmtDate(insp.inspectionDate) : undefined },
            { label: 'تاريخ الإنجاز', value: insp.completedAt ? fmtDate(insp.completedAt) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {insp.issues ? (
          <GCard>
            <GText variant="caption" color="muted">المشاكل المرصودة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{insp.issues}</Text>
          </GCard>
        ) : null}

        {insp.recommendations ? (
          <GCard>
            <GText variant="caption" color="muted">التوصيات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{insp.recommendations}</Text>
          </GCard>
        ) : null}

        {insp.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{insp.notes}</Text>
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
