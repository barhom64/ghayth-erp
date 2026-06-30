/**
 * تفاصيل طلب العمل الإضافي
 * GET /api/hr/overtime/:id
 * POST /api/hr/overtime/:id/approve
 * POST /api/hr/overtime/:id/reject
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface OvertimeRequest {
  id: number;
  requestNumber?: string;
  employeeName?: string;
  overtimeDate?: string;
  startTime?: string;
  endTime?: string;
  hours?: number;
  reason?: string;
  status?: string;
  totalAmount?: number;
  hourlyRate?: number;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
  currency?: string;
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

export default function OvertimeDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [acting, setActing] = useState(false);

  const { data: request, isLoading, refetch } = useList<OvertimeRequest>(`/api/hr/overtime/${id}`);

  const doAction = async (action: string, label: string) => {
    Alert.alert(label, `هل تريد ${label}؟`, [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/hr/overtime/${id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch {
          Alert.alert('خطأ', 'تعذّر تنفيذ الإجراء');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل طلب الوقت الإضافي…" />;
  if (!request) return <GEmptyState icon="alarm-outline" title="طلب غير موجود" description="تعذّر العثور على بيانات الطلب" />;

  const ref = request.requestNumber ?? `#${request.id}`;
  const st = statusBadge(request.status ?? '');
  const isPending = request.status === 'pending';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `وقت إضافي ${ref}` }} />

      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{request.employeeName ?? '—'}</Text>
          <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{fmtDate(request.overtimeDate)}</Text>
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: c.onPrimary }}>{request.hours ?? 0}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA' }}>ساعة</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'وقت البداية', value: request.startTime },
            { label: 'وقت الانتهاء', value: request.endTime },
            { label: 'عدد الساعات', value: request.hours ? `${request.hours} ساعة` : undefined },
            { label: 'معدل الساعة', value: fmtMoney(request.hourlyRate, request.currency) },
            { label: 'الإجمالي', value: fmtMoney(request.totalAmount, request.currency) },
            { label: 'معتمد من', value: request.approvedBy },
            { label: 'تاريخ الاعتماد', value: request.approvedAt ? fmtDate(request.approvedAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {request.reason ? (
          <GCard>
            <GText variant="caption" color="muted">سبب العمل الإضافي</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{request.reason}</Text>
          </GCard>
        ) : null}

        {request.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{request.notes}</Text>
          </GCard>
        ) : null}

        {isPending && (
          <View style={{ gap: 10 }}>
            <GButton title="اعتماد الطلب" onPress={() => doAction('approve', 'اعتماد الطلب')} loading={acting} />
            <GButton title="رفض الطلب" variant="secondary" onPress={() => doAction('reject', 'رفض الطلب')} loading={acting} />
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
