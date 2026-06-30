import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LegalModuleDashboard {
  contracts?: { total?: number; active?: number; expiringSoon?: number; totalValue?: number };
  cases?: { total?: number; open?: number; inProgress?: number; highPriority?: number };
  upcomingSessions?: number;
  [key: string]: unknown;
}

export default function LegalModuleDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<LegalModuleDashboard>('/api/module-dashboards/legal');
  const d = (data && !Array.isArray(data)) ? data as LegalModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة القانونية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة القانونية' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {/* Contracts */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>العقود</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            {[
              { label: 'نشطة', value: d?.contracts?.active ?? 0, color: '#22C55E' },
              { label: 'تنتهي قريبًا', value: d?.contracts?.expiringSoon ?? 0, color: '#EF4444' },
              { label: 'الإجمالي', value: d?.contracts?.total ?? 0, color: c.brand },
            ].map(m => (
              <View key={m.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right', marginTop: 8 }}>
            القيمة الإجمالية: {(d?.contracts?.totalValue ?? 0).toLocaleString('ar-SA')} ر.س
          </Text>
        </View>
        {/* Cases */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>القضايا</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            {[
              { label: 'مفتوحة', value: d?.cases?.open ?? 0, color: '#F59E0B' },
              { label: 'قيد السير', value: d?.cases?.inProgress ?? 0, color: c.brand },
              { label: 'أولوية عالية', value: d?.cases?.highPriority ?? 0, color: '#EF4444' },
              { label: 'الإجمالي', value: d?.cases?.total ?? 0, color: c.text },
            ].map(m => (
              <View key={m.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* Upcoming sessions */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center', borderTopWidth: 3, borderTopColor: (d?.upcomingSessions ?? 0) > 0 ? '#F59E0B' : c.border }}>
          <Text style={{ fontSize: 32, fontWeight: '700', color: (d?.upcomingSessions ?? 0) > 0 ? '#F59E0B' : c.textMuted }}>{d?.upcomingSessions ?? 0}</Text>
          <Text style={{ fontSize: 13, color: c.textMuted }}>جلسة قادمة خلال 30 يومًا</Text>
        </View>
      </ScrollView>
    </View>
  );
}
