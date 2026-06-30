import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface MyOvertimeRecord {
  id?: number;
  date?: string;
  hours?: number;
  status?: string;
  approvedBy?: string;
}

export default function HrMyOvertimeScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<MyOvertimeRecord[]>('/api/hr/overtime/my');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل ساعاتك الإضافية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const statusColor = (s?: string) => s === 'approved' ? '#22C55E' : s === 'rejected' ? '#EF4444' : '#F59E0B';
  const statusLabel = (s?: string) => s === 'approved' ? 'معتمد' : s === 'rejected' ? 'مرفوض' : 'قيد المراجعة';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ساعاتي الإضافية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد ساعات إضافية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              {item.date ? (
                <Text style={{ fontSize: 14, fontWeight: '600', color: c.text }}>
                  {new Date(item.date).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              ) : null}
              {item.hours != null ? <Text style={{ fontSize: 12, color: c.textMuted, marginTop: 2 }}>{item.hours} ساعة</Text> : null}
            </View>
            {item.status ? (
              <Text style={{ fontSize: 11, color: statusColor(item.status), backgroundColor: c.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                {statusLabel(item.status)}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
