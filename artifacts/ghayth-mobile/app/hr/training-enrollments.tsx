/**
 * التسجيلات التدريبية
 * GET /api/training/enrollments
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TrainingEnrollment {
  id: number;
  employeeName?: string;
  programTitle?: string;
  enrolledAt?: string;
  completedAt?: string;
  score?: number;
  status?: string;
  certificateIssued?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function TrainingEnrollmentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TrainingEnrollment[]>('/api/training/enrollments');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التسجيلات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التسجيلات التدريبية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="person-outline" title="لا توجد تسجيلات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <Text style={{ fontSize: 13, color: c.textMuted, textAlign: 'right' }}>{item.programTitle ?? '—'}</Text>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 6 }}>
              {item.score != null ? (
                <Text style={{ fontSize: 12, color: item.score >= 60 ? '#22C55E' : '#EF4444' }}>الدرجة: {item.score}%</Text>
              ) : null}
              {item.certificateIssued ? (
                <Text style={{ fontSize: 12, color: '#22C55E' }}>✓ شهادة</Text>
              ) : null}
              {item.enrolledAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.enrolledAt)}</Text> : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
