/**
 * تفاصيل الإجراء التصحيحي والوقائي (CAPA)
 * GET /api/governance/capa/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Capa {
  id: number;
  ref?: string;
  title?: string;
  type?: string;
  source?: string;
  sourceRef?: string;
  owner?: string;
  department?: string;
  status?: string;
  priority?: string;
  rootCause?: string;
  description?: string;
  correctiveAction?: string;
  preventiveAction?: string;
  targetDate?: string;
  completionDate?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  effectiveness?: string;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const PRIORITY_COLORS: Record<string, string> = {
  low: '#22C55E', medium: '#F59E0B', high: '#EF4444', critical: '#7C3AED',
};

export default function CapaDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: capa, isLoading } = useList<Capa>(`/api/governance/capa/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإجراء التصحيحي…" />;
  if (!capa) return <GEmptyState icon="construct-outline" title="إجراء غير موجود" description="تعذّر العثور على بيانات الإجراء التصحيحي" />;

  const ref = capa.ref ?? `#${capa.id}`;
  const st = statusBadge(capa.status ?? '');
  const priorityColor = PRIORITY_COLORS[(capa.priority ?? '').toLowerCase()] ?? c.brand;
  const isOverdue = capa.targetDate && !capa.completionDate && new Date(capa.targetDate) < new Date();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `إجراء ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{capa.title ?? '—'}</Text>
          {capa.type ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{capa.type}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {capa.priority ? (
              <View style={{ backgroundColor: priorityColor + '30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: priorityColor, fontWeight: '700' }}>{capa.priority}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="construct-outline" size={40} color={c.onPrimary + '80'} />
      </View>

      {/* تحذير التأخر */}
      {isOverdue && (
        <View style={{ backgroundColor: '#FEF2F2', borderBottomColor: '#FCA5A5', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#EF4444" />
          <Text style={{ fontSize: 13, color: '#EF4444', fontWeight: '600' }}>متأخر عن الموعد المحدد: {fmtDate(capa.targetDate)}</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'المالك', value: capa.owner },
            { label: 'القسم', value: capa.department },
            { label: 'المصدر', value: capa.source },
            { label: 'مرجع المصدر', value: capa.sourceRef },
            { label: 'تاريخ الاستهداف', value: capa.targetDate ? fmtDate(capa.targetDate) : undefined },
            { label: 'تاريخ الإكمال', value: capa.completionDate ? fmtDate(capa.completionDate) : undefined },
            { label: 'تحقق من قِبَل', value: capa.verifiedBy },
            { label: 'تاريخ التحقق', value: capa.verifiedAt ? fmtDate(capa.verifiedAt) : undefined },
            { label: 'الفعالية', value: capa.effectiveness },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {capa.rootCause ? (
          <GCard>
            <GText variant="caption" color="muted">السبب الجذري</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{capa.rootCause}</Text>
          </GCard>
        ) : null}

        {capa.correctiveAction ? (
          <GCard>
            <GText variant="caption" color="muted">الإجراء التصحيحي</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{capa.correctiveAction}</Text>
          </GCard>
        ) : null}

        {capa.preventiveAction ? (
          <GCard>
            <GText variant="caption" color="muted">الإجراء الوقائي</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{capa.preventiveAction}</Text>
          </GCard>
        ) : null}

        {capa.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{capa.notes}</Text>
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
