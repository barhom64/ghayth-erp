import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Branch { id?: number; name?: string; city?: string; isActive?: boolean; }

export default function SettingsBranchesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Branch[]>('/api/settings/branches');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الفروع' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد فروع" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 14 }}>{item.name ?? ''}</Text>
              <Text style={{ color: item.isActive ? '#38a169' : c.textMuted, fontSize: 12 }}>{item.isActive ? 'نشط' : 'غير نشط'}</Text>
            </View>
            {item.city ? <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.city}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
