import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OnboardingTask {
  id?: number;
  employeeName?: string;
  taskTitle?: string;
  status?: string;
  dueDate?: string;
  assignedTo?: string;
}

function fmtDate(val?: string) {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function OnboardingTasksScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OnboardingTask[]>('/api/employees/onboarding-tasks');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل مهام التأهيل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مهام تأهيل الموظفين' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد مهام تأهيل" description="" />}
        renderItem={({ item }) => (
          <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.taskTitle ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.employeeName ? <Text style={{ fontSize: 11, color: c.brand }}>{item.employeeName}</Text> : null}
              {item.assignedTo ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.assignedTo}</Text> : null}
              <Text style={{ fontSize: 11, color: c.textFaint }}>الموعد: {fmtDate(item.dueDate)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
