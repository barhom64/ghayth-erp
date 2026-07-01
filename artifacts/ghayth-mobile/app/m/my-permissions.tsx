import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Permission { feature?: string; action?: string; }

export default function MyPermissions() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Permission[]>('/api/permissions/my');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صلاحياتي' }} />
      <FlatList data={list} keyExtractor={(item, i) => `${item.feature}-${item.action}-${i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-outline" title="لا توجد صلاحيات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.feature ?? ''}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.action ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
