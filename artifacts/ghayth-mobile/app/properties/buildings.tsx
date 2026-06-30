/**
 * المباني
 * GET /api/properties/buildings
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Building {
  id: number;
  name?: string;
  address?: string;
  city?: string;
  floorCount?: number;
  unitCount?: number;
  occupiedCount?: number;
  status?: string;
}

export default function BuildingsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Building[]>('/api/properties/buildings');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المباني…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المباني' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد مباني" description="" />}
        renderItem={({ item }) => {
          const pct = item.unitCount && item.unitCount > 0 ? Math.min(100, Math.round(((item.occupiedCount ?? 0) / item.unitCount) * 100)) : 0;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/properties/building-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 6 }}>
                {item.city ? <Text style={{ fontSize: 12, color: c.brand }}>{item.city}</Text> : null}
                {item.floorCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.floorCount} طابق</Text> : null}
                {item.unitCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.occupiedCount ?? 0}/{item.unitCount} وحدة</Text> : null}
              </View>
              {item.unitCount ? (
                <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: 4, width: `${pct}%` as never, backgroundColor: c.brand, borderRadius: 2 }} />
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}
