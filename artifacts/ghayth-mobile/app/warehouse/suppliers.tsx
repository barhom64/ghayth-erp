/**
 * الموردون
 * GET /api/warehouse/suppliers
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Supplier {
  id: number;
  name?: string;
  category?: string;
  contactName?: string;
  phone?: string;
  city?: string;
  country?: string;
  status?: string;
  totalOrders?: number;
}

export default function SuppliersScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Supplier[]>('/api/warehouse/suppliers');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الموردين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الموردون' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا يوجد موردون" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/warehouse/supplier-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.category ? <Text style={{ fontSize: 12, color: c.brand }}>{item.category}</Text> : null}
              {item.city ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.city}</Text> : null}
              {item.country ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.country}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 4 }}>
              {item.contactName ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.contactName}</Text> : null}
              {item.totalOrders != null ? <Text style={{ fontSize: 11, color: c.textFaint }}>{item.totalOrders} طلب</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
