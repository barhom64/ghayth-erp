import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ClientAnalytic { clientId?: number; clientName?: string; revenue?: number; orders?: number; segment?: string; ltv?: number; }

export default function ClientsAnalytics() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ClientAnalytic[]>('/api/intelligence/clients/analytics');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحليلات العملاء' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.clientId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد بيانات تحليلية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.clientName ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {item.revenue !== undefined && <Text style={{ color: c.brand, fontSize: 13 }}>{item.revenue.toLocaleString('ar-SA')} ر.س</Text>}
              {!!item.segment && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.segment}</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
