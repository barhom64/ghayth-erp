import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CommOverview {
  totalSent?: number;
  totalFailed?: number;
  totalPending?: number;
  channels?: { channel?: string; count?: number; successRate?: number }[];
}

export default function CommOverviewScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CommOverview>('/api/admin/communications/overview');

  if (isLoading) return <GLoadingState text="جارٍ تحميل نظرة عامة على الاتصالات…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  const d = (Array.isArray(data) ? data[0] : data) as CommOverview | undefined;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'نظرة عامة على الاتصالات' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
          {[
            { label: 'مُرسَل', value: d?.totalSent, color: '#22C55E' },
            { label: 'فاشل', value: d?.totalFailed, color: '#EF4444' },
            { label: 'معلّق', value: d?.totalPending, color: '#F59E0B' },
          ].map(s => s.value != null ? (
            <View key={s.label} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: c.textMuted }}>{s.label}</Text>
              <Text style={{ fontSize: 20, fontWeight: '700', color: s.color }}>{s.value.toLocaleString('ar-SA')}</Text>
            </View>
          ) : null)}
        </View>
        {(d?.channels ?? []).map((ch, i) => (
          <View key={i} style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 13, color: c.text }}>{ch.channel ?? '—'}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12, color: c.brand }}>{ch.count ?? 0} رسالة</Text>
              {ch.successRate != null ? <Text style={{ fontSize: 11, color: '#22C55E' }}>{(ch.successRate * 100).toFixed(1)}% نجاح</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
