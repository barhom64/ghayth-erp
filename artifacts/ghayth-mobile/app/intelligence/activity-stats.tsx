import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ActivityStats { totalEvents?: number; todayEvents?: number; uniqueUsers?: number; topActions?: Array<{ action?: string; count?: number }>; }

export default function ActivityStats() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ActivityStats>('/api/intelligence/activity/stats');
  const d = (data && !Array.isArray(data)) ? data as ActivityStats : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const stat = (label: string, value?: number | string) => (
    <View style={{ backgroundColor: c.surface, borderRadius: 10, padding: 16, margin: 6, flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.brand, fontSize: 24, fontWeight: '700' }}>{value ?? '—'}</Text>
      <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>{label}</Text>
    </View>
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 10, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'إحصائيات النشاط' }} />
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap' }}>
        {stat('إجمالي الأحداث', d.totalEvents)}
        {stat('أحداث اليوم', d.todayEvents)}
        {stat('مستخدمون نشطون', d.uniqueUsers)}
      </View>
      {Array.isArray(d.topActions) && d.topActions.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', marginBottom: 8 }}>أكثر الإجراءات</Text>
          {d.topActions.map((a, i) => (
            <View key={i} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ color: c.text, fontSize: 13 }}>{a.action ?? ''}</Text>
              <Text style={{ color: c.brand, fontSize: 13 }}>{a.count ?? 0}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
