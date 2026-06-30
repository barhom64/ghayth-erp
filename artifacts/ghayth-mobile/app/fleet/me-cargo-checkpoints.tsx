import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Checkpoint { id?: number; location?: string; status?: string; arrivedAt?: string; }

export default function MeCargoCheckpoints() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Checkpoint[]>('/api/fleet/me/cargo/0/checkpoints');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نقاط تفتيش شحنتي' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="location-outline" title="لا توجد نقاط تفتيش" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.location ?? '—'}</Text>
            <Text style={{ color: item.status === 'passed' ? '#22c55e' : c.textMuted, fontSize: 12 }}>{item.status === 'passed' ? 'مرّ' : item.status ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
