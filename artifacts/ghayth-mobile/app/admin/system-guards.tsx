import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SystemGuard {
  guardKey?: string;
  name?: string;
  domain?: string;
  enabled?: boolean;
  lastTriggered?: string;
  triggerCount?: number;
}

export default function SystemGuardsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SystemGuard[]>('/api/admin/governance/system-guards');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل حراس النظام…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حراس النظام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.guardKey ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد حراس" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.name ?? item.guardKey ?? '—'}</Text>
              <GStatusBadge status={item.enabled ? 'active' : 'inactive'} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.domain ? <Text style={{ fontSize: 11, color: c.brand }}>{item.domain}</Text> : null}
              {item.triggerCount != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>تفعيلات: {item.triggerCount}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
