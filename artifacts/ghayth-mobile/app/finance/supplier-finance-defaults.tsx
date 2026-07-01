import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SupplierFinanceDefaults { paymentTerms?: string; defaultCurrency?: string; creditLimit?: number; taxCode?: string; }

export default function SupplierFinanceDefaultsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SupplierFinanceDefaults>('/api/finance/suppliers/1/finance-defaults');
  const defaults = (data && !Array.isArray(data)) ? data as SupplierFinanceDefaults : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات المورد المالية' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {defaults ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
            {!!defaults.paymentTerms && <View style={{ marginBottom: 12 }}><Text style={{ color: c.textMuted, fontSize: 12 }}>شروط الدفع</Text><Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{defaults.paymentTerms}</Text></View>}
            {!!defaults.defaultCurrency && <View style={{ marginBottom: 12 }}><Text style={{ color: c.textMuted, fontSize: 12 }}>العملة الافتراضية</Text><Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{defaults.defaultCurrency}</Text></View>}
            {defaults.creditLimit != null && <View style={{ marginBottom: 12 }}><Text style={{ color: c.textMuted, fontSize: 12 }}>حد الائتمان</Text><Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{defaults.creditLimit.toLocaleString('ar-SA')} ر.س</Text></View>}
            {!!defaults.taxCode && <View><Text style={{ color: c.textMuted, fontSize: 12 }}>رمز الضريبة</Text><Text style={{ color: c.text, fontSize: 14, marginTop: 4 }}>{defaults.taxCode}</Text></View>}
          </View>
        ) : <GEmptyState icon="business-outline" title="لا توجد إعدادات" description="" />}
      </ScrollView>
    </View>
  );
}
