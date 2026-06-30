/**
 * تفاصيل طلب الاستئذان
 * GET /api/hr/excuse-requests/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface ExcuseRequest {
  id: number;
  ref?: string;
  employeeName?: string;
  employeeId?: number;
  reason?: string;
  status?: string;
  date?: string;
  fromTime?: string;
  toTime?: string;
  duration?: number;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function ExcuseRequestDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: req, isLoading } = useList<ExcuseRequest>(`/api/hr/excuse-requests/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الطلب…" />;
  if (!req) return <GEmptyState icon="time-outline" title="طلب غير موجود" description="تعذّر العثور على بيانات طلب الاستئذان" />;

  const st = statusBadge(req.status ?? '');
  const approved = req.status === 'approved';
  const rejected = req.status === 'rejected';
  const headerColor = approved ? '#16A34A' : rejected ? '#DC2626' : '#6366F1';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: req.ref ?? 'طلب استئذان' }} />

      <View style={[styles.header, { backgroundColor: headerColor }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{req.employeeName ?? '—'}</Text>
          {req.reason ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{req.reason}</Text> : null}
          {req.date ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{fmtDate(req.date)}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Ionicons name="time-outline" size={36} color="#FFF" />
          {req.duration !== undefined && (
            <Text style={{ fontSize: 12, color: '#FFFFFFCC', marginTop: 4 }}>{req.duration} د</Text>
          )}
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الموظف', value: req.employeeName },
            { label: 'التاريخ', value: req.date ? fmtDate(req.date) : undefined },
            { label: 'من الساعة', value: req.fromTime },
            { label: 'إلى الساعة', value: req.toTime },
            { label: 'المعتمد من', value: req.approvedBy },
            { label: 'تاريخ الاعتماد', value: req.approvedAt ? fmtDate(req.approvedAt) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {req.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{req.notes}</Text>
          </GCard>
        ) : null}

        <GButton title="طلب عذر جديد" icon="document-text-outline" variant="secondary" onPress={() => router.push({ pathname: '/hr/excuse-request-new' as never, params: { employeeId: String(req?.employeeId ?? '') } })} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
