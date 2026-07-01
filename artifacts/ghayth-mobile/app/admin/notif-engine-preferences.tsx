import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PrefItem { userId?: number; channel?: string; enabled?: boolean; }

export default function NotifEnginePreferences() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PrefItem[]>('/api/notification-engine/preferences');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تفضيلات الإشعارات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.userId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="notifications-outline" title="لا توجد تفضيلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.channel ?? String(item.userId ?? '')}</Text>
            <Text style={{ color: item.enabled ? c.brand : c.textMuted, fontSize: 12 }}>{item.enabled ? 'مفعّل' : 'معطّل'}</Text>
          </View>
        )}
      />
    </View>
  );
}
