/**
 * حركات المخزون
 * GET /api/warehouse/movements
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface StockMovement {
  id: number;
  productName?: string;
  movementType?: string;
  quantity?: number;
  unit?: string;
  warehouseName?: string;
  reference?: string;
  movedAt?: string;
  createdBy?: string;
}

const TYPE_COLOR: Record<string, string> = {
  in: '#22C55E',
  out: '#EF4444',
  transfer: '#3B82F6',
  adjustment: '#F59E0B',
};

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function StockMovementsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<StockMovement[]>('/api/warehouse/movements');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحركات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حركات المخزون' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="swap-vertical-outline" title="لا توجد حركات" description="" />}
        renderItem={({ item }) => {
          const typeColor = TYPE_COLOR[item.movementType ?? ''] ?? '#94A3B8';
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/warehouse/movement-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}
            >
              <View style={{ width: 4, backgroundColor: typeColor, borderRadius: 2, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.productName ?? '—'}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: typeColor }}>{item.quantity ?? 0} {item.unit ?? ''}</Text>
                </View>
                <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                  {item.warehouseName ? <Text style={{ fontSize: 12, color: c.brand }}>{item.warehouseName}</Text> : null}
                  {item.reference ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.reference}</Text> : null}
                  {item.movedAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.movedAt)}</Text> : null}
                </View>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
