/**
 * تفاصيل المخالفة / الإجراء التأديبي
 * GET /api/hr/violations/:id
 * POST /api/hr/violations/:id/approve
 * POST /api/hr/violations/:id/reject
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Violation {
  id: number;
  ref?: string;
  employeeName?: string;
  employeeId?: number;
  violationType?: string;
  typeLabel?: string;
  severity?: string;
  description?: string;
  incidentDate?: string;
  reportedAt?: string;
  status?: string;
  penaltyType?: string;
  penaltyAmount?: number;
  penaltyDays?: number;
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  reportedByName?: string;
  attachments?: { id: number; name?: string; url?: string }[];
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const SEVERITY_COLOR: Record<string, string> = {
  minor: '#F59E0B',
  moderate: '#F97316',
  major: '#EF4444',
  critical: '#7C3AED',
};

const SEVERITY_LABEL: Record<string, string> = {
  minor: 'بسيطة',
  moderate: 'متوسطة',
  major: 'جسيمة',
  critical: 'بالغة الجسامة',
};

export default function ViolationDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);

  const { data: violation, isLoading, refetch } = useList<Violation>(`/api/hr/violations/${id}`);

  const doAction = async (action: string, label: string) => {
    Alert.alert(label, `هل تريد ${label}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/hr/violations/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch {
          Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل المخالفة…" />;
  if (!violation) return <GEmptyState icon="warning-outline" title="مخالفة غير موجودة" description="تعذّر العثور على بيانات المخالفة" />;

  const ref = violation.ref ?? `#${violation.id}`;
  const st = statusBadge(violation.status ?? '');
  const severityColor = SEVERITY_COLOR[violation.severity ?? ''] ?? c.textMuted;
  const severityLabel = SEVERITY_LABEL[violation.severity ?? ''] ?? violation.severity;
  const isPending = violation.status === 'pending' || violation.status === 'draft';
  const attachments = violation.attachments ?? [];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `مخالفة ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: severityColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{violation.employeeName ?? '—'}</Text>
          <Text style={{ fontSize: 14, color: '#FFFFFFCC', textAlign: 'right', marginTop: 2 }}>{violation.typeLabel ?? violation.violationType ?? '—'}</Text>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {severityLabel ? (
              <View style={{ backgroundColor: '#FFFFFF30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: '#FFF', fontWeight: '700' }}>{severityLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="warning" size={40} color="#FFFFFF80" />
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        {/* التفاصيل */}
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'تاريخ الحادثة', value: fmtDate(violation.incidentDate) },
            { label: 'تاريخ الإبلاغ', value: fmtDate(violation.reportedAt) },
            { label: 'أبلغ عنها', value: violation.reportedByName },
            { label: 'نوع العقوبة', value: violation.penaltyType },
            { label: 'الخصم المالي', value: violation.penaltyAmount ? `${violation.penaltyAmount} ر.س` : undefined },
            { label: 'أيام الخصم', value: violation.penaltyDays ? `${violation.penaltyDays} يوم` : undefined },
            { label: 'معتمد من', value: violation.approvedBy },
            { label: 'تاريخ الاعتماد', value: violation.approvedAt ? fmtDate(violation.approvedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {/* وصف المخالفة */}
        {violation.description ? (
          <GCard>
            <GText variant="caption" color="muted">وصف المخالفة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{violation.description}</Text>
          </GCard>
        ) : null}

        {/* ملاحظات */}
        {violation.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{violation.notes}</Text>
          </GCard>
        ) : null}

        {/* المرفقات */}
        {attachments.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">المرفقات</GText>
            {attachments.map(att => (
              <View key={att.id} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <Ionicons name="attach-outline" size={16} color={c.textMuted} />
                <Text style={{ fontSize: 13, color: c.brand }}>{att.name ?? `مرفق ${att.id}`}</Text>
              </View>
            ))}
          </GCard>
        )}

        {/* إجراءات */}
        {isPending && (
          <View style={{ gap: 10 }}>
            <GButton title="اعتماد الإجراء التأديبي" onPress={() => doAction('approve', 'اعتماد الإجراء التأديبي')} loading={acting} />
            <GButton title="رفض المخالفة" variant="secondary" onPress={() => doAction('reject', 'رفض المخالفة')} loading={acting} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
