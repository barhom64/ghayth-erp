import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RegistryAction {
  id?: number;
  name?: string;
  entity?: string;
  domain?: string;
  hasRbac?: boolean;
  hasAudit?: boolean;
}

export default function SystemRegistryActionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RegistryAction[]>('/api/admin/system-registry/actions');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إجراءات السجل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إجراءات سجل النظام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="flash-outline" title="لا توجد إجراءات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.brand }}>{item.domain ?? ''}</Text>
            </View>
            {item.entity ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.entity}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.hasRbac ? <Text style={{ fontSize: 11, color: '#22C55E' }}>✓ RBAC</Text> : <Text style={{ fontSize: 11, color: '#EF4444' }}>✗ RBAC</Text>}
              {item.hasAudit ? <Text style={{ fontSize: 11, color: '#22C55E' }}>✓ تدقيق</Text> : <Text style={{ fontSize: 11, color: '#EF4444' }}>✗ تدقيق</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
