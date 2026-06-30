/**
 * طلبات التوظيف
 * GET /api/recruitment/applications
 */
import React from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';

interface Application {
  id: number;
  applicantName?: string;
  postingTitle?: string;
  status?: string;
  appliedAt?: string;
  interviewDate?: string;
  score?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }); }
  catch { return val; }
}

const STATUS_LABEL: Record<string, string> = {
  submitted: 'مُقدَّم',
  screening: 'فرز',
  interview: 'مقابلة',
  offer: 'عرض وظيفي',
  hired: 'مُعيَّن',
  rejected: 'مرفوض',
  withdrawn: 'انسحب',
};

export default function RecruitmentApplicationsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useList<Application[]>('/api/recruitment/applications');
  const list = Array.isArray(data) ? data : [];

  async function hire(id: number) {
    await apiFetch(`/api/recruitment/applications/${id}/hire`, { method: 'POST' });
    qc.invalidateQueries({ queryKey: ['/api/recruitment/applications'] });
  }

  if (isLoading) return <GLoadingState text="جارٍ تحميل الطلبات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'طلبات التوظيف' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="person-add-outline" title="لا توجد طلبات" description="" />}
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>{item.applicantName ?? '—'}</Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>{item.postingTitle ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
                <Text style={{ fontSize: 11, color: c.textFaint }}>تقدّم: {fmtDate(item.appliedAt)}</Text>
                {item.interviewDate ? <Text style={{ fontSize: 11, color: c.brand }}>مقابلة: {fmtDate(item.interviewDate)}</Text> : null}
                {item.score != null ? <Text style={{ fontSize: 11, color: c.text }}>نقاط: {item.score}</Text> : null}
              </View>
              {item.status === 'offer' && (
                <View style={{ marginTop: 10 }}>
                  <GButton title="تعيين" variant="primary" size="sm" onPress={() => hire(item.id)} />
                </View>
              )}
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', padding: 14, borderBottomWidth: 1, gap: 10 },
});
