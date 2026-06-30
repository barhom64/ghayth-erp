/**
 * الأرقام التسلسلية
 * GET /api/warehouse/serials
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SerialItem {
  id: number;
  serialNumber?: string;
  productName?: string;
  warehouseName?: string;
  status?: string;
  assignedTo?: string;
  purchaseDate?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function SerialsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SerialItem[]>('/api/warehouse/serials');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الأرقام التسلسلية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الأرقام التسلسلية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد أرقام تسلسلية" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.serialNumber ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.productName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.warehouseName ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.warehouseName}</Text> : null}
              {item.assignedTo ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.assignedTo}</Text> : null}
              {item.purchaseDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.purchaseDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
