import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InfraAlert { id?: number; service?: string; status?: string; message?: string; severity?: string; timestamp?: string; }

export default function InfraAlerts() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InfraAlert[]>('/api/intelligence/alerts/infra');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تنبيهات البنية التحتية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="server-outline" title="لا توجد تنبيهات بنية تحتية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.service ?? ''}</Text>
            {!!item.message && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{item.message}</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {!!item.severity && <Text style={{ color: item.severity === 'critical' ? '#ef4444' : '#f59e0b', fontSize: 12 }}>{item.severity}</Text>}
              {!!item.status && <Text style={{ color: c.brand, fontSize: 12 }}>{item.status}</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
