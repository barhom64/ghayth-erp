/**
 * ملف المورد — معلومات + فواتير + حركات الدفع
 * GET /api/finance/vendors/:id
 */
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GButton, GText, GLoadingState, GEmptyState, GStatusBadge, GAvatar } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Vendor {
  id: number;
  name?: string;
  tradeName?: string;
  vatNumber?: string;
  crNumber?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  country?: string;
  city?: string;
  address?: string;
  paymentTerms?: number;
  currency?: string;
  status?: string;
  balance?: number;
  totalPurchases?: number;
  openInvoices?: number;
  creditLimit?: number;
  category?: string;
  bankAccount?: string;
  iban?: string;
  invoices?: VendorInvoice[];
  payments?: VendorPayment[];
}

interface VendorInvoice {
  id?: number;
  ref?: string;
  amount?: number;
  status?: string;
  date?: string;
  dueDate?: string;
}

interface VendorPayment {
  id?: number;
  ref?: string;
  amount?: number;
  method?: string;
  date?: string;
}

type Tab = 'info' | 'invoices' | 'payments';

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function VendorDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>('info');

  const { data: vendor, isLoading } = useList<Vendor>(`/api/finance/vendors/${id}`);
  const { data: invoicesData } = useList<{ items?: VendorInvoice[] }>(`/api/finance/vendor-invoices?vendorId=${id}`, undefined, { enabled: tab === 'invoices' });
  const { data: paymentsData } = useList<{ items?: VendorPayment[] }>(`/api/finance/payments?vendorId=${id}`, undefined, { enabled: tab === 'payments' });

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملف المورد…" />;
  if (!vendor) return <GEmptyState icon="business-outline" title="مورد غير موجود" description="تعذّر العثور على بيانات المورد" />;

  const name = vendor.tradeName ?? vendor.name ?? `#${vendor.id}`;
  const currency = vendor.currency;
  const invoices = invoicesData?.items ?? (Array.isArray(invoicesData) ? invoicesData as unknown as VendorInvoice[] : []);
  const payments = paymentsData?.items ?? (Array.isArray(paymentsData) ? paymentsData as unknown as VendorPayment[] : []);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: 'المعلومات' },
    { key: 'invoices', label: 'الفواتير' },
    { key: 'payments', label: 'المدفوعات' },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: name }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: c.primary }]}>
        <GAvatar name={name} size="lg" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: c.onPrimary, textAlign: 'right' }}>{name}</Text>
          {vendor.category ? <Text style={{ fontSize: 13, color: c.onPrimary + 'CC', textAlign: 'right' }}>{vendor.category}</Text> : null}
          {vendor.status ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={vendor.status} size="sm" /></View> : null}
        </View>
      </View>

      {/* شريط الرصيد */}
      <View style={[styles.balanceBar, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <View style={styles.balanceItem}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{fmtMoney(vendor.balance, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>الرصيد المستحق</Text>
        </View>
        <View style={[styles.balanceDivider, { backgroundColor: c.border }]} />
        <View style={styles.balanceItem}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{fmtMoney(vendor.totalPurchases, currency)}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>إجمالي المشتريات</Text>
        </View>
        <View style={[styles.balanceDivider, { backgroundColor: c.border }]} />
        <View style={styles.balanceItem}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: vendor.openInvoices ? '#EF4444' : c.text }}>{vendor.openInvoices ?? 0}</Text>
          <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>فواتير مفتوحة</Text>
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
                { label: 'الاسم التجاري', value: vendor.tradeName },
                { label: 'رقم السجل التجاري', value: vendor.crNumber },
                { label: 'الرقم الضريبي', value: vendor.vatNumber },
                { label: 'جهة الاتصال', value: vendor.contactPerson },
                { label: 'الهاتف', value: vendor.phone },
                { label: 'البريد الإلكتروني', value: vendor.email },
                { label: 'المدينة', value: vendor.city },
                { label: 'الدولة', value: vendor.country },
                { label: 'شروط الدفع', value: vendor.paymentTerms ? `${vendor.paymentTerms} يوم` : undefined },
                { label: 'حد الائتمان', value: vendor.creditLimit !== undefined ? fmtMoney(vendor.creditLimit, currency) : undefined },
                { label: 'IBAN', value: vendor.iban },
              ].filter(r => r.value).map((row, i, arr) => (
                <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                  <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
                  <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
                </View>
              ))}
            </GCard>
          </>
        )}

        {tab === 'invoices' && (
          <>
          <GButton
            title="فاتورة مورد جديدة"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/finance/vendor-invoice-new' as never, params: { vendorId: id } })}
            style={{ marginBottom: 8 }}
          />
          {invoices.length === 0
            ? <GEmptyState icon="documents-outline" title="لا توجد فواتير" description="لم يتم تسجيل أي فواتير لهذا المورد" />
            : invoices.map((inv, i) => (
              <GCard key={inv.id ?? i} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{fmtMoney(inv.amount, currency)}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: c.textMuted }}>{inv.ref ?? `#${inv.id}`}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(inv.dueDate)}</Text>
                  {inv.status ? <GStatusBadge status={inv.status} size="sm" /> : null}
                </View>
              </GCard>
            ))}
          </>
        )}

        {tab === 'payments' && (
          <>
          <GButton
            title="دفعة للمورد"
            icon="add-circle-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: '/finance/vendor-payment-new' as never, params: { vendorId: id } })}
            style={{ marginBottom: 8 }}
          />
          {payments.length === 0
            ? <GEmptyState icon="barcode-outline" title="لا توجد مدفوعات" description="لم يتم تسجيل أي مدفوعات لهذا المورد" />
            : payments.map((pay, i) => (
              <GCard key={pay.id ?? i} style={{ gap: 4 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#22C55E' }}>{fmtMoney(pay.amount, currency)}</Text>
                  <Text style={{ fontSize: 13, color: c.textMuted }}>{pay.ref ?? `#${pay.id}`}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(pay.date)}</Text>
                  {pay.method ? <Text style={{ fontSize: 12, color: c.textMuted }}>{pay.method}</Text> : null}
                </View>
              </GCard>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  balanceBar: { flexDirection: 'row', borderBottomWidth: 1, paddingVertical: 12 },
  balanceItem: { flex: 1, alignItems: 'center' },
  balanceDivider: { width: 1, marginVertical: 4 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
