/**
 * باقات العمرة
 * GET /api/umrah/packages
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahPackage {
  id: number;
  name?: string;
  type?: string;
  durationDays?: number;
  price?: number;
  currency?: string;
  hotelCategory?: string;
  includesVisa?: boolean;
  includesTransport?: boolean;
  status?: string;
}

export default function UmrahPackagesScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<UmrahPackage[]>('/api/umrah/packages');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الباقات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'باقات العمرة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="star-outline" title="لا توجد باقات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/umrah/package-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 6 }}>
              {item.type ? <Text style={{ fontSize: 12, color: c.brand }}>{item.type}</Text> : null}
              {item.hotelCategory ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.hotelCategory}</Text> : null}
              {item.durationDays != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.durationDays} يوم</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              {item.price != null ? (
                <Text style={{ fontSize: 15, fontWeight: '700', color: c.brand }}>
                  {item.price.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              ) : null}
              <View style={{ flexDirection: 'row-reverse', gap: 6 }}>
                {item.includesVisa ? <Text style={{ fontSize: 11, color: '#22C55E' }}>✓ تأشيرة</Text> : null}
                {item.includesTransport ? <Text style={{ fontSize: 11, color: '#22C55E' }}>✓ نقل</Text> : null}
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
