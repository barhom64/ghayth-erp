import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OwnerStatement { ownerId?: number; ownerName?: string; totalRevenue?: number; totalExpenses?: number; netIncome?: number; }

export default function OwnerStatementScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OwnerStatement>('/api/properties/owners/0/statement');
  const d = (data && !Array.isArray(data)) ? data as OwnerStatement : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  if (!d) return <GEmptyState icon="clipboard-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'كشف حساب المالك' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>المالك</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{d.ownerName ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>إجمالي الإيرادات</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.totalRevenue != null ? d.totalRevenue.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>إجمالي المصروفات</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.totalExpenses != null ? d.totalExpenses.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>صافي الدخل</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>
            {d.netIncome != null ? d.netIncome.toLocaleString('ar-SA') + ' ر.س' : '—'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}
