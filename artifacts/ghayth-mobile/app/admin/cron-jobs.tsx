import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CronJob { id?: number; name?: string; schedule?: string; status?: string; lastRun?: string; nextRun?: string; enabled?: boolean; }

export default function CronJobs() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CronJob[]>('/api/automation/cron-jobs');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'وظائف الجدولة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="timer-outline" title="لا توجد وظائف مجدولة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', flex: 1 }}>{item.name ?? ''}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.enabled ? '#22c55e' : '#ef4444' }} />
            </View>
            {!!item.schedule && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2, fontFamily: 'monospace' }}>{item.schedule}</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {!!item.lastRun && <Text style={{ color: c.textFaint, fontSize: 12 }}>آخر تشغيل: {new Date(item.lastRun).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })}</Text>}
              {!!item.status && <Text style={{ color: c.brand, fontSize: 12 }}>{item.status}</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
