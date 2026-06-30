import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DunningPreviewItem {
  id?: number;
  clientName?: string;
  invoiceNumber?: string;
  amount?: number;
  daysOverdue?: number;
  proposedAction?: string;
  dunningLevel?: number;
}

export default function FinanceDunningPreviewScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DunningPreviewItem[]>('/api/finance/dunning/preview');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل معاينة التحصيل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'معاينة التحصيل' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="mail-outline" title="لا توجد حسابات معلّقة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }}>{item.clientName ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: '#EF4444' }}>{(item.amount ?? 0).toLocaleString('ar-SA')} ر.س</Text>
            </View>
            {item.daysOverdue ? (
              <Text style={{ fontSize: 12, color: '#F59E0B', marginTop: 4, textAlign: 'right' }}>{item.daysOverdue} يوم متأخر</Text>
            ) : null}
            {item.proposedAction ? (
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>{item.proposedAction}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
