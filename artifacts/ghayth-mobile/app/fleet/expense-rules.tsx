import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExpenseRule {
  id: number;
  name?: string;
  category?: string;
  maxAmount?: number;
  currency?: string;
  requiresApproval?: boolean;
  isActive?: boolean;
}

export default function ExpenseRulesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExpenseRule[]>('/api/fleet/expense-rules');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل قواعد المصروفات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قواعد مصروفات الأسطول' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد قواعد مصروفات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, opacity: item.isActive === false ? 0.5 : 1 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.name ?? '—'}</Text>
              {item.isActive === false ? <Text style={{ fontSize: 11, color: c.textFaint }}>غير نشط</Text> : <Text style={{ fontSize: 11, color: '#22C55E' }}>نشط</Text>}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.category ? <Text style={{ fontSize: 11, color: c.brand }}>{item.category}</Text> : null}
              {item.maxAmount != null ? <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>الحد: {item.maxAmount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
              {item.requiresApproval ? <Text style={{ fontSize: 11, color: '#F59E0B' }}>يستلزم موافقة</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
