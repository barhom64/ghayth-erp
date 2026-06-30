import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahAgentProfitability {
  umrahAgentId?: number;
  agentName?: string;
  revenue?: number;
  cost?: number;
  profit?: number;
  margin?: number;
  groupCount?: number;
}

export default function UmrahAgentProfitabilityScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UmrahAgentProfitability[]>('/api/finance/reports/profitability/umrah-agent/0');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل ربحية الوكلاء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ربحية وكلاء العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.umrahAgentId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.agentName ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: (item.profit ?? 0) >= 0 ? '#22C55E' : '#EF4444', fontWeight: '600' }}>
                {Number(item.profit ?? 0).toLocaleString('ar-SA')} ر.س
              </Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>إيراد: {Number(item.revenue ?? 0).toLocaleString('ar-SA')}</Text>
              {item.groupCount != null ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>مجموعات: {item.groupCount}</Text>
              ) : null}
              {item.margin != null ? (
                <Text style={{ fontSize: 12, color: c.brand }}>هامش: {Number(item.margin).toFixed(1)}%</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
