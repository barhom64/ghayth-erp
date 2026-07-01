import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface EligibilityItem { employeeId?: number; employeeName?: string; eligible?: boolean; reason?: string; }

export default function FieldPingEligibility() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<EligibilityItem[]>('/api/hr/attendance/field-ping/eligibility');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'أهلية تتبع الحضور الميداني' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.employeeId ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="location-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.employeeName ?? String(item.employeeId ?? '')}</Text>
            <Text style={{ color: item.eligible ? c.brand : c.textMuted, fontSize: 12 }}>{item.eligible ? 'مؤهل' : 'غير مؤهل'}</Text>
          </View>
        )}
      />
    </View>
  );
}
