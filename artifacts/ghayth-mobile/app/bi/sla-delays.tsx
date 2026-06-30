import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SlaDelay { process?: string; avgDelayHours?: number; count?: number; severity?: string; }

export default function SlaDelaysScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SlaDelay[]>('/api/bi/operations/sla-delays');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تأخيرات SLA' }} />
      <FlatList data={list} keyExtractor={(item, i) => `${item.process}-${i}`}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد تأخيرات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.process ?? '-'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>متوسط التأخر: {item.avgDelayHours ?? 0} ساعة | العدد: {item.count ?? 0}</Text>
          </View>
        )}
      />
    </View>
  );
}
