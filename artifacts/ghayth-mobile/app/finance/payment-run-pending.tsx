import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PaymentRunPending {
  id?: number;
  vendorName?: string;
  invoiceRef?: string;
  dueDate?: string;
  amount?: number;
  currency?: string;
  paymentMethod?: string;
}

export default function FinancePaymentRunPendingScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PaymentRunPending[]>('/api/finance/payment-run/pending');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المدفوعات المعلّقة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دفعات معلّقة للصرف' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد دفعات معلّقة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.vendorName ?? '—'}</Text>
              {item.amount != null && (
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                  {item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              )}
            </View>
            {item.invoiceRef ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.invoiceRef}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.dueDate ? (
                <Text style={{ fontSize: 11, color: c.textMuted }}>
                  {new Date(item.dueDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
              {item.paymentMethod ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.paymentMethod}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
