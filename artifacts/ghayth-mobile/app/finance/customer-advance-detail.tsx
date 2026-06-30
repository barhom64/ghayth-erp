/**
 * تفاصيل دفعة العميل المقدمة
 * GET /api/finance/customer-advances/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface CustomerAdvance {
  id: number;
  ref?: string;
  clientName?: string;
  amount?: number;
  currency?: string;
  method?: string;
  status?: string;
  receivedDate?: string;
  invoiceRef?: string;
  appliedAmount?: number;
  remainingAmount?: number;
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

export default function CustomerAdvanceDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: adv, isLoading } = useList<CustomerAdvance>(`/api/finance/customer-advances/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات الدفعة…" />;
  if (!adv) return <GEmptyState icon="arrow-down-circle-outline" title="دفعة غير موجودة" description="تعذّر العثور على بيانات الدفعة المقدمة" />;

  const st = statusBadge(adv.status ?? '');
  const appliedPct = adv.amount && adv.appliedAmount !== undefined ? Math.min(100, Math.round((adv.appliedAmount / adv.amount) * 100)) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: adv.ref ?? 'دفعة مقدمة' }} />

      <View style={[styles.header, { backgroundColor: '#10B981' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{adv.clientName ?? '—'}</Text>
          {adv.method ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{adv.method}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#FFF' }}>{fmtMoney(adv.amount, adv.currency)}</Text>
          <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>مبلغ الدفعة</Text>
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {(adv.appliedAmount !== undefined || adv.remainingAmount !== undefined) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {adv.appliedAmount !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#10B981' }}>{fmtMoney(adv.appliedAmount, adv.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المُطبَّق</Text>
              </GCard>
            )}
            {adv.remainingAmount !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#F59E0B' }}>{fmtMoney(adv.remainingAmount, adv.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المتبقي</Text>
              </GCard>
            )}
          </View>
        )}

        {adv.amount && adv.appliedAmount !== undefined ? (
          <View style={{ height: 6, backgroundColor: c.border, borderRadius: 3 }}>
            <View style={{ height: 6, width: `${appliedPct}%`, backgroundColor: '#10B981', borderRadius: 3 }} />
          </View>
        ) : null}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'العميل', value: adv.clientName },
            { label: 'تاريخ الاستلام', value: adv.receivedDate ? fmtDate(adv.receivedDate) : undefined },
            { label: 'طريقة الدفع', value: adv.method },
            { label: 'فاتورة مرتبطة', value: adv.invoiceRef },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {adv.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{adv.notes}</Text>
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
