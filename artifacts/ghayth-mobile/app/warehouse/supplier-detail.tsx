/**
 * تفاصيل المورد
 * GET /api/warehouse/suppliers/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Supplier {
  id: number;
  ref?: string;
  name?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  address?: string;
  paymentTerms?: number;
  totalPurchases?: number;
  pendingAmount?: number;
  currency?: string;
  notes?: string;
}

function fmtMoney(val?: number, currency?: string): string {
  if (val === undefined || val === null) return '—';
  return Number(val).toLocaleString('ar-SA') + ' ' + (currency ?? 'ر.س');
}

export default function SupplierDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: supplier, isLoading } = useList<Supplier>(`/api/warehouse/suppliers/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات المورد…" />;
  if (!supplier) return <GEmptyState icon="business-outline" title="مورد غير موجود" description="تعذّر العثور على بيانات المورد" />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: supplier.name ?? 'المورد' }} />

      {/* رأس */}
      <View style={[styles.header, { backgroundColor: '#0EA5E9' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{supplier.name ?? '—'}</Text>
          {supplier.contactPerson ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{supplier.contactPerson}</Text> : null}
          {supplier.phone ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{supplier.phone}</Text> : null}
        </View>
        {supplier.paymentTerms !== undefined ? (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '800', color: '#FFF' }}>{supplier.paymentTerms}</Text>
            <Text style={{ fontSize: 11, color: '#FFFFFFAA' }}>يوم سداد</Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        {(supplier.totalPurchases !== undefined || supplier.pendingAmount !== undefined) && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {supplier.totalPurchases !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: c.brand }}>{fmtMoney(supplier.totalPurchases, supplier.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>إجمالي المشتريات</Text>
              </GCard>
            )}
            {supplier.pendingAmount !== undefined && (
              <GCard style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: supplier.pendingAmount > 0 ? '#EF4444' : '#22C55E' }}>{fmtMoney(supplier.pendingAmount, supplier.currency)}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4 }}>المبلغ المعلّق</Text>
              </GCard>
            )}
          </View>
        )}

        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'الشخص المسؤول', value: supplier.contactPerson },
            { label: 'الهاتف', value: supplier.phone },
            { label: 'البريد الإلكتروني', value: supplier.email },
            { label: 'الرقم الضريبي', value: supplier.taxNumber },
            { label: 'العنوان', value: supplier.address },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 140, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        <GButton title="طلب شراء جديد" icon="cart-outline" variant="secondary" onPress={() => router.push({ pathname: '/finance/purchase-request-new' as never, params: { supplierId: id } })} />

        {supplier.notes ? (
          <GCard>
            <GText variant="caption" color="muted">ملاحظات</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{supplier.notes}</Text>
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
