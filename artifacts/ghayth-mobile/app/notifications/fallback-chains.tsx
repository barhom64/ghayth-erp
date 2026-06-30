import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FallbackChain {
  id?: number;
  name?: string;
  steps?: number;
  isActive?: boolean;
  description?: string;
}

export default function NotificationFallbackChainsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FallbackChain[]>('/api/notification-engine/fallback-chains');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سلاسل الاحتياط…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سلاسل الإشعار الاحتياطي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-branch-outline" title="لا توجد سلاسل" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              {item.description ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.description}</Text> : null}
              {item.steps != null ? <Text style={{ fontSize: 11, color: c.brand, marginTop: 2 }}>{item.steps} خطوات</Text> : null}
            </View>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF' }} />
          </View>
        )}
      />
    </View>
  );
}
