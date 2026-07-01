import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExpenseMemory { id?: number; description?: string; category?: string; amount?: number; lastUsed?: string; }

export default function ExpenseMemoryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExpenseMemory[]>('/api/finance/expense-memory');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ذاكرة المصروفات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد بيانات مصروفات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.description ?? String(item.id ?? '')}</Text>
            {!!item.category && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.category}</Text>}
            {item.amount != null && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text>}
          </View>
        )}
      />
    </View>
  );
}
