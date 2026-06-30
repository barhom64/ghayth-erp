import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PropertyStats {
  units?: { total?: number; available?: number; rented?: number; underMaintenance?: number };
  contracts?: { active?: number; expiring30?: number; expiring60?: number; expiring90?: number };
  revenue?: { totalCollected?: number; totalExpected?: number };
  monthlyRevenue?: { monthlyCollected?: number; monthlyExpected?: number };
  overdue?: { count?: number; overdueAmount?: number };
  maintenance?: { total?: number; openTickets?: number; criticalTickets?: number };
  [key: string]: unknown;
}

export default function PropertyStatsScreen() {
  const c = useColors();
  const { data, isLoading, isError } = useList<PropertyStats>('/api/properties/stats');
  const d = (data && !Array.isArray(data)) ? data as PropertyStats : null;

  if (isLoading) return <GLoadingState text="جارٍ تحميل إحصاءات الأملاك…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" />
  );

  const collectedPct = d?.revenue?.totalExpected
    ? Math.round(((d.revenue.totalCollected ?? 0) / d.revenue.totalExpected) * 100)
    : 0;
  const pctColor = collectedPct >= 80 ? '#22C55E' : collectedPct >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إحصاءات الأملاك' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
        {/* Units */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>الوحدات</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            {[
              { label: 'الإجمالي', value: d?.units?.total ?? 0, color: c.text },
              { label: 'متاحة', value: d?.units?.available ?? 0, color: '#22C55E' },
              { label: 'مؤجرة', value: d?.units?.rented ?? 0, color: c.brand },
              { label: 'صيانة', value: d?.units?.underMaintenance ?? 0, color: '#F59E0B' },
            ].map(m => (
              <View key={m.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* Collection */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, borderTopWidth: 4, borderTopColor: pctColor }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>التحصيل الإجمالي</Text>
          <Text style={{ fontSize: 32, fontWeight: '700', color: pctColor, textAlign: 'center' }}>{collectedPct}%</Text>
          <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'center' }}>
            {(d?.revenue?.totalCollected ?? 0).toLocaleString('ar-SA')} / {(d?.revenue?.totalExpected ?? 0).toLocaleString('ar-SA')} ر.س
          </Text>
        </View>
        {/* Contracts expiring */}
        <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 10 }}>انتهاء العقود</Text>
          <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
            {[
              { label: 'نشطة', value: d?.contracts?.active ?? 0, color: c.brand },
              { label: '30 يوم', value: d?.contracts?.expiring30 ?? 0, color: '#EF4444' },
              { label: '60 يوم', value: d?.contracts?.expiring60 ?? 0, color: '#F59E0B' },
              { label: '90 يوم', value: d?.contracts?.expiring90 ?? 0, color: c.textMuted },
            ].map(m => (
              <View key={m.label} style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 10, color: c.textMuted, textAlign: 'center' }}>{m.label}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* Overdue & Maintenance */}
        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#EF4444' }}>{d?.overdue?.count ?? 0}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>مدفوعات متأخرة</Text>
            <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>{(d?.overdue?.overdueAmount ?? 0).toLocaleString('ar-SA')} ر.س</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: c.surface, borderRadius: 10, padding: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: '#F59E0B' }}>{d?.maintenance?.openTickets ?? 0}</Text>
            <Text style={{ fontSize: 11, color: c.textMuted, textAlign: 'center' }}>طلبات صيانة</Text>
            {(d?.maintenance?.criticalTickets ?? 0) > 0 ? <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 4 }}>{d?.maintenance?.criticalTickets} حرجة</Text> : null}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
