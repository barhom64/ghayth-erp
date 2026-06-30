import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RejectionRateItem {
  processType?: string;
  total?: number;
  rejected?: number;
  rate?: number;
}

interface BottleneckItem {
  stage?: string;
  avgWaitHours?: number;
  count?: number;
}

interface ProductivityItem {
  employeeName?: string;
  tasksCompleted?: number;
  avgCompletionHours?: number;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 10 }}>
      <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{label}</Text>
      <Text style={{ fontSize: 18, fontWeight: '700', color: c.brand, textAlign: 'right' }}>{value}</Text>
      {sub ? <Text style={{ fontSize: 11, color: c.textFaint, textAlign: 'right' }}>{sub}</Text> : null}
    </View>
  );
}

export default function OpsAnalyticsScreen() {
  const c = useColors();
  const rejection = useList<RejectionRateItem[]>('/api/bi/operations/rejection-rate');
  const bottleneck = useList<BottleneckItem[]>('/api/bi/operations/bottleneck');
  const productivity = useList<ProductivityItem[]>('/api/bi/operations/employee-productivity');

  const isLoading = rejection.isLoading || bottleneck.isLoading || productivity.isLoading;
  const isError = rejection.isError && bottleneck.isError && productivity.isError;

  if (isLoading) return <GLoadingState text="جارٍ تحميل تحليلات العمليات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={() => { rejection.refetch(); bottleneck.refetch(); productivity.refetch(); }} />
  );

  const rejList = Array.isArray(rejection.data) ? rejection.data : [];
  const botList = Array.isArray(bottleneck.data) ? bottleneck.data : [];
  const prodList = Array.isArray(productivity.data) ? productivity.data : [];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تحليلات العمليات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {rejList.length > 0 && (
          <>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 8 }}>معدل الرفض</Text>
            {rejList.map((r, i) => (
              <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: c.text }}>{r.processType ?? '—'}</Text>
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#EF4444' }}>{r.rate != null ? `${(r.rate * 100).toFixed(1)}%` : '—'}</Text>
              </View>
            ))}
          </>
        )}
        {botList.length > 0 && (
          <>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginTop: 12, marginBottom: 8 }}>نقاط الاختناق</Text>
            {botList.map((b, i) => (
              <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: c.text }}>{b.stage ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: '#F59E0B' }}>{b.avgWaitHours != null ? `${b.avgWaitHours.toFixed(1)} ساعة` : '—'}</Text>
              </View>
            ))}
          </>
        )}
        {prodList.length > 0 && (
          <>
            <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right', marginTop: 12, marginBottom: 8 }}>إنتاجية الموظفين</Text>
            {prodList.map((p, i) => (
              <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 12, marginBottom: 8, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, color: c.text }}>{p.employeeName ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: c.brand }}>{p.tasksCompleted ?? 0} مهمة</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
