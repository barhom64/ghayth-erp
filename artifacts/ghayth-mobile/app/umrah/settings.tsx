import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface UmrahSettings { defaultCurrency?: string; vatRate?: number; commissionModel?: string; autoInvoicing?: boolean; requirePassportScan?: boolean; }

export default function UmrahSettingsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<UmrahSettings>('/api/umrah/settings');
  const d = (data && !Array.isArray(data)) ? data as UmrahSettings : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['العملة الافتراضية', d.defaultCurrency ?? '-'],
    ['نسبة ضريبة القيمة المضافة', (d.vatRate ?? 0) + '%'],
    ['نموذج العمولة', d.commissionModel ?? '-'],
    ['الفوترة التلقائية', d.autoInvoicing ? 'مفعّل' : 'معطّل'],
    ['اشتراط مسح الجواز', d.requirePassportScan ? 'نعم' : 'لا'],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إعدادات العمرة' }} />
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
