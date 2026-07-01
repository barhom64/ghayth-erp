import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ZatcaPauseEntry {
  id?: number;
  reason?: string;
  pausedBy?: string;
  pausedAt?: string;
  resumedAt?: string;
  duration?: string;
}

export default function FinanceZatcaPauseHistoryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ZatcaPauseEntry[]>('/api/finance/zatca/pause-history');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تاريخ إيقاف ZATCA…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تاريخ إيقاف ZATCA' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا يوجد تاريخ إيقاف" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            {item.reason ? <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.reason}</Text> : null}
            {item.pausedBy ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.pausedBy}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.pausedAt ? (
                <Text style={{ fontSize: 11, color: '#EF4444' }}>
                  إيقاف: {new Date(item.pausedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
                </Text>
              ) : null}
              {item.resumedAt ? (
                <Text style={{ fontSize: 11, color: '#22C55E' }}>
                  استئناف: {new Date(item.resumedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}
                </Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
