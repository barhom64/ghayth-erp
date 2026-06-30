/**
 * مبيعات العقارات
 * GET /api/properties/sales
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PropertySale {
  id: number;
  propertyName?: string;
  unitNumber?: string;
  buyerName?: string;
  salePrice?: number;
  saleDate?: string;
  status?: string;
  commission?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function PropertySalesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PropertySale[]>('/api/properties/sales');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مبيعات العقارات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مبيعات العقارات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="home-outline" title="لا توجد مبيعات" description="" />}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>
                  {item.propertyName ?? '—'}{item.unitNumber ? ` — وحدة ${item.unitNumber}` : ''}
                </Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right' }}>{item.buyerName ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                {item.salePrice != null && (
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{item.salePrice.toLocaleString('ar-SA')} ر.س</Text>
                )}
                {item.saleDate && <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.saleDate)}</Text>}
                {item.commission != null && (
                  <Text style={{ fontSize: 11, color: '#22C55E' }}>عمولة: {item.commission}</Text>
                )}
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
});
