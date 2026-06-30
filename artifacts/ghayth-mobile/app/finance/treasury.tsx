import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TreasuryData {
  totalCash?: number;
  totalReceivables?: number;
  totalPayables?: number;
  netPosition?: number;
  currency?: string;
  bankAccounts?: { bankName?: string; balance?: number; currency?: string }[];
}

export default function TreasuryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TreasuryData>('/api/finance/treasury');

  if (isLoading) return <GLoadingState text="جارٍ تحميل الخزينة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const d = (Array.isArray(data) ? data[0] : data) as TreasuryData | undefined;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الخزينة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {[
          { label: 'إجمالي النقد', value: d?.totalCash },
          { label: 'إجمالي المدينون', value: d?.totalReceivables },
          { label: 'إجمالي الدائنون', value: d?.totalPayables },
          { label: 'صافي المركز', value: d?.netPosition },
        ].map(row => row.value != null ? (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: c.text }}>{row.label}</Text>
            <Text style={{ fontSize: 15, fontWeight: '700', color: (row.value ?? 0) < 0 ? '#EF4444' : c.brand }}>{(row.value ?? 0).toLocaleString('ar-SA')} {d?.currency ?? 'ر.س'}</Text>
          </View>
        ) : null)}
        {(d?.bankAccounts ?? []).map((acc, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>{acc.bankName ?? '—'}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{(acc.balance ?? 0).toLocaleString('ar-SA')} {acc.currency ?? 'ر.س'}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
