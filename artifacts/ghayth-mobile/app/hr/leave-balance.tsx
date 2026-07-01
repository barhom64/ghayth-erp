import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface LeaveBalItem { id?: number; employeeName?: string; leaveType?: string; balance?: number; used?: number; }

export default function LeaveBalanceScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<LeaveBalItem[]>('/api/hr/leave-balance');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'رصيد الإجازات' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد بيانات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.employeeName ?? ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: c.textMuted, fontSize: 12 }}>{item.leaveType ?? ''}</Text>
              {item.balance != null ? <Text style={{ color: '#38a169', fontSize: 13 }}>المتبقي: {item.balance} يوم</Text> : null}
              {item.used != null ? <Text style={{ color: c.textMuted, fontSize: 12 }}>المستخدم: {item.used}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
