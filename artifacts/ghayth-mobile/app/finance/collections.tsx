/**
 * التحصيلات
 * GET /api/finance/collections
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Collection {
  id: number;
  collectionNumber?: string;
  clientName?: string;
  amount?: number;
  currency?: string;
  collectionDate?: string;
  method?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function CollectionsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Collection[]>('/api/finance/collections');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التحصيلات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التحصيلات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="wallet-outline" title="لا توجد تحصيلات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/collection-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.collectionNumber ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <Text style={{ fontSize: 13, color: c.brand, textAlign: 'right', marginBottom: 4 }}>{item.clientName ?? '—'}</Text>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>
              {(item.amount ?? 0).toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
            </Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.method ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.method}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textMuted }}>{fmtDate(item.collectionDate)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
