import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface IntakeRule {
  id?: number;
  name?: string;
  condition?: string;
  priority?: number;
  action?: string;
  isActive?: boolean;
}

export default function TransportIntakeRulesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<IntakeRule[]>('/api/transport/intake-rules');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قواعد الاستقبال…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قواعد استقبال النقل' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد قواعد" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 8, alignItems: 'center' }}>
                {item.priority != null ? <Text style={{ fontSize: 12, color: c.brand }}>أولوية {item.priority}</Text> : null}
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF' }} />
              </View>
            </View>
            {item.condition ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.condition}</Text> : null}
            {item.action ? <Text style={{ fontSize: 12, color: '#F59E0B', marginTop: 2 }}>{item.action}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
