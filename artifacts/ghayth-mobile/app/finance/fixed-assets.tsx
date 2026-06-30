/**
 * الأصول الثابتة
 * GET /api/finance/fixed-assets
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FixedAsset {
  id: number;
  assetCode?: string;
  name?: string;
  category?: string;
  purchaseDate?: string;
  purchaseValue?: number;
  netBookValue?: number;
  currency?: string;
  status?: string;
  location?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function FixedAssetsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<FixedAsset[]>('/api/finance/fixed-assets');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأصول…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأصول الثابتة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="business-outline" title="لا توجد أصول" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/finance/fixed-asset-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, flex: 1 }}>
                {item.assetCode ? (
                  <Text style={{ fontSize: 11, color: c.brand }}>{item.assetCode}</Text>
                ) : null}
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', flex: 1 }}>{item.name ?? '—'}</Text>
              </View>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.category ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 6 }}>{item.category}</Text>
            ) : null}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: c.textMuted }}>الكلفة</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>
                  {(item.purchaseValue ?? 0).toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 11, color: c.textMuted }}>القيمة الدفترية</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>
                  {(item.netBookValue ?? 0).toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
