import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Hotel {
  id: number;
  name?: string;
  city?: string;
  starRating?: number;
  distanceToHaram?: number;
  status?: string;
}

export default function HotelsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Hotel[]>('/api/umrah-accommodation/hotels');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الفنادق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الفنادق' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد فنادق" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              {item.starRating != null ? <Text style={{ fontSize: 12, color: '#F59E0B' }}>{'★'.repeat(item.starRating)}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.city ? <Text style={{ fontSize: 12, color: c.brand }}>{item.city}</Text> : null}
              {item.distanceToHaram != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.distanceToHaram} م من الحرم</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
