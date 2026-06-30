import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Journey { id?: number; groupName?: string; status?: string; departureDate?: string; }

export default function GroupJourneyScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Journey>('/api/umrah/groups/0/journey');
  const d = (data && !Array.isArray(data)) ? data as Journey : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'رحلة المجموعة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {!d ? (
          <GEmptyState icon="layers-outline" title="لا توجد بيانات" description="" />
        ) : (
          <>
            <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>اسم المجموعة</Text>
              <Text style={{ color: c.text, fontSize: 14 }}>{d.groupName ?? '—'}</Text>
            </View>
            <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>الحالة</Text>
              <Text style={{ color: c.text, fontSize: 14 }}>{d.status ?? '—'}</Text>
            </View>
            <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>تاريخ المغادرة</Text>
              <Text style={{ color: c.text, fontSize: 14 }}>{d.departureDate ?? '—'}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
