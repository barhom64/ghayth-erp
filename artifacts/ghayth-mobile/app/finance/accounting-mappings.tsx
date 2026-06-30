import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AccountingMapping {
  id: number;
  operationType?: string;
  debitAccount?: string;
  creditAccount?: string;
  description?: string;
}

export default function AccountingMappingsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AccountingMapping[]>('/api/accounting-mappings');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تعيينات المحاسبة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تعيينات المحاسبة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="git-merge-outline" title="لا توجد تعيينات محاسبة" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.brand, textAlign: 'right', marginBottom: 4 }}>{item.operationType ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.debitAccount ? <Text style={{ fontSize: 12, color: '#EF4444' }}>مدين: {item.debitAccount}</Text> : null}
              {item.creditAccount ? <Text style={{ fontSize: 12, color: '#22C55E' }}>دائن: {item.creditAccount}</Text> : null}
            </View>
            {item.description ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 2 }} numberOfLines={1}>{item.description}</Text> : null}
          </Pressable>
        )}
      />
    </View>
  );
}
