import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EffectivePermission { feature?: string; actions?: string[]; source?: string; }

export default function RbacUserEffective() {
  const c = useColors();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { data, isLoading, isError, refetch } = useList<EffectivePermission[]>(`/api/rbac/v2/users/${userId ?? '0'}/effective`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الصلاحيات الفعلية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.feature ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد صلاحيات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.feature ?? ''}</Text>
            {Array.isArray(item.actions) && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.actions.join('، ')}</Text>}
            {!!item.source && <Text style={{ color: c.brand, fontSize: 12, marginTop: 2 }}>{item.source}</Text>}
          </View>
        )}
      />
    </View>
  );
}
