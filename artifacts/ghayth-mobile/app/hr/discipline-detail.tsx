/**
 * تفاصيل المذكرة التأديبية
 * GET /api/hr/discipline/memos/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { statusBadge } from '@/lib/moduleSections';
import { useQueryClient } from '@tanstack/react-query';

interface DisciplineMemo {
  id: number;
  ref?: string;
  employeeName?: string;
  employeeNumber?: string;
  employeeId?: number;
  department?: string;
  violationType?: string;
  severity?: string;
  status?: string;
  incidentDate?: string;
  issuedDate?: string;
  description?: string;
  penaltyType?: string;
  penaltyAmount?: number;
  currency?: string;
  deductionDays?: number;
  issuedBy?: string;
  approvedBy?: string;
  employeeResponse?: string;
  notes?: string;
  attachments?: { id: number; name?: string }[];
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

const SEVERITY_COLORS: Record<string, string> = {
  minor: '#F59E0B', moderate: '#F97316', major: '#EF4444', critical: '#7C3AED',
};

export default function DisciplineDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: memo, isLoading } = useList<DisciplineMemo>(`/api/hr/discipline/memos/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل المذكرة…" />;
  if (!memo) return <GEmptyState icon="warning-outline" title="مذكرة غير موجودة" description="تعذّر العثور على بيانات المذكرة التأديبية" />;

  const ref = memo.ref ?? `#${memo.id}`;
  const st = statusBadge(memo.status ?? '');
  const severityColor = SEVERITY_COLORS[(memo.severity ?? '').toLowerCase()] ?? '#EF4444';
  const attachments = memo.attachments ?? [];
  const isPending = memo.status === 'pending' || memo.status === 'قيد المراجعة';
  const canApprove = isPending && user?.userRoles?.some(r => ['hr_manager', 'super_admin'].includes(r.roleKey));

  async function approve() {
    await apiFetch(`/api/hr/discipline/memos/${id}/approve`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: [`/api/hr/discipline/memos/${id}`] });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `مذكرة ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: severityColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{memo.employeeName ?? '—'}</Text>
          {memo.department ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{memo.department}</Text> : null}
          {memo.violationType ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{memo.violationType}</Text> : null}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {memo.severity ? (
              <View style={{ backgroundColor: '#FFFFFF30', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: '#FFF', fontWeight: '700' }}>{memo.severity}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="warning-outline" size={40} color="#FFFFFF80" />
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'تاريخ الحادثة', value: memo.incidentDate ? fmtDate(memo.incidentDate) : undefined },
            { label: 'تاريخ الإصدار', value: memo.issuedDate ? fmtDate(memo.issuedDate) : undefined },
            { label: 'صادر من', value: memo.issuedBy },
            { label: 'معتمد من', value: memo.approvedBy },
            { label: 'نوع العقوبة', value: memo.penaltyType },
            { label: 'قيمة الغرامة', value: memo.penaltyAmount !== undefined ? fmtMoney(memo.penaltyAmount, memo.currency) : undefined },
            { label: 'أيام الخصم', value: memo.deductionDays ? `${memo.deductionDays} يوم` : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {memo.description ? (
          <GCard>
            <GText variant="caption" color="muted">وصف المخالفة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{memo.description}</Text>
          </GCard>
        ) : null}

        {memo.employeeResponse ? (
          <GCard style={{ borderColor: '#3B82F6', borderWidth: 1 }}>
            <GText variant="caption" color="muted">رد الموظف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{memo.employeeResponse}</Text>
          </GCard>
        ) : null}

        {attachments.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">المرفقات</GText>
            {attachments.map(att => (
              <View key={att.id} style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                <Ionicons name="document-text-outline" size={16} color={c.brand} />
                <Text style={{ fontSize: 13, color: c.brand }}>{att.name ?? `مستند ${att.id}`}</Text>
              </View>
            ))}
          </GCard>
        )}

        {canApprove && (
          <View
            style={{ backgroundColor: '#22C55E', borderRadius: 12, padding: 16, alignItems: 'center' }}
            // @ts-ignore
            onStartShouldSetResponder={() => true}
            onResponderRelease={approve}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>اعتماد المذكرة</Text>
          </View>
        )}

        <GButton title="إجراء تأديبي جديد" icon="warning-outline" variant="secondary" onPress={() => router.push({ pathname: '/hr/discipline-new' as never, params: { employeeId: String(memo?.employeeId ?? '') } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
