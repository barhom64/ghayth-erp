import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UserRoleEntry { roleId?: number; roleKey?: string; roleLabel?: string; grantedAt?: string; grantedBy?: string; }

export default function UserRolesDetail() {
  const c = useColors();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { data, isLoading, isError, refetch } = useList<UserRoleEntry[]>(`/api/admin/user-roles/${userId ?? '0'}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أدوار المستخدم' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.roleId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد أدوار" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.roleLabel ?? item.roleKey ?? ''}</Text>
            {!!item.grantedBy && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>منحه: {item.grantedBy}</Text>}
            {!!item.grantedAt && <Text style={{ color: c.textMuted, fontSize: 11, marginTop: 2 }}>{new Date(item.grantedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
