import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Tenant { id?: number; name?: string; phone?: string; nationalId?: string; }

export default function TenantsList() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Tenant[]>('/api/properties/tenants/list');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قائمة المستأجرين' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا يوجد مستأجرون" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.name ?? String(item.id ?? '')}</Text>
            {item.phone && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.phone}</Text>}
          </View>
        )}
      />
    </View>
  );
}
