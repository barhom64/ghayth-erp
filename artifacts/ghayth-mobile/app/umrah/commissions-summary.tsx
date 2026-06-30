import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CommissionSummaryRow {
  agentId?: number;
  agentName?: string;
  groupsCount?: number;
  pilgrimsCount?: number;
  totalCommission?: number;
  paidAmount?: number;
  remainingAmount?: number;
}

export default function UmrahCommissionsSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CommissionSummaryRow[]>('/api/umrah/reports/commissions-summary');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص العمولات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص عمولات العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.agentId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد عمولات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.agentName ?? '—'}</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#22C55E' }}>{(item.totalCommission ?? 0).toLocaleString('ar-SA')} ر.س</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>مجموعات: {item.groupsCount ?? 0}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>حجاج: {item.pilgrimsCount ?? 0}</Text>
              {(item.remainingAmount ?? 0) > 0 ? (
                <Text style={{ fontSize: 11, color: '#F59E0B' }}>متبقي: {item.remainingAmount?.toLocaleString('ar-SA')}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
