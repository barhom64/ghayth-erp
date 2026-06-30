import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Task { id?: number; title?: string; description?: string; status?: string; priority?: string; dueDate?: string; assigneeName?: string; entityType?: string; }

export default function TaskDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Task>('/api/tasks/0');
  const d = (data && !Array.isArray(data)) ? data as Task : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.title ?? 'تفاصيل المهمة' }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{d.title ?? '-'}</Text>
        <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 8 }}>
          <GStatusBadge status={d.status ?? 'pending'} />
        </View>
      </View>
      <View style={{ backgroundColor: c.surface, padding: 16, margin: 12, borderRadius: 8 }}>
        <Text style={{ color: c.text, fontSize: 14, lineHeight: 20 }}>{d.description ?? '-'}</Text>
      </View>
      {[
        ['المسؤول', d.assigneeName ?? '-'],
        ['الأولوية', d.priority ?? '-'],
        ['تاريخ الاستحقاق', d.dueDate ? new Date(d.dueDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'],
        ['الكيان المرتبط', d.entityType ?? '-'],
      ].map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
