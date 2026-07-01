import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LedgerEntry { id?: number; date?: string; description?: string; debit?: number; credit?: number; balance?: number; }

export default function LedgerAccount() {
  const c = useColors();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { data, isLoading, isError, refetch } = useList<LedgerEntry[]>(`/api/finance/ledger/${code ?? ''}`);
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل كشف الحساب…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `كشف حساب ${code ?? ''}` }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد قيود" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 13 }}>{item.description ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.date ? new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</Text>
              <Text style={{ color: (item.debit ?? 0) > 0 ? '#22c55e' : c.textMuted, fontSize: 12 }}>مدين: {(item.debit ?? 0).toLocaleString('ar-SA')} ر.س</Text>
              <Text style={{ color: (item.credit ?? 0) > 0 ? '#ef4444' : c.textMuted, fontSize: 12 }}>دائن: {(item.credit ?? 0).toLocaleString('ar-SA')} ر.س</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
