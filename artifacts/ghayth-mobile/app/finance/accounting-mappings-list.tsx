import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AccountingMapping { operationType?: string; debitAccount?: string; creditAccount?: string; description?: string; }

export default function AccountingMappingsListScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AccountingMapping[]>('/api/finance/accounting-mappings');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'خرائط الترحيل المحاسبي' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.operationType ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-merge-outline" title="لا توجد خرائط" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.operationType ?? ''}</Text>
            {!!item.debitAccount && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>مدين: {item.debitAccount}</Text>}
            {!!item.creditAccount && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>دائن: {item.creditAccount}</Text>}
          </View>
        )}
      />
    </View>
  );
}
