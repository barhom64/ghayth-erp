import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

type Period = 'daily' | 'weekly' | 'monthly';

interface AdminReport {
  period?: string;
  newEmployees?: number;
  newClients?: number;
  invoicesIssued?: number;
  invoicesValue?: number;
  ticketsOpened?: number;
  ticketsClosed?: number;
  tripsCompleted?: number;
  [key: string]: unknown;
}

export default function AdminReportsScreen() {
  const c = useColors();
  const [period, setPeriod] = useState<Period>('daily');
  const { data, isLoading, isError, refetch } = useList<AdminReport>(`/api/bi/admin-reports/${period}`);
  const d = (data && !Array.isArray(data)) ? data as AdminReport : null;

  const tabs: { key: Period; label: string }[] = [
    { key: 'daily', label: 'يومي' },
    { key: 'weekly', label: 'أسبوعي' },
    { key: 'monthly', label: 'شهري' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التقارير الإدارية' }} />
      <View style={{ flexDirection: 'row-reverse', padding: 12, gap: 8 }}>
        {tabs.map(t => (
          <Pressable key={t.key} onPress={() => setPeriod(t.key)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: period === t.key ? c.brand : c.surface }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: period === t.key ? '#fff' : c.text }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {isLoading ? <GLoadingState text="جارٍ تحميل التقرير…" /> : isError ? (
        <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 10 }}>
          {d?.period ? (
            <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 4 }}>الفترة: {d.period}</Text>
          ) : null}
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10 }}>
            {[
              { label: 'موظفون جدد', value: d?.newEmployees ?? 0, color: '#22C55E' },
              { label: 'عملاء جدد', value: d?.newClients ?? 0, color: c.brand },
              { label: 'فواتير صادرة', value: d?.invoicesIssued ?? 0, color: '#3B82F6' },
              { label: 'تذاكر مفتوحة', value: d?.ticketsOpened ?? 0, color: '#F59E0B' },
              { label: 'تذاكر مغلقة', value: d?.ticketsClosed ?? 0, color: '#22C55E' },
              { label: 'رحلات منجزة', value: d?.tripsCompleted ?? 0, color: c.text },
            ].map(m => (
              <View key={m.label} style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, minWidth: '45%', flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 24, fontWeight: '700', color: m.color }}>{m.value}</Text>
                <Text style={{ fontSize: 11, color: c.textMuted, marginTop: 2, textAlign: 'center' }}>{m.label}</Text>
              </View>
            ))}
          </View>
          {d?.invoicesValue != null ? (
            <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: c.textMuted }}>قيمة الفواتير</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#22C55E' }}>{d.invoicesValue.toLocaleString('ar-SA')} ر.س</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}
