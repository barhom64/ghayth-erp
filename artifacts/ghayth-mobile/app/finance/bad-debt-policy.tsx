import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface BadDebtPolicy {
  policy?: string;
  thresholds?: Array<{ agingDays: number; provisionRate: number }>;
  lastUpdated?: string;
  notes?: string;
}

export default function FinanceBadDebtPolicyScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<BadDebtPolicy>('/api/finance/bad-debt/policy');
  const d = (data && !Array.isArray(data)) ? data as BadDebtPolicy : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل سياسة الديون المعدومة…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سياسة الديون المعدومة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {d?.policy ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 4 }}>نوع السياسة</Text>
            <Text style={{ fontSize: 15, fontWeight: '600', color: c.text, textAlign: 'right' }}>{d.policy}</Text>
          </View>
        ) : null}
        {d?.thresholds && d.thresholds.length > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: c.text, textAlign: 'right', marginBottom: 8 }}>حدود الأعمار ونسب المخصّص</Text>
            {d.thresholds.map((t, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.border }}>
                <Text style={{ fontSize: 13, color: c.text }}>{t.agingDays} يوم</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: c.brand }}>{(t.provisionRate * 100).toFixed(0)}%</Text>
              </View>
            ))}
          </View>
        ) : null}
        {d?.notes ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 4 }}>ملاحظات</Text>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{d.notes}</Text>
          </View>
        ) : null}
        {d?.lastUpdated ? (
          <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'center' }}>
            آخر تحديث: {new Date(d.lastUpdated).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
