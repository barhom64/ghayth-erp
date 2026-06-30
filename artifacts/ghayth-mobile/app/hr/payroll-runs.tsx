/**
 * دورات الرواتب
 * GET /api/hr/payroll/runs
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PayrollRun {
  id: number;
  period?: string;
  companyName?: string;
  employeeCount?: number;
  totalGross?: number;
  totalNet?: number;
  totalDeductions?: number;
  currency?: string;
  status?: string;
  processedAt?: string;
  approvedBy?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'long', year: 'numeric' }); }
  catch { return val; }
}

export default function PayrollRunsScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<PayrollRun[]>('/api/hr/payroll/runs');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل دورات الرواتب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'دورات الرواتب' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد دورات رواتب" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/hr/payroll-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>
                {item.period ? fmtDate(item.period) : '—'}
              </Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.companyName ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 8 }}>{item.companyName}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 11, color: c.textMuted }}>الموظفون</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.employeeCount ?? 0}</Text>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 11, color: c.textMuted }}>الإجمالي</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.brand }}>
                  {(item.totalGross ?? 0).toLocaleString('ar-SA')}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-start' }}>
                <Text style={{ fontSize: 11, color: c.textMuted }}>الصافي</Text>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#22C55E' }}>
                  {(item.totalNet ?? 0).toLocaleString('ar-SA')}
                </Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
