import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OutboxStats {
  pending?: number;
  processing?: number;
  failed?: number;
  delivered?: number;
  dlqCount?: number;
}

export default function AdminEventOutboxStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<OutboxStats>('/api/events/outbox/stats');
  const d = (data && !Array.isArray(data)) ? data as OutboxStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصائيات صندوق الصادر…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصائيات صندوق الصادر' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {[
          { label: 'قيد الانتظار', value: String(d?.pending ?? 0) },
          { label: 'قيد المعالجة', value: String(d?.processing ?? 0) },
          { label: 'فاشلة', value: String(d?.failed ?? 0) },
          { label: 'مُسلَّمة', value: String(d?.delivered ?? 0) },
          { label: 'طابور الأخطاء (DLQ)', value: String(d?.dlqCount ?? 0) },
        ].map((row) => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14,
            flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 13, color: c.textMuted }}>{row.label}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text }}>{row.value}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
