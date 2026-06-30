import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DeptLeaveBalance {
  departmentId?: number;
  departmentName?: string;
  totalEmployees?: number;
  avgAnnualBalance?: number;
  avgSickBalance?: number;
  pendingRequests?: number;
}

export default function DeptLeaveBalanceScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DeptLeaveBalance[]>('/api/bi/reports/department-leave-balance');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل أرصدة الإجازات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أرصدة إجازات الأقسام' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.departmentId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.departmentName ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>{item.totalEmployees ?? 0} موظف</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 16 }}>
              <Text style={{ fontSize: 12, color: c.brand }}>سنوي: {item.avgAnnualBalance ?? 0} يوم</Text>
              <Text style={{ fontSize: 12, color: c.textMuted }}>مرضي: {item.avgSickBalance ?? 0} يوم</Text>
              {(item.pendingRequests ?? 0) > 0 ? (
                <Text style={{ fontSize: 12, color: '#F59E0B' }}>طلبات: {item.pendingRequests}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
