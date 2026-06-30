import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Administration {
  id?: number;
  name?: string;
  type?: string;
  parentName?: string;
  isActive?: boolean;
}

export default function SettingsAdministrationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Administration[]>('/api/settings/administrations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإدارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإدارات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد إدارات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              {item.parentName ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.parentName}</Text> : null}
            </View>
            {item.type ? (
              <Text style={{ fontSize: 11, color: c.textMuted, marginHorizontal: 8 }}>{item.type}</Text>
            ) : null}
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF' }} />
          </View>
        )}
      />
    </View>
  );
}
