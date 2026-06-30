import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RegistryEntity {
  id?: number;
  name?: string;
  domain?: string;
  table?: string;
  hasAudit?: boolean;
  hasRbac?: boolean;
}

export default function SystemRegistryEntitiesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RegistryEntity[]>('/api/admin/system-registry/entities');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الكيانات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كيانات سجل النظام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cube-outline" title="لا توجد كيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.brand }}>{item.domain ?? ''}</Text>
            </View>
            {item.table ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.table}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.hasAudit ? <Text style={{ fontSize: 11, color: '#22C55E' }}>✓ تدقيق</Text> : null}
              {item.hasRbac ? <Text style={{ fontSize: 11, color: '#22C55E' }}>✓ RBAC</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
