import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FxRevaluationPending {
  id?: number;
  accountCode?: string;
  accountName?: string;
  currency?: string;
  originalAmount?: number;
  revaluedAmount?: number;
  gainLoss?: number;
  period?: string;
  status?: string;
}

export default function GlFxRevaluationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FxRevaluationPending[]>('/api/finance/gl-helpers/fx-revaluation/pending');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إعادة تقييم العملات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعادة تقييم العملات — معلقة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد قيود معلقة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.accountName ?? item.accountCode ?? '—'}</Text>
              <GStatusBadge status={item.status ?? 'pending'} />
            </View>
            {item.currency ? <Text style={{ fontSize: 12, color: c.brand, marginBottom: 4 }}>{item.currency}</Text> : null}
            {item.period ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.period}</Text> : null}
            {item.gainLoss != null ? (
              <Text style={{ fontSize: 13, fontWeight: '700', color: item.gainLoss >= 0 ? '#22C55E' : '#EF4444', marginTop: 4 }}>
                {item.gainLoss >= 0 ? '+' : ''}{item.gainLoss.toLocaleString('ar-SA')} ر.س
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
