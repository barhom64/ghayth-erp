/**
 * تفاصيل طلب الإجازة
 * GET /api/hr/leave-requests/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { statusBadge } from '@/lib/moduleSections';
import { useQueryClient } from '@tanstack/react-query';

interface LeaveRequest {
  id: number;
  ref?: string;
  employeeName?: string;
  employeeNumber?: string;
  department?: string;
  leaveType?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  daysCount?: number;
  reason?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  balance?: number;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function LeaveRequestDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: leave, isLoading } = useList<LeaveRequest>(`/api/hr/leave-requests/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلب الإجازة…" />;
  if (!leave) return <GEmptyState icon="calendar-outline" title="طلب غير موجود" description="تعذّر العثور على بيانات الطلب" />;

  const ref = leave.ref ?? `#${leave.id}`;
  const st = statusBadge(leave.status ?? '');
  const isPending = leave.status === 'pending' || leave.status === 'قيد المراجعة' || leave.status === 'submitted';
  const canApprove = isPending && user?.userRoles?.some(r => ['hr_manager', 'department_manager', 'super_admin'].includes(r.roleKey));

  async function approve() {
    await apiFetch(`/api/hr/leave-requests/${id}/approve`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: [`/api/hr/leave-requests/${id}`] });
  }

  async function reject() {
    await apiFetch(`/api/hr/leave-requests/${id}/reject`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: [`/api/hr/leave-requests/${id}`] });
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `إجازة ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{leave.employeeName ?? '—'}</Text>
          {leave.leaveType ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{leave.leaveType}</Text> : null}
          {leave.department ? <Text style={{ fontSize: 12, color: c.onPrimary + 'AA', textAlign: 'right' }}>{leave.department}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 32, fontWeight: '800', color: c.onPrimary }}>{leave.daysCount ?? 0}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>يوم</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'من', value: leave.startDate ? fmtDate(leave.startDate) : undefined },
            { label: 'إلى', value: leave.endDate ? fmtDate(leave.endDate) : undefined },
            { label: 'عدد الأيام', value: leave.daysCount !== undefined ? `${leave.daysCount} يوم` : undefined },
            { label: 'الرصيد المتاح', value: leave.balance !== undefined ? `${leave.balance} يوم` : undefined },
            { label: 'تمت الموافقة من', value: leave.approvedBy },
            { label: 'تاريخ الموافقة', value: leave.approvedAt ? fmtDate(leave.approvedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {leave.reason ? (
          <GCard>
            <GText variant="caption" color="muted">سبب الإجازة</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{leave.reason}</Text>
          </GCard>
        ) : null}

        {leave.rejectionReason ? (
          <GCard style={{ borderColor: '#FCA5A5', borderWidth: 1 }}>
            <GText variant="caption" color="muted">سبب الرفض</GText>
            <Text style={{ fontSize: 13, color: '#EF4444', textAlign: 'right' }}>{leave.rejectionReason}</Text>
          </GCard>
        ) : null}

        {leave.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{leave.notes}</Text>
          </GCard>
        ) : null}

        {canApprove && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View
              style={{ flex: 1, backgroundColor: '#EF4444', borderRadius: 12, padding: 14, alignItems: 'center' }}
              // @ts-ignore
              onStartShouldSetResponder={() => true}
              onResponderRelease={reject}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>رفض</Text>
            </View>
            <View
              style={{ flex: 1, backgroundColor: '#22C55E', borderRadius: 12, padding: 14, alignItems: 'center' }}
              // @ts-ignore
              onStartShouldSetResponder={() => true}
              onResponderRelease={approve}
            >
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>اعتماد</Text>
            </View>
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
