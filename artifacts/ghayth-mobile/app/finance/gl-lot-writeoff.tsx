import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LotWriteoffItem {
  id?: number;
  lotNumber?: string;
  productName?: string;
  warehouseId?: number;
  status?: string;
  qty?: string;
  costValue?: string;
  expiresAt?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function GlLotWriteoffScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LotWriteoffItem[]>('/api/gl-helpers/lot-writeoff/pending');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل شطب الدُفعات المعلّق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'شطب دُفعات — معلّق' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="trash-outline" title="لا توجد دُفعات معلّقة للشطب" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: 3, borderRightColor: '#EF4444', padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.productName ?? item.lotNumber ?? '—'}</Text>
              {item.costValue ? <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{parseFloat(item.costValue).toLocaleString('ar-SA')} ر.س</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.lotNumber ? <Text style={{ fontSize: 11, color: c.textMuted }}>دُفعة: {item.lotNumber}</Text> : null}
              {item.status ? <Text style={{ fontSize: 11, color: c.brand }}>{item.status}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textFaint }}>انتهاء: {fmtDate(item.expiresAt)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
