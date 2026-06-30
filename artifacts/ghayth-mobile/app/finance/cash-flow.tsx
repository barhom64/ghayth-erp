/**
 * التدفق النقدي
 * GET /api/finance/cash-flow
 */
import React, { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

type CashFlowTab = 'summary' | 'transactions';

interface CashFlowSummary {
  period?: string;
  openingBalance?: number;
  totalInflow?: number;
  totalOutflow?: number;
  closingBalance?: number;
  currency?: string;
}

interface CashTransaction {
  id: number;
  type?: string;
  description?: string;
  amount?: number;
  direction?: 'in' | 'out';
  category?: string;
  date?: string;
  account?: string;
  currency?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function CashFlowScreen() {
  const c = useColors();
  const [tab, setTab] = useState<CashFlowTab>('summary');

  const { data: summary, isLoading: loadS, refetch: refS } = useList<CashFlowSummary[]>('/api/finance/cash-flow/summary');
  const { data: txns, isLoading: loadT, refetch: refT } = useList<CashTransaction[]>('/api/finance/cash-flow');

  const summaryList = Array.isArray(summary) ? summary : [];
  const txnList = Array.isArray(txns) ? txns : [];

  const isLoading = tab === 'summary' ? loadS : loadT;
  const refetch = tab === 'summary' ? refS : refT;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التدفق النقدي' }} />
      <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border }}>
        {([['summary', 'الملخص'], ['transactions', 'المعاملات']] as [CashFlowTab, string][]).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: tab === key ? c.brand : 'transparent' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === key ? c.brand : c.textMuted }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : tab === 'summary' ? (
        <FlatList
          data={summaryList}
          keyExtractor={(item, i) => item.period ?? String(i)}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="trending-up-outline" title="لا توجد بيانات" description="" />}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}>
              {item.period ? <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 12 }}>{item.period}</Text> : null}
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>الرصيد الافتتاحي</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{(item.openingBalance ?? 0).toLocaleString('ar-SA')}</Text>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>الرصيد الختامي</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>{(item.closingBalance ?? 0).toLocaleString('ar-SA')}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>واردات</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#22C55E' }}>+{(item.totalInflow ?? 0).toLocaleString('ar-SA')}</Text>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>صادرات</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>-{(item.totalOutflow ?? 0).toLocaleString('ar-SA')}</Text>
                </View>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={txnList}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<GEmptyState icon="swap-horizontal-outline" title="لا توجد معاملات" description="" />}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}>
              <View style={{ width: 4, backgroundColor: item.direction === 'in' ? '#22C55E' : '#EF4444', borderRadius: 2, alignSelf: 'stretch' }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.description ?? '—'}</Text>
                {item.category ? <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right' }}>{item.category}</Text> : null}
                <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                  {item.amount != null ? (
                    <Text style={{ fontSize: 13, fontWeight: '700', color: item.direction === 'in' ? '#22C55E' : '#EF4444' }}>
                      {item.direction === 'in' ? '+' : '-'}{item.amount.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
                    </Text>
                  ) : null}
                  {item.date ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.date)}</Text> : null}
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}
