import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GovIntegration { id?: number; name?: string; status?: string; type?: string; }

export default function GovIntegrationsListScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GovIntegration[]>('/api/gov-integrations');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التكاملات الحكومية' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد تكاملات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? String(item.id ?? '')}</Text>
            {!!item.type && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.type}</Text>}
            {!!item.status && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{item.status}</Text>}
          </View>
        )}
      />
    </View>
  );
}
