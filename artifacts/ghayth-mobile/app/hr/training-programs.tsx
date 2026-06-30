/**
 * برامج التدريب
 * GET /api/training/programs
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrainingProgram {
  id: number;
  title?: string;
  category?: string;
  provider?: string;
  duration?: number;
  durationUnit?: string;
  status?: string;
  enrolledCount?: number;
  maxCapacity?: number;
  startDate?: string;
  endDate?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function TrainingProgramsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TrainingProgram[]>('/api/training/programs');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل برامج التدريب…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'برامج التدريب' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="school-outline" title="لا توجد برامج تدريبية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            {item.provider ? <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>الجهة: {item.provider}</Text> : null}
            {item.category ? <Text style={{ fontSize: 12, color: c.brand, textAlign: 'right' }}>{item.category}</Text> : null}
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
              {item.duration != null ? (
                <Text style={{ fontSize: 12, color: c.textFaint }}>{item.duration} {item.durationUnit ?? 'ساعة'}</Text>
              ) : null}
              {item.enrolledCount != null ? (
                <Text style={{ fontSize: 12, color: c.text }}>
                  {item.enrolledCount}{item.maxCapacity ? `/${item.maxCapacity}` : ''} مسجل
                </Text>
              ) : null}
              {item.startDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.startDate)}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
