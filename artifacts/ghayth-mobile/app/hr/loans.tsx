/**
 * قروض الموظفين
 * GET /api/hr/loans
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmployeeLoan {
  id: number;
  employeeName?: string;
  amount?: number;
  outstandingAmount?: number;
  monthlyInstallment?: number;
  currency?: string;
  purpose?: string;
  approvedAt?: string;
  expectedPayoffDate?: string;
  status?: string;
  installmentsPaid?: number;
  totalInstallments?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function EmployeeLoansScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<EmployeeLoan[]>('/api/hr/loans');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل القروض…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'قروض الموظفين' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="card-outline" title="لا توجد قروض" description="" />}
        renderItem={({ item }) => {
          const pct = item.totalInstallments ? ((item.installmentsPaid ?? 0) / item.totalInstallments) * 100 : 0;
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/hr/loan-detail' as never, params: { id: item.id } })}
              style={{ backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              {item.purpose ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginBottom: 8 }}>{item.purpose}</Text> : null}
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>المبلغ الكلي</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>
                    {(item.amount ?? 0).toLocaleString('ar-SA')}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-start' }}>
                  <Text style={{ fontSize: 11, color: c.textMuted }}>المتبقي</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#EF4444' }}>
                    {(item.outstandingAmount ?? 0).toLocaleString('ar-SA')}
                  </Text>
                </View>
              </View>
              <View style={{ height: 4, backgroundColor: c.border, borderRadius: 2, marginBottom: 6 }}>
                <View style={{ height: 4, width: `${pct}%` as never, backgroundColor: '#22C55E', borderRadius: 2 }} />
              </View>
              <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, color: c.textFaint }}>
                  {item.installmentsPaid ?? 0}/{item.totalInstallments ?? 0} قسط
                </Text>
                {item.monthlyInstallment != null ? (
                  <Text style={{ fontSize: 12, color: c.brand }}>{item.monthlyInstallment.toLocaleString('ar-SA')} ر.س/شهر</Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
