import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DlqEvent {
  id?: number | string;
  eventType?: string;
  error?: string;
  retries?: number;
  createdAt?: string;
  payload?: unknown;
}

export default function EventDlqScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DlqEvent[]>('/api/admin/governance/event-dlq');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قائمة الأخطاء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قائمة أحداث الأخطاء' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد أخطاء" description="قائمة الأخطاء فارغة" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, borderRightWidth: 3, borderRightColor: '#EF4444' }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{item.eventType ?? '—'}</Text>
              {item.retries != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>محاولات: {item.retries}</Text> : null}
            </View>
            {item.error ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.error}</Text> : null}
            {item.createdAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>
                {new Date(item.createdAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
