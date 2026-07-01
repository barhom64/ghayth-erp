import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface VatItem { id?: number; period?: string; taxBase?: number; taxAmount?: number; status?: string; }

export default function VatReconciliationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<VatItem[]>('/api/finance/reports/vat-reconciliation');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تسوية ضريبة القيمة المضافة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calculator-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.period ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.taxAmount != null ? <Text style={{ color: c.brand, fontSize: 13 }}>الضريبة: {item.taxAmount.toLocaleString('ar-SA')} ر.س</Text> : null}
              {item.status ? <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.status}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
