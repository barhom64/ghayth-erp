import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LegalFinancialRow {
  caseId?: number;
  caseNumber?: string;
  caseName?: string;
  claimAmount?: number;
  awardedAmount?: number;
  lawyerFees?: number;
  courtFees?: number;
  outcome?: string;
}

export default function LegalFinancialReportScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LegalFinancialRow[]>('/api/legal/financial-report');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التقرير المالي للقضايا…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التقرير المالي للقضايا' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.caseId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-text-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.caseName ?? item.caseNumber ?? '—'}</Text>
              {item.outcome ? <Text style={{ fontSize: 12, color: item.outcome === 'won' ? '#22C55E' : '#EF4444' }}>{item.outcome === 'won' ? 'فاز' : 'خسر'}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>المطالبة: {(item.claimAmount ?? 0).toLocaleString('ar-SA')}</Text>
              {item.awardedAmount != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>المحكوم: {item.awardedAmount.toLocaleString('ar-SA')}</Text> : null}
              <Text style={{ fontSize: 11, color: '#EF4444' }}>أتعاب: {(item.lawyerFees ?? 0).toLocaleString('ar-SA')}</Text>
            </View>
          </View>
        )}
      />
    </View>
  );
}
