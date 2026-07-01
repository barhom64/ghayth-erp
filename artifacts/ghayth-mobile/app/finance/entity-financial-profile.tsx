import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Profile { entityType?: string; entityId?: number; totalRevenue?: number; totalExpenses?: number; netProfit?: number; }

export default function EntityFinancialProfileScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Profile>('/api/finance/entity-financial-profile');
  const info = (data && !Array.isArray(data)) ? data as Profile : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!info) return <GEmptyState icon="business-outline" title="لا توجد بيانات" description="" />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الملف المالي للكيان' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {[
          { label: 'إجمالي الإيرادات', value: info.totalRevenue, color: '#38a169' },
          { label: 'إجمالي المصروفات', value: info.totalExpenses, color: '#e53e3e' },
          { label: 'صافي الربح', value: info.netProfit, color: c.brand },
        ].map(row => (
          <View key={row.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16, marginBottom: 12 }}>
            <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>{row.label}</Text>
            <Text style={{ color: row.color, fontSize: 22, fontWeight: 'bold' }}>
              {row.value != null ? `${row.value.toLocaleString('ar-SA')} ر.س` : '-'}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
