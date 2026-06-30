import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Receipt { id?: number; receiptNumber?: string; date?: string; amount?: number; status?: string; }

export default function PurchaseOrderReceiptsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Receipt[]>('/api/finance/purchase-orders/0/receipts');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إيصالات أمر الشراء' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد إيصالات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.receiptNumber ?? String(item.id ?? '')}</Text>
            {item.amount != null && (
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
                {item.amount.toLocaleString('ar-SA')} ر.س
              </Text>
            )}
            {item.status && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.status}</Text>}
            {item.date && (
              <Text style={{ color: c.textMuted, fontSize: 12 }}>
                {new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
