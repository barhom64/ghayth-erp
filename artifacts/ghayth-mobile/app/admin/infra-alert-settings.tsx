import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface InfraAlertSetting {
  id?: number | string;
  name?: string;
  enabled?: boolean;
  threshold?: number;
  unit?: string;
  notifyChannels?: string[];
}

export default function AdminInfraAlertSettingsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<InfraAlertSetting[]>('/api/intelligence/alerts/infra/settings');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعدادات التنبيهات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات تنبيهات البنية التحتية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="settings-outline" title="لا توجد إعدادات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.name ?? '—'}</Text>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: item.enabled ? '#22C55E' : '#9CA3AF' }} />
            </View>
            {item.threshold != null ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>
                الحد: {item.threshold} {item.unit ?? ''}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
