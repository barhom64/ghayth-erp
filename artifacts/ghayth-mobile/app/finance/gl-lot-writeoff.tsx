import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LotWriteoff { id?: number; itemName?: string; quantity?: number; writeoffAmount?: number; reason?: string; }

export default function GlLotWriteoffScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LotWriteoff[]>('/api/finance/gl-helpers/lot-writeoff/pending');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إشعارات شطب الوجبات — معلّقة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد إشعارات معلّقة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.itemName ?? String(item.id ?? '')}</Text>
            {item.quantity != null && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>الكمية: {item.quantity}</Text>}
            {item.writeoffAmount != null && <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 2 }}>{item.writeoffAmount.toLocaleString('ar-SA')} ر.س</Text>}
          </View>
        )}
      />
    </View>
  );
}
