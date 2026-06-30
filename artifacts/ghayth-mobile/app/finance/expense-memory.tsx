import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExpenseMemory {
  id?: number;
  description?: string;
  amount?: number;
  category?: string;
  supplier?: string;
  usedCount?: number;
}

export default function FinanceExpenseMemoryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExpenseMemory[]>('/api/finance-memory/expense-memory');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل ذاكرة المصروفات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ذاكرة المصروفات' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="file-tray-outline" title="لا توجد بيانات مخزّنة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.description ?? '—'}</Text>
              {item.amount != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand }}>{item.amount.toLocaleString('ar-SA')} ر.س</Text> : null}
            </View>
            {item.category ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.category}</Text> : null}
            {item.supplier ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.supplier}</Text> : null}
            {item.usedCount != null ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>استُخدم {item.usedCount} مرة</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
