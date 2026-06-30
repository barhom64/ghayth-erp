import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CustodySummary {
  employeeId?: number;
  employeeName?: string;
  totalIssued?: number;
  totalSettled?: number;
  outstanding?: number;
  currency?: string;
}

export default function CustodiesSummaryScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CustodySummary[]>('/api/custodies/summary');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل ملخص العُهد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملخص العُهد' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="briefcase-outline" title="لا توجد عُهد" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text }}>{item.employeeName ?? '—'}</Text>
              {item.outstanding != null ? <Text style={{ fontSize: 13, fontWeight: '700', color: (item.outstanding ?? 0) > 0 ? '#F59E0B' : '#22C55E' }}>{item.outstanding.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.totalIssued != null ? <Text style={{ fontSize: 11, color: c.textMuted }}>صرف: {item.totalIssued.toLocaleString('ar-SA')}</Text> : null}
              {item.totalSettled != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>تسوية: {item.totalSettled.toLocaleString('ar-SA')}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
