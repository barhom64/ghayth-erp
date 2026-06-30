import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SyncLog { id?: number; deviceId?: string; status?: string; recordsSynced?: number; errorMessage?: string; syncedAt?: string; }

export default function TelematicsSyncLogs() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SyncLog[]>('/api/fleet/telematics/sync-logs');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجلات المزامنة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="sync-outline" title="لا توجد سجلات مزامنة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.deviceId ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {!!item.status && <Text style={{ color: item.status === 'success' ? '#22c55e' : '#ef4444', fontSize: 12 }}>{item.status}</Text>}
              {item.recordsSynced !== undefined && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.recordsSynced} سجل</Text>}
            </View>
            {!!item.syncedAt && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 4 }}>{new Date(item.syncedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
