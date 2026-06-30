import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SlaDelay {
  process?: string;
  avgDelayHours?: number;
  count?: number;
}

export default function BiOperationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SlaDelay[]>('/api/bi/operations/sla-delays');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تأخيرات SLA…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'تأخيرات SLA' }} />
      {list.map((item, i) => (
        <View key={i} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, marginBottom: 10, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.process ?? '—'}</Text>
          <View style={{ alignItems: 'flex-end', gap: 2 }}>
            {item.avgDelayHours != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{item.avgDelayHours.toFixed(1)} ساعة</Text> : null}
            {item.count != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.count} حالة</Text> : null}
          </View>
        </View>
      ))}
      {list.length === 0 ? <GEmptyState icon="timer-outline" title="لا توجد تأخيرات" description="" /> : null}
    </ScrollView>
  );
}
