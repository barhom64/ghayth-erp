import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CustodyReportItem {
  employeeId?: number;
  employeeName?: string;
  totalIssued?: number;
  totalSettled?: number;
  outstanding?: number;
  custodyCount?: number;
}

export default function FinanceCustodiesReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CustodyReportItem[]>('/api/finance/custodies/report');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تقرير العهد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تقرير العهد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wallet-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }}>{item.employeeName ?? '—'}</Text>
              {(item.outstanding ?? 0) > 0 ? (
                <Text style={{ fontSize: 12, color: '#EF4444' }}>متبقٍّ: {(item.outstanding ?? 0).toLocaleString('ar-SA')} ر.س</Text>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>صرف: {(item.totalIssued ?? 0).toLocaleString('ar-SA')} ر.س</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>تسوية: {(item.totalSettled ?? 0).toLocaleString('ar-SA')} ر.س</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
