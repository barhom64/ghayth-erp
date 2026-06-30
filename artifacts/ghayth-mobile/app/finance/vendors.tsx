/**
 * الموردون (المالية)
 * GET /api/finance/vendors
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinanceVendor {
  id: number;
  name?: string;
  taxNumber?: string;
  category?: string;
  contactName?: string;
  phone?: string;
  outstandingBalance?: number;
  currency?: string;
  status?: string;
}

export default function VendorsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<FinanceVendor[]>('/api/finance/vendors');
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
            onPress={() => router.push({ pathname: '/finance/vendor-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.category ? <Text style={{ fontSize: 12, color: c.brand }}>{item.category}</Text> : null}
              {item.taxNumber ? <Text style={{ fontSize: 11, color: c.textFaint }}>رقم ضريبي: {item.taxNumber}</Text> : null}
            </View>
            {item.outstandingBalance != null ? (
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444', textAlign: 'right', marginTop: 4 }}>
                المستحق: {item.outstandingBalance.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
