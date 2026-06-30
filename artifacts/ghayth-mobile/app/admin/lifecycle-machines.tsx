import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LifecycleMachine {
  machineKey?: string;
  name?: string;
  domain?: string;
  states?: number;
  transitions?: number;
  activeInstances?: number;
  status?: string;
}

export default function LifecycleMachinesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LifecycleMachine[]>('/api/admin/governance/lifecycle-machines');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل آلات دورة الحياة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'آلات دورة الحياة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.machineKey ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-network-outline" title="لا توجد آلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.name ?? item.machineKey ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'active'} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 14 }}>
              {item.domain ? <Text style={{ fontSize: 11, color: c.brand }}>{item.domain}</Text> : null}
              {item.states != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>حالات: {item.states}</Text> : null}
              {item.transitions != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>انتقالات: {item.transitions}</Text> : null}
              {item.activeInstances != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>نشطة: {item.activeInstances}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
