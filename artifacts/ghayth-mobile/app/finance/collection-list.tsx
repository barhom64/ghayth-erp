import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CollectionItem { id?: number; clientName?: string; amount?: number; dueDate?: string; stage?: string; }

export default function CollectionListScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CollectionItem[]>('/api/finance/collection');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملفات التحصيل' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cash-outline" title="لا توجد ملفات تحصيل" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.clientName ?? String(item.id ?? '')}</Text>
            {item.amount != null && <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600', marginTop: 4 }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 6 }}>
              {!!item.stage && <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.stage}</Text>}
              {!!item.dueDate && <Text style={{ color: c.textFaint, fontSize: 12 }}>{new Date(item.dueDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
