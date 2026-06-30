import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Breakdown {
  id?: number;
  description?: string;
  status?: string;
  reportedAt?: string;
  resolvedAt?: string;
  vehiclePlate?: string;
  location?: string;
}

export default function MeBreakdownsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Breakdown[]>('/api/fleet/me/breakdowns');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل بلاغات الأعطال…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const statusColor = (s?: string) => s === 'resolved' ? '#22C55E' : s === 'pending' ? '#F59E0B' : '#9CA3AF';
  const statusLabel = (s?: string) => s === 'resolved' ? 'محلول' : s === 'pending' ? 'معلق' : s ?? '—';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'بلاغات أعطالي' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="construct-outline" title="لا توجد أعطال" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>
                {item.description ?? '—'}
              </Text>
              <Text style={{ fontSize: 11, color: statusColor(item.status) }}>{statusLabel(item.status)}</Text>
            </View>
            {item.vehiclePlate ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.vehiclePlate}</Text>
            ) : null}
            {item.location ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2, textAlign: 'right' }}>{item.location}</Text>
            ) : null}
            {item.reportedAt ? (
              <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>
                {new Date(item.reportedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
