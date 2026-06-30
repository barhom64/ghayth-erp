/**
 * تعيينات الورديات
 * GET /api/hr/shift-assignments
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ShiftAssignment {
  id: number;
  employeeName?: string;
  shiftName?: string;
  startDate?: string;
  endDate?: string;
  department?: string;
  isRecurring?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ShiftAssignmentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ShiftAssignment[]>('/api/hr/shift-assignments');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل تعيينات الورديات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تعيينات الورديات' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد تعيينات ورديات" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
              <Text style={{ fontSize: 12, color: c.brand, fontWeight: '700' }}>{item.shiftName ?? '—'}</Text>
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.department ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.department}</Text> : null}
              {item.startDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.startDate)} — {fmtDate(item.endDate)}</Text> : null}
              {item.isRecurring ? <Text style={{ fontSize: 11, color: '#22C55E' }}>متكرر</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
