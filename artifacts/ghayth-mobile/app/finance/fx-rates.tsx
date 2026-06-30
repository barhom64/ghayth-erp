/**
 * أسعار الصرف
 * GET /api/finance/fx/rates
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface FxRate {
  id: number;
  fromCurrency?: string;
  toCurrency?: string;
  rate?: number;
  inverseRate?: number;
  effectiveDate?: string;
  source?: string;
  isManual?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

const CURRENCY_FLAG: Record<string, string> = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', SAR: '🇸🇦',
  AED: '🇦🇪', KWD: '🇰🇼', BHD: '🇧🇭', QAR: '🇶🇦',
  EGP: '🇪🇬', JOD: '🇯🇴', OMR: '🇴🇲',
};

export default function FxRatesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<FxRate[]>('/api/finance/fx/rates');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أسعار الصرف…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أسعار الصرف' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="barcode-outline" title="لا توجد أسعار صرف" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 16 }}>{CURRENCY_FLAG[item.fromCurrency ?? ''] ?? '💱'}</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.fromCurrency ?? '—'}</Text>
                <Text style={{ color: c.textMuted }}>/</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.toCurrency ?? '—'}</Text>
                <Text style={{ fontSize: 16 }}>{CURRENCY_FLAG[item.toCurrency ?? ''] ?? ''}</Text>
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                {item.source ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.source}</Text> : null}
                {item.isManual ? <Text style={{ fontSize: 11, color: '#F59E0B' }}>يدوي</Text> : null}
                {item.effectiveDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.effectiveDate)}</Text> : null}
              </View>
            </View>
            <View style={{ alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: c.brand }}>
                {item.rate?.toFixed(4) ?? '—'}
              </Text>
              {item.inverseRate != null ? (
                <Text style={{ fontSize: 11, color: c.textFaint }}>↔ {item.inverseRate.toFixed(4)}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
