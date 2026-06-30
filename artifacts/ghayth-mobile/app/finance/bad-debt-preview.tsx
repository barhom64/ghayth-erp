import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BadDebtItem { id?: number; clientName?: string; invoiceRef?: string; amount?: number; provision?: number; }

export default function BadDebtPreviewScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BadDebtItem[]>('/api/finance/bad-debt/preview');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معاينة مخصص الديون المشكوك فيها' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="alert" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.clientName ?? item.invoiceRef ?? String(item.id ?? '')}</Text>
            {item.amount != null && (
              <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>
                المبلغ: {item.amount.toLocaleString('ar-SA')} ر.س
              </Text>
            )}
            {item.provision != null && (
              <Text style={{ color: c.textMuted, fontSize: 12 }}>
                المخصص: {item.provision.toLocaleString('ar-SA')} ر.س
              </Text>
            )}
          </View>
        )}
      />
    </View>
  );
}
