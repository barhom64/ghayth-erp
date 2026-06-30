/**
 * العقارات
 * GET /api/properties
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Property {
  id: number;
  name?: string;
  propertyType?: string;
  city?: string;
  district?: string;
  unitCount?: number;
  occupiedCount?: number;
  status?: string;
  ownerName?: string;
}

export default function PropertiesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Property[]>('/api/properties');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل العقارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'العقارات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="home-outline" title="لا توجد عقارات" description="" />}
        renderItem={({ item }) => {
          const occupancyPct = item.unitCount ? Math.round(((item.occupiedCount ?? 0) / item.unitCount) * 100) : 0;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/properties/property-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {item.propertyType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.propertyType}</Text> : null}
                {item.city ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.city}</Text> : null}
                {item.district ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.district}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Text style={{ fontSize: 11, color: c.textFaint }}>{item.occupiedCount ?? 0}/{item.unitCount ?? 0} وحدة مشغولة</Text>
                <View style={{ flex: 1, height: 4, backgroundColor: c.border, borderRadius: 2 }}>
                  <View style={{ height: 4, width: `${occupancyPct}%` as never, backgroundColor: '#22C55E', borderRadius: 2 }} />
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
