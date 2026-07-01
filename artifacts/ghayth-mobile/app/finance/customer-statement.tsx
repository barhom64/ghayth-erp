import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface StatementLine { id?: number; date?: string; description?: string; debit?: number; credit?: number; balance?: number; }

export default function CustomerStatement() {
  const c = useColors();
  const { clientId } = useLocalSearchParams<{ clientId: string }>();
  const { data, isLoading, isError, refetch } = useList<StatementLine[]>(`/api/finance/reports/customer-statement/${clientId}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كشف حساب العميل' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد حركات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 13 }}>{item.description ?? ''}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
              {item.date && <Text style={{ color: c.textMuted, fontSize: 11 }}>{new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
              <Text style={{ color: c.text, fontSize: 13, fontWeight: '600' }}>{(item.balance ?? 0).toLocaleString('ar-SA')} ر.س</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
