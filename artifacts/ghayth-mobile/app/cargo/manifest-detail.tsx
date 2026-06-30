import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ManifestEvent { time?: string; event?: string; location?: string; }
interface Manifest { id?: number; referenceNo?: string; origin?: string; destination?: string; status?: string; weight?: number; scheduledDate?: string; timeline?: ManifestEvent[]; }

export default function ManifestDetail() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Manifest>('/api/cargo/manifests/0');
  const d = (data && !Array.isArray(data)) ? data as Manifest : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  const row = (label: string, value?: string | number) => value !== undefined && value !== null ? (
    <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
      <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 13, flex: 1, textAlign: 'left' }}>{String(value)}</Text>
    </View>
  ) : null;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: d.referenceNo ?? 'تفاصيل الشحنة' }} />
      {row('رقم المرجع', d.referenceNo)}
      {row('المصدر', d.origin)}
      {row('الوجهة', d.destination)}
      {row('الحالة', d.status)}
      {row('الوزن (كجم)', d.weight)}
      {row('تاريخ الجدولة', d.scheduledDate ? new Date(d.scheduledDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined)}
      {Array.isArray(d.timeline) && d.timeline.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: c.text, fontSize: 15, fontWeight: '600', marginBottom: 8 }}>سجل الحركة</Text>
          {d.timeline.map((ev, i) => (
            <View key={i} style={{ flexDirection: 'row-reverse', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.border }}>
              <Text style={{ color: c.textMuted, fontSize: 12, width: 70 }}>{ev.time ? new Date(ev.time).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' }) : ''}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontSize: 13 }}>{ev.event ?? ''}</Text>
                {!!ev.location && <Text style={{ color: c.textMuted, fontSize: 12 }}>{ev.location}</Text>}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
