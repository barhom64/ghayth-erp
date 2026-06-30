import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface GovIntegrationLink {
  id?: number;
  integrationId?: number;
  entityType?: string;
  entityId?: number | string;
  externalRef?: string;
  enabled?: boolean;
}

export default function GovIntegrationLinksScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<GovIntegrationLink[]>('/api/gov-integrations/links');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل روابط التكاملات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'روابط التكاملات الحكومية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="link-outline" title="لا توجد روابط" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                {item.entityType ?? '—'} #{item.entityId ?? '—'}
              </Text>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.enabled ? '#22C55E' : '#9CA3AF' }} />
            </View>
            {item.externalRef ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
                المرجع الخارجي: {item.externalRef}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
