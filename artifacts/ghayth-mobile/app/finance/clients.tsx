/**
 * العملاء (مالية)
 * GET /api/clients
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FinanceClient {
  id: number;
  name?: string;
  clientNumber?: string;
  email?: string;
  phone?: string;
  city?: string;
  outstandingBalance?: number;
  currency?: string;
  status?: string;
}

export default function FinanceClientsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<FinanceClient[]>('/api/clients');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل العملاء…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'العملاء' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا يوجد عملاء" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/client-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              {item.clientNumber ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.clientNumber}</Text> : null}
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.city ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.city}</Text> : null}
              {item.phone ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.phone}</Text> : null}
            </View>
            {item.outstandingBalance != null && item.outstandingBalance > 0 ? (
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444', textAlign: 'right', marginTop: 4 }}>
                مستحق: {item.outstandingBalance.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
