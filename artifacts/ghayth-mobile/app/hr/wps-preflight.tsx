import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface WpsPreflight { canSubmit?: boolean; employeeCount?: number; issues?: string[]; totalAmount?: number; }

export default function WpsPreflight() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<WpsPreflight>('/api/hr/wps/preflight/0');
  const d = (data && !Array.isArray(data)) ? data as WpsPreflight : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فحص WPS قبل الإرسال' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: d?.canSubmit ? '#dcfce7' : '#fee2e2', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <Text style={{ color: d?.canSubmit ? '#166534' : '#991b1b', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>{d?.canSubmit ? 'جاهز للإرسال' : 'يوجد مشاكل'}</Text>
        </View>
        {[{ label: 'عدد الموظفين', value: d?.employeeCount }, { label: 'إجمالي المبلغ', value: d?.totalAmount?.toLocaleString('ar-SA') ? `${d.totalAmount.toLocaleString('ar-SA')} ر.س` : undefined }].map((row, i) => row.value !== undefined ? (
          <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
            <Text style={{ color: c.textMuted, fontSize: 13 }}>{row.label}</Text>
            <Text style={{ color: c.text, fontSize: 13 }}>{row.value}</Text>
          </View>
        ) : null)}
        {(d?.issues ?? []).length > 0 && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ color: '#991b1b', fontSize: 14, fontWeight: '600', marginBottom: 8 }}>المشاكل:</Text>
            {(d?.issues ?? []).map((issue, i) => <Text key={i} style={{ color: c.text, fontSize: 13, marginBottom: 4 }}>• {issue}</Text>)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
