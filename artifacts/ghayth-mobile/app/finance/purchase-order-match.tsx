import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MatchData { orderId?: number; invoiceId?: number; matchedAmount?: number; variance?: number; status?: string; }

export default function PurchaseOrderMatchScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MatchData>('/api/finance/purchase-orders/0/match');
  const d = (data && !Array.isArray(data)) ? data as MatchData : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="checkmark-circle-outline" title="لا توجد بيانات مطابقة" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مطابقة أمر الشراء' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>المبلغ المطابق</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.matchedAmount != null ? d.matchedAmount.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الفارق</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.variance != null ? d.variance.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الحالة</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.status ?? '—'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
