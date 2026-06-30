/**
 * تفاصيل طلب إنهاء الخدمة
 * GET /api/hr/transfers/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface ExitRequest {
  id: number;
  ref?: string;
  employeeName?: string;
  employeeNumber?: string;
  exitType?: string;
  reason?: string;
  status?: string;
  requestDate?: string;
  exitDate?: string;
  noticePeriod?: number;
  gratuityAmount?: number;
  currency?: string;
  approvedBy?: string;
  notes?: string;
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

export default function ExitRequestDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: req, isLoading } = useList<ExitRequest>(`/api/hr/transfers/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الطلب…" />;
  if (!req) return <GEmptyState icon="log-out-outline" title="طلب غير موجود" description="تعذّر العثور على طلب إنهاء الخدمة" />;

  const st = statusBadge(req.status ?? '');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'طلب إنهاء الخدمة' }} />

      <View style={[styles.header, { backgroundColor: '#DC2626' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{req.employeeName ?? '—'}</Text>
          {req.employeeNumber ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{req.employeeNumber}</Text> : null}
          {req.exitType ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{req.exitType}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        {req.gratuityAmount !== undefined ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>{fmtMoney(req.gratuityAmount, req.currency)}</Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>المكافأة</Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'نوع الإنهاء', value: req.exitType },
            { label: 'تاريخ الطلب', value: req.requestDate ? fmtDate(req.requestDate) : undefined },
            { label: 'تاريخ الإنهاء', value: req.exitDate ? fmtDate(req.exitDate) : undefined },
            { label: 'فترة الإشعار', value: req.noticePeriod !== undefined ? `${req.noticePeriod} يوم` : undefined },
            { label: 'اعتمد بواسطة', value: req.approvedBy },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {req.reason ? (
          <GCard>
            <GText variant="caption" color="muted">سبب الإنهاء</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right', lineHeight: 20 }}>{req.reason}</Text>
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
