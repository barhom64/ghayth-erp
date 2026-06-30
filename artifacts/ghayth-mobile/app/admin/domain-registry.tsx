import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DomainEntry {
  domain?: string;
  description?: string;
  features?: number;
  routes?: number;
  owner?: string;
}

export default function DomainRegistryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DomainEntry[]>('/api/admin/governance/domain-registry');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سجل النطاقات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل النطاقات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.domain ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="grid-outline" title="لا توجد نطاقات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{item.domain ?? '—'}</Text>
              {item.owner ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.owner}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 14 }}>
              {item.features != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>صلاحيات: {item.features}</Text> : null}
              {item.routes != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>مسارات: {item.routes}</Text> : null}
            </View>
            {item.description ? <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 4 }}>{item.description}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
