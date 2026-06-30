import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CustodyAdvance {
  id?: number;
  employeeName?: string;
  amount?: number;
  settledAmount?: number;
  status?: string;
  requestedAt?: string;
}

export default function FinanceCustodyAdvancesReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CustodyAdvance[]>('/api/finance/reports/custody-advances');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير السلف…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير سلف العهد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wallet-outline" title="لا توجد سلف" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.employeeName ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.text }}>{(item.amount ?? 0).toLocaleString('ar-SA')} ر.س</Text>
            </View>
            {item.status ? <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.status}</Text> : null}
            {item.requestedAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2, textAlign: 'right' }}>
                {new Date(item.requestedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
