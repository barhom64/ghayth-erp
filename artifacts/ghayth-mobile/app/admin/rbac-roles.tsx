import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RbacRole {
  id?: number;
  key?: string;
  name?: string;
  level?: number;
  grantsCount?: number;
  isActive?: boolean;
}

export default function AdminRbacRolesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RbacRole[]>('/api/rbac/v2/roles');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأدوار…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أدوار RBAC' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد أدوار" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? item.key ?? '—'}</Text>
              {item.key ? <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2 }}>{item.key}</Text> : null}
              {item.level != null ? <Text style={{ fontSize: 11, color: c.brand, marginTop: 2 }}>مستوى {item.level}</Text> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              {item.grantsCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.grantsCount} صلاحية</Text> : null}
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive !== false ? '#22C55E' : '#9CA3AF', marginTop: 4 }} />
            </View>
          </View>
        )}
      />
    </View>
  );
}
