import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PayrollLiability { id?: number; payrollPeriod?: string; amount?: number; status?: string; }

export default function GlPayrollLiabilityScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PayrollLiability[]>('/api/finance/gl-helpers/payroll-liability/pending');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التزامات الرواتب — معلّقة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد التزامات معلّقة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.payrollPeriod ?? String(item.id ?? '')}</Text>
            {item.amount != null && <Text style={{ color: c.brand, fontSize: 14, fontWeight: '600' }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text>}
          </View>
        )}
      />
    </View>
  );
}
