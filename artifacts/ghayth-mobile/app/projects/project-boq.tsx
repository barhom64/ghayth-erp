import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BoqItem {
  id?: number;
  description?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  completedQty?: number;
}

export default function ProjectBoqScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<BoqItem[]>('/api/projects/0/boq');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل جدول الكميات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'جدول الكميات (BOQ)' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="list-outline" title="لا توجد بنود" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text, flex: 1 }} numberOfLines={1}>{item.description ?? '—'}</Text>
              <Text style={{ fontSize: 13, color: c.brand, fontWeight: '600' }}>
                {Number(item.totalPrice ?? 0).toLocaleString('ar-SA')} ر.س
              </Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>الكمية: {item.quantity ?? 0} {item.unit ?? ''}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>سعر الوحدة: {Number(item.unitPrice ?? 0).toLocaleString('ar-SA')}</Text>
              {item.completedQty != null ? (
                <Text style={{ fontSize: 12, color: '#22C55E' }}>منجز: {item.completedQty}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
