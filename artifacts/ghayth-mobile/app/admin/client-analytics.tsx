import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ClientAnalytic {
  clientId?: number;
  clientName?: string;
  rfmScore?: number;
  segment?: string;
  totalRevenue?: number;
  lastActivityAt?: string;
}

export default function ClientAnalyticsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ClientAnalytic[]>('/api/intelligence/clients/analytics');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تحليلات العملاء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحليلات العملاء' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.clientId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.clientName ?? '—'}</Text>
              {item.segment ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.segment}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {item.rfmScore != null ? <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{item.rfmScore}</Text> : null}
              {item.totalRevenue != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.totalRevenue.toLocaleString('ar-SA')} ر.س</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
