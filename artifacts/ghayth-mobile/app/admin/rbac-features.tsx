import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RbacFeature {
  key?: string;
  name?: string;
  module?: string;
  actions?: string[];
}

export default function RbacFeaturesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RbacFeature[]>('/api/rbac/v2/features');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل ميزات RBAC…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ميزات الصلاحيات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.key ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="key-outline" title="لا توجد ميزات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? item.key ?? '—'}</Text>
              {item.module ? <Text style={{ fontSize: 11, color: c.brand, marginTop: 2 }}>{item.module}</Text> : null}
            </View>
            {item.actions?.length ? (
              <Text style={{ fontSize: 11, color: c.textMuted }}>{item.actions.length} إجراء</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
