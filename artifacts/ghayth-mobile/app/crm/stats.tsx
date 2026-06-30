import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CrmStats {
  totalClients?: number;
  activeClients?: number;
  totalOpportunities?: number;
  wonOpportunities?: number;
  lostOpportunities?: number;
  openLeads?: number;
  totalRevenue?: number;
  pipelineValue?: number;
  winRate?: number;
  avgDealSize?: number;
  [key: string]: unknown;
}

export default function CrmStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<CrmStats>('/api/crm/stats');
  const d = (data && !Array.isArray(data)) ? data as CrmStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات CRM…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const winRate = d?.winRate ?? 0;
  const winColor = winRate >= 60 ? '#22C55E' : winRate >= 40 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات CRM' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 12, padding: 20, alignItems: 'center', borderTopWidth: 4, borderTopColor: winColor }}>
          <Text style={{ fontSize: 48, fontWeight: '700', color: winColor }}>{winRate}%</Text>
          <Text style={{ fontSize: 14, color: c.textMuted, marginTop: 4 }}>معدل الفوز</Text>
          <Text style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>{d?.wonOpportunities ?? 0} من {d?.totalOpportunities ?? 0} فرصة</Text>
        </View>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
          {[
            { label: 'إجمالي العملاء', value: d?.totalClients ?? 0, color: c.text },
            { label: 'عملاء نشطون', value: d?.activeClients ?? 0, color: '#22C55E' },
            { label: 'عملاء محتملون', value: d?.openLeads ?? 0, color: '#F59E0B' },
            { label: 'فرص خسرنا', value: d?.lostOpportunities ?? 0, color: '#EF4444' },
          ].map(m => (
            <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
              <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
            </View>
          ))}
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: c.textMuted }}>قيمة الخط</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.brand }}>{(d?.pipelineValue ?? 0).toLocaleString('ar-SA')} ر.س</Text>
          </View>
          <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, color: c.textMuted }}>متوسط قيمة الصفقة</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: c.text }}>{(d?.avgDealSize ?? 0).toLocaleString('ar-SA')} ر.س</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
