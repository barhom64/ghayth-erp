import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ResolvedSetting {
  key?: string;
  value?: string;
  source?: string;
}

export default function SettingsResolvedScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ResolvedSetting[]>('/api/settings/resolved');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الإعدادات المحلولة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const sourceColor = (src?: string) => {
    if (src === 'branch') return '#3B82F6';
    if (src === 'company') return '#F59E0B';
    return '#9CA3AF';
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الإعدادات المحلولة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => item.key ?? String(i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="settings-outline" title="لا توجد إعدادات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.key ?? '—'}</Text>
              {item.source ? (
                <Text style={{ fontSize: 10, color: sourceColor(item.source), backgroundColor: c.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  {item.source}
                </Text>
              ) : null}
            </View>
            {item.value != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }} numberOfLines={2}>{String(item.value)}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
