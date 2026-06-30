import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AttendancePolicyCategory {
  categoryId?: number;
  categoryName?: string;
  policyName?: string;
  workHours?: number;
  shiftType?: string;
}

export default function OrgAttendancePoliciesScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AttendancePolicyCategory[]>('/api/org/attendance-policies-per-category');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل سياسات الحضور…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'سياسات الحضور بالفئة' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.categoryId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد سياسات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>{item.categoryName ?? '—'}</Text>
            {item.policyName ? <Text style={{ fontSize: 12, color: c.brand, marginTop: 2 }}>{item.policyName}</Text> : null}
            {item.workHours != null ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.workHours} ساعة/يوم</Text> : null}
            {item.shiftType ? <Text style={{ fontSize: 11, color: c.textFaint, marginTop: 2 }}>{item.shiftType}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}
