import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AccessLog { id?: number; user?: string; action?: string; ip?: string; accessedAt?: string; }

export default function TelematicsVideoAccessLogs() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AccessLog[]>('/api/fleet/telematics/video/sessions/0/access-logs');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجلات وصول الفيديو' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="videocam-outline" title="لا توجد سجلات وصول" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.user ?? ''}</Text>
            {!!item.action && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>{item.action}</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {!!item.ip && <Text style={{ color: c.textFaint, fontSize: 12 }}>{item.ip}</Text>}
              {!!item.accessedAt && <Text style={{ color: c.textFaint, fontSize: 12 }}>{new Date(item.accessedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
