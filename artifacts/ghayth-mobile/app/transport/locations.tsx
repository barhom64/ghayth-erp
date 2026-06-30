import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TransportLocation {
  id: number;
  name?: string;
  locationType?: string;
  address?: string;
  city?: string;
  isActive?: boolean;
}

export default function TransportLocationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TransportLocation[]>('/api/transport/locations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المواقع…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مواقع النقل' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="location-outline" title="لا توجد مواقع" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.locationType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.locationType}</Text> : null}
              {item.city ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.city}</Text> : null}
              {item.address ? <Text style={{ fontSize: 11, color: c.textFaint }} numberOfLines={1}>{item.address}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
