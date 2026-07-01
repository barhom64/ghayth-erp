import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MisroutedInvoice { id?: number; invoiceNumber?: string; customerName?: string; amount?: number; }

export default function ZatcaMisroutedB2cScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MisroutedInvoice[]>('/api/finance/zatca/misrouted-b2c-invoices');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فواتير B2C غير الموجَّهة — زاتكا' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد فواتير غير موجَّهة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.invoiceNumber ?? String(item.id ?? '')}</Text>
            {!!item.customerName && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.customerName}</Text>}
            {item.amount != null && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text>}
          </View>
        )}
      />
    </View>
  );
}
