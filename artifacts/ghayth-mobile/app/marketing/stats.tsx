import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MarketingStats {
  totalCampaigns?: number;
  activeCampaigns?: number;
  totalBudget?: number;
  totalSpent?: number;
  totalRevenue?: number;
  roas?: string | null;
  sourceCounts?: { source?: string; count?: number }[];
  [key: string]: unknown;
}

export default function MarketingStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<MarketingStats>('/api/marketing/stats');
  const d = (data && !Array.isArray(data)) ? data as MarketingStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات التسويق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const roasColor = parseFloat(d?.roas ?? '0') >= 2 ? '#22C55E' : parseFloat(d?.roas ?? '0') >= 1 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات التسويق' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {/* ROAS */}
        {d?.roas ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: roasColor }}>
            <Text style={{ fontSize: 48, fontWeight: '700', color: roasColor }}>{d.roas}x</Text>
            <Text style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>العائد على الإنفاق الإعلاني</Text>
          </View>
        ) : null}
        {/* Key metrics */}
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 12 }}>
          {[
            { label: 'حملات نشطة', value: String(d?.activeCampaigns ?? 0), color: '#22C55E' },
            { label: 'إجمالي الحملات', value: String(d?.totalCampaigns ?? 0), color: c.text },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 28, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
            </View>
          ))}
        </View>
        {/* Budget vs Revenue */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>الميزانية والإيرادات</Text>
          {[
            { label: 'الميزانية', value: d?.totalBudget ?? 0, color: c.text },
            { label: 'المنفق', value: d?.totalSpent ?? 0, color: '#F59E0B' },
            { label: 'الإيرادات', value: d?.totalRevenue ?? 0, color: '#22C55E' },
          ].map(m => (
            <View key={m.label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{m.label}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: m.color }}>{m.value.toLocaleString('ar-SA')} ر.س</Text>
            </View>
          ))}
        </View>
        {/* Source counts */}
        {d?.sourceCounts && d.sourceCounts.length > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>مصادر الفرص</Text>
            {d.sourceCounts.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 }}>
                <Text style={{ fontSize: 12, color: c.text }}>{s.source}</Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{s.count}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
