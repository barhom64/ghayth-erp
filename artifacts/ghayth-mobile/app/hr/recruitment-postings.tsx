/**
 * الوظائف الشاغرة
 * GET /api/recruitment/postings
 */
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RecruitmentPosting {
  id: number;
  title?: string;
  department?: string;
  location?: string;
  type?: string;
  openPositions?: number;
  applicantCount?: number;
  postedAt?: string;
  deadline?: string;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function RecruitmentPostingsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RecruitmentPosting[]>('/api/recruitment/postings');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الوظائف…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'وظائف شاغرة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="briefcase-outline" title="لا توجد وظائف شاغرة" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 4 }}>
              {item.department ? <Text style={{ fontSize: 12, color: c.brand }}>{item.department}</Text> : null}
              {item.location ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.location}</Text> : null}
              {item.type ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.type}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12, marginTop: 4 }}>
              {item.openPositions != null ? (
                <Text style={{ fontSize: 12, color: c.text }}>{item.openPositions} منصب شاغر</Text>
              ) : null}
              {item.applicantCount != null ? (
                <Text style={{ fontSize: 12, color: c.textMuted }}>{item.applicantCount} متقدم</Text>
              ) : null}
              {item.deadline ? (
                <Text style={{ fontSize: 11, color: c.textFaint }}>آخر موعد: {fmtDate(item.deadline)}</Text>
              ) : null}
            </View>
          </View>
        )}
      />
    </View>
  );
}
