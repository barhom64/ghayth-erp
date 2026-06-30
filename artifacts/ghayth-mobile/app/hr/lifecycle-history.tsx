import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LifecycleEvent { id?: number; event?: string; fromStatus?: string; toStatus?: string; reason?: string; createdAt?: string; actor?: string; }

export default function LifecycleHistory() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LifecycleEvent[]>('/api/employees/0/lifecycle/history');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سجل دورة حياة الموظف' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا يوجد سجل" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.event ?? ''}</Text>
            {!!(item.fromStatus && item.toStatus) && (
              <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>{item.fromStatus} ← {item.toStatus}</Text>
            )}
            {!!item.reason && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.reason}</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {!!item.actor && <Text style={{ color: c.brand, fontSize: 12 }}>{item.actor}</Text>}
              {!!item.createdAt && <Text style={{ color: c.textFaint, fontSize: 12 }}>{new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
