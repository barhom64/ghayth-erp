import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UnmappedLine {
  id?: number;
  accountCode?: string;
  accountName?: string;
  sourceType?: string;
  amount?: number;
  createdAt?: string;
}

export default function UnmappedLinesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UnmappedLine[]>('/api/finance/reports/unmapped-lines');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل السطور غير المعيّنة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سطور القيود غير المعيّنة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد سطور غير معيّنة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.text }}>{item.accountCode ?? '—'} — {item.accountName ?? '—'}</Text>
              {item.amount != null ? (
                <Text style={{ fontSize: 13, color: c.textMuted }}>{Number(item.amount).toLocaleString('ar-SA')} ر.س</Text>
              ) : null}
            </View>
            {item.sourceType ? (
              <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 4, textAlign: 'right' }}>{item.sourceType}</Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
