import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Acl { id?: number; principal?: string; permission?: string; scope?: string; }

export default function DocumentAclsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Acl[]>('/api/documents/0/acls');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'صلاحيات المستند' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="lock-open-outline" title="لا توجد صلاحيات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.principal ?? String(item.id ?? '')}</Text>
            {item.permission && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.permission}</Text>}
            {item.scope && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.scope}</Text>}
          </View>
        )}
      />
    </View>
  );
}
