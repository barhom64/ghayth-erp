import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CrmModuleDashboard {
  opportunities?: { total?: number; open?: number; won?: number; lost?: number; totalValue?: number; wonValue?: number };
  contacts?: { total?: number };
  activities?: { total?: number; completed?: number; pending?: number };
  pipeline?: { name?: string; count?: number; value?: number }[];
  [key: string]: unknown;
}

export default function CrmModuleDashboardScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<CrmModuleDashboard>('/api/module-dashboards/crm');
  const d = (data && !Array.isArray(data)) ? data as CrmModuleDashboard : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل لوحة CRM…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const winRate = (d?.opportunities?.won ?? 0) + (d?.opportunities?.lost ?? 0) > 0
    ? Math.round(((d?.opportunities?.won ?? 0) / ((d?.opportunities?.won ?? 0) + (d?.opportunities?.lost ?? 0))) * 100)
    : 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'لوحة CRM' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {/* Opportunities */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>الفرص</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            {[
              { label: 'مفتوحة', value: d?.opportunities?.open ?? 0, color: c.brand },
              { label: 'مُربَحة', value: d?.opportunities?.won ?? 0, color: '#22C55E' },
              { label: 'خاسرة', value: d?.opportunities?.lost ?? 0, color: '#EF4444' },
            ].map(m => (
              <View key={m.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 22, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted }}>{m.label}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 8 }}>
            <Text style={{ fontSize: 11, color: '#22C55E' }}>نسبة الربح: {winRate}%</Text>
            <Text style={{ fontSize: 11, color: c.textFaint }}>القيمة: {(d?.opportunities?.wonValue ?? 0).toLocaleString('ar-SA')} ر.س</Text>
          </View>
        </View>
        {/* Pipeline */}
        {d?.pipeline && d.pipeline.length > 0 ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>خط المبيعات</Text>
            {d.pipeline.map((stage, i) => (
              <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: i < d.pipeline!.length - 1 ? 1 : 0, borderBottomColor: c.border }}>
                <Text style={{ fontSize: 12, color: c.text, flex: 1, textAlign: 'right' }}>{stage.name ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: c.brand, marginHorizontal: 8 }}>{stage.count ?? 0}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted }}>{(stage.value ?? 0).toLocaleString('ar-SA')} ر.س</Text>
              </View>
            ))}
          </View>
        ) : null}
        {/* Activities */}
        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#22C55E' }}>{d?.activities?.completed ?? 0}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>أنشطة مكتملة</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#F59E0B' }}>{d?.activities?.pending ?? 0}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>أنشطة معلقة</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: c.brand }}>{d?.contacts?.total ?? 0}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted }}>جهات اتصال</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
