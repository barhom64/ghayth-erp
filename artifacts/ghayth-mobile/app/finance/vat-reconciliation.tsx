import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VatRecItem {
  period?: string;
  outputVat?: number;
  inputVat?: number;
  netVat?: number;
  currency?: string;
  status?: string;
}

export default function VatReconciliationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<VatRecItem[]>('/api/reports/vat-reconciliation');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تسوية الضريبة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تسوية الضريبة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.period ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد بيانات تسوية ضريبية" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 6 }}>{item.period ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.outputVat != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>ضريبة المخرجات</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#22C55E' }}>{item.outputVat.toLocaleString('ar-SA')}</Text>
              </View> : null}
              {item.inputVat != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>ضريبة المدخلات</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{item.inputVat.toLocaleString('ar-SA')}</Text>
              </View> : null}
              {item.netVat != null ? <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 10, color: c.textMuted }}>صافي الضريبة</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{item.netVat.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text>
              </View> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
