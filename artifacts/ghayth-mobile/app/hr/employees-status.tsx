import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EmployeeStatus {
  employeeId?: number;
  employeeName?: string;
  status?: string;
  department?: string;
  position?: string;
  lastActivity?: string;
}

export default function EmployeesStatusScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EmployeeStatus[]>('/api/employees-status');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل حالة الموظفين…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حالة الموظفين' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="people-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.department ? <Text style={{ fontSize: 11, color: c.brand }}>{item.department}</Text> : null}
              {item.position ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.position}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
