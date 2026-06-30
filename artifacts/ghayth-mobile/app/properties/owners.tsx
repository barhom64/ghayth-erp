/**
 * الملاك
 * GET /api/properties/owners
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PropertyOwner {
  id: number;
  name?: string;
  phone?: string;
  email?: string;
  propertyCount?: number;
  unitCount?: number;
  nationalId?: string;
  status?: string;
}

export default function PropertyOwnersScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<PropertyOwner[]>('/api/properties/owners');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الملاك…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الملاك' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="person-circle-outline" title="لا يوجد ملاك" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/properties/owner-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.phone ? <Text style={{ fontSize: 12, color: c.brand }}>{item.phone}</Text> : null}
              {item.propertyCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.propertyCount} عقار</Text> : null}
              {item.unitCount != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.unitCount} وحدة</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
