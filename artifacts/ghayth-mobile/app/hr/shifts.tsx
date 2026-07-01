import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Shift { id?: number; name?: string; startTime?: string; endTime?: string; type?: string; }

export default function Shifts() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Shift[]>('/api/hr/shifts');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل الوردات…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الوردات' }} />
      <FlatList
        data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد وردات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.name ?? '—'}</Text>
            <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4 }}>{item.startTime ?? ''} — {item.endTime ?? ''} · {item.type ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
