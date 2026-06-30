import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SupplierFinanceDefaults { supplierId?: number; paymentTermDays?: number; defaultAccountCode?: string; currency?: string; whtRate?: number; }

export default function SupplierFinanceDefaultsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SupplierFinanceDefaults>('/api/finance/memory/suppliers/0/finance-defaults');
  const d = (data && !Array.isArray(data)) ? data as SupplierFinanceDefaults : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['مدة السداد', (d.paymentTermDays ?? 0) + ' يوم'],
    ['الحساب الافتراضي', d.defaultAccountCode ?? '-'],
    ['العملة', d.currency ?? '-'],
    ['نسبة الضريبة المستقطعة', (d.whtRate ?? 0) + '%'],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإعدادات المالية للمورد' }} />
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
