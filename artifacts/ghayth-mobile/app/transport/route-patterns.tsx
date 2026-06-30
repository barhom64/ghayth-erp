import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RoutePattern {
  id: number;
  name?: string;
  originName?: string;
  destinationName?: string;
  estimatedMinutes?: number;
  distanceKm?: number;
  isActive?: boolean;
}

export default function RoutePatternsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RoutePattern[]>('/api/transport/route-patterns');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أنماط المسارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أنماط المسارات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="layers-outline" title="لا توجد أنماط مسارات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.isActive ? '#22C55E' : '#9CA3AF' }} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.originName ? <Text style={{ fontSize: 12, color: c.brand }}>{item.originName}</Text> : null}
              {item.destinationName ? <Text style={{ fontSize: 12, color: c.textMuted }}>← {item.destinationName}</Text> : null}
              {item.distanceKm != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.distanceKm} كم</Text> : null}
              {item.estimatedMinutes != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.estimatedMinutes} دقيقة</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
