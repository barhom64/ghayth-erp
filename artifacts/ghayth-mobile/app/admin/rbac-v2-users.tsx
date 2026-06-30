import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RbacUser {
  userId?: number;
  userName?: string;
  email?: string;
  roles?: string[];
}

export default function RbacV2UsersScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RbacUser[]>('/api/rbac/v2/users');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مستخدمي الأدوار…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مستخدمو الأدوار' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.userId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا يوجد مستخدمون" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, textAlign: 'right' }}>{item.userName ?? '—'}</Text>
            <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.email ?? '—'}</Text>
            {(item.roles?.length ?? 0) > 0 ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>{item.roles!.join('، ')}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
