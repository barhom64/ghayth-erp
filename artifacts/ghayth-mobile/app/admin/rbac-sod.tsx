import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SodRule {
  id?: number;
  roleA?: string;
  roleB?: string;
  reason?: string;
  severity?: string;
}

export default function RbacSodScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SodRule[]>('/api/rbac/v2/sod');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قواعد فصل المهام…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فصل المهام (SoD)' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="ban-outline" title="لا توجد قواعد" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444' }}>{item.roleA ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.textMuted }}>+</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#EF4444' }}>{item.roleB ?? '—'}</Text>
            </View>
            {item.reason ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.reason}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
