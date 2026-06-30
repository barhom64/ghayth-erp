import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Job { id?: number; title?: string; department?: string; location?: string; type?: string; description?: string; requirements?: string; deadline?: string; }

export default function JobDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Job>('/api/careers/jobs/0');
  const d = (data && !Array.isArray(data)) ? data as Job : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.title ?? 'تفاصيل الوظيفة' }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{d.title ?? '-'}</Text>
        <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 4 }}>{d.department} | {d.location} | {d.type}</Text>
      </View>
      <View style={{ backgroundColor: c.surface, padding: 16, marginTop: 8 }}>
        <Text style={{ color: c.brand, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>الوصف الوظيفي</Text>
        <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.description ?? '-'}</Text>
      </View>
      <View style={{ backgroundColor: c.surface, padding: 16, marginTop: 8 }}>
        <Text style={{ color: c.brand, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>المتطلبات</Text>
        <Text style={{ color: c.text, fontSize: 14, lineHeight: 22 }}>{d.requirements ?? '-'}</Text>
      </View>
      {d.deadline && (
        <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface, marginTop: 8 }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>آخر موعد للتقديم: {new Date(d.deadline).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
        </View>
      )}
    </ScrollView>
  );
}
