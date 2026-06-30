/**
 * تفاصيل عقد الإيجار — معلومات + دفعات + فواتير
 * GET /api/properties/contracts/:id
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface PropertyContract {
  id: number;
  ref?: string;
  contractNumber?: string;
  tenantName?: string;
  propertyName?: string;
  unitNumber?: string;
  buildingName?: string;
  startDate?: string;
  endDate?: string;
  status?: string;
  monthlyRent?: number;
  annualRent?: number;
  depositAmount?: number;
  depositStatus?: string;
  vatRate?: number;
  currency?: string;
  renewalType?: string;
  noticePeriod?: number;
  notes?: string;
  payments?: ContractPayment[];
  invoices?: ContractInvoice[];
  daysRemaining?: number;
}

interface ContractPayment {
  id?: number;
  ref?: string;
  amount?: number;
  dueDate?: string;
  paidDate?: string;
  status?: string;
  method?: string;
}

interface ContractInvoice {
  id?: number;
  ref?: string;
  amount?: number;
  dueDate?: string;
  status?: string;
}

type Tab = 'info' | 'payments' | 'invoices';

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function PropertyContractDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');
  const [acting, setActing] = useState(false);

  const { data: contract, isLoading, refetch } = useList<PropertyContract>(`/api/properties/contracts/${id}`);
  const { data: paymentsData } = useList<{ items?: ContractPayment[] }>(`/api/properties/payments?contractId=${id}`, undefined, { enabled: tab === 'payments' });
  const { data: invoicesData } = useList<{ items?: ContractInvoice[] }>(`/api/finance/invoices?contractId=${id}`, undefined, { enabled: tab === 'invoices' });

  const doRenew = async () => {
    Alert.alert('تجديد العقد', 'هل تريد تجديد هذا العقد؟', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'تأكيد', onPress: async () => {
        setActing(true);
        try {
          await apiFetch(`/api/properties/contracts/${id}/renew`, { method: 'POST', body: JSON.stringify({}) });
          await refetch();
        } catch {
          Alert.alert('خطأ', 'تعذّر تجديد العقد');
        } finally {
          setActing(false);
        }
      }},
    ]);
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل العقد…" />;
  if (!contract) return <GEmptyState icon="document-text-outline" title="عقد غير موجود" description="تعذّر العثور على بيانات العقد" />;

  const ref = contract.contractNumber ?? contract.ref ?? `#${contract.id}`;
  const st = statusBadge(contract.status ?? '');
  const currency = contract.currency;
  const payments = contract.payments ?? (paymentsData?.items ?? (Array.isArray(paymentsData) ? paymentsData as unknown as ContractPayment[] : []));
  const invoices = contract.invoices ?? (invoicesData?.items ?? (Array.isArray(invoicesData) ? invoicesData as unknown as ContractInvoice[] : []));
  const isExpiringSoon = (contract.daysRemaining ?? Infinity) <= 60;
  const isActive = contract.status === 'active';

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: 'تفاصيل العقد' },
    { key: 'payments', label: 'الدفعات' },
    { key: 'invoices', label: 'الفواتير' },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: `عقد ${ref}` }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{contract.tenantName ?? '—'}</Text>
          <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>
            {[contract.buildingName, contract.propertyName, contract.unitNumber ? `وحدة ${contract.unitNumber}` : null].filter(Boolean).join(' · ')}
          </Text>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {st ? <GStatusBadge status={st.label} size="sm" /> : null}
            {isExpiringSoon && (
              <View style={{ backgroundColor: '#EF444440', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, color: '#FFF', fontWeight: '700' }}>ينتهي خلال {contract.daysRemaining} يوم</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '800', color: c.onPrimary }}>{fmtMoney(contract.monthlyRent, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.onPrimary + 'AA', marginTop: 2 }}>شهريًا</Text>
        </View>
      </View>

      {/* التبويبات */}
      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable key={t.key} onPress={() => setTab(t.key)} style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {tab === 'info' && (
          <>
            <GCard style={{ gap: 0, padding: 0 }}>
              {[
                { label: 'تاريخ البداية', value: fmtDate(contract.startDate) },
                { label: 'تاريخ الانتهاء', value: fmtDate(contract.endDate) },
                { label: 'الإيجار الشهري', value: fmtMoney(contract.monthlyRent, currency) },
                { label: 'الإيجار السنوي', value: fmtMoney(contract.annualRent, currency) },
                { label: 'مبلغ التأمين', value: fmtMoney(contract.depositAmount, currency) },
                { label: 'حالة التأمين', value: contract.depositStatus },
                { label: 'نوع التجديد', value: contract.renewalType },
                { label: 'فترة الإشعار', value: contract.noticePeriod ? `${contract.noticePeriod} يوم` : undefined },
              ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
                <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                  <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 120, textAlign: 'right' }}>{row.label}</Text>
                </View>
              ))}
            </GCard>

            {contract.notes ? (
              <GCard>
                <GText variant="caption" color="muted">ملاحظات</GText>
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{contract.notes}</Text>
              </GCard>
            ) : null}

            {isActive && isExpiringSoon && (
              <GButton title="تجديد العقد" onPress={doRenew} loading={acting} />
            )}
          </>
        )}

        {tab === 'payments' && (
          payments.length === 0
            ? <GEmptyState icon="barcode-outline" title="لا توجد دفعات" description="لم يتم تسجيل أي دفعات لهذا العقد" />
            : payments.map((pay, i) => {
              const isPaid = pay.status === 'paid';
              return (
                <GCard key={pay.id ?? i} style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: isPaid ? '#22C55E' : c.text }}>{fmtMoney(pay.amount, currency)}</Text>
                    <Text style={{ fontSize: 13, color: c.textMuted }}>{pay.ref ?? `#${pay.id}`}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {pay.method ? <Text style={{ fontSize: 12, color: c.textMuted }}>{pay.method}</Text> : null}
                      <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(pay.paidDate ?? pay.dueDate)}</Text>
                    </View>
                    {pay.status ? <GStatusBadge status={pay.status} size="sm" /> : null}
                  </View>
                </GCard>
              );
            })
        )}

        {tab === 'invoices' && (
          invoices.length === 0
            ? <GEmptyState icon="receipt-outline" title="لا توجد فواتير" description="لم يتم إصدار أي فواتير لهذا العقد" />
            : invoices.map((inv, i) => (
              <GCard key={inv.id ?? i} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{fmtMoney(inv.amount, currency)}</Text>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>{inv.ref ?? `#${inv.id}`}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(inv.dueDate)}</Text>
                  {inv.status ? <GStatusBadge status={inv.status} size="sm" /> : null}
                </View>
              </GCard>
            ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
