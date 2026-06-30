import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MisparentedSubsidiary {
  id?: number;
  accountCode?: string;
  accountName?: string;
  currentParentCode?: string;
  suggestedParentCode?: string;
  reason?: string;
}

export default function FinanceDatafixSubsidiariesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MisparentedSubsidiary[]>('/api/finance/datafix/misparented-subsidiaries');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الحسابات المخطوءة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الحسابات الفرعية المخطوءة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد حسابات مخطوءة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.accountName ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.brand }}>{item.accountCode ?? '—'}</Text>
            </View>
            {(item.currentParentCode || item.suggestedParentCode) ? (
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 6 }}>
                {item.currentParentCode ? (
                  <Text style={{ fontSize: 11, color: '#EF4444' }}>حالي: {item.currentParentCode}</Text>
                ) : null}
                {item.suggestedParentCode ? (
                  <Text style={{ fontSize: 11, color: '#22C55E' }}>مقترح: {item.suggestedParentCode}</Text>
                ) : null}
              </View>
            ) : null}
            {item.reason ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 4, textAlign: 'right' }}>{item.reason}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
