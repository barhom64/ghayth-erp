import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RoutePattern { id?: number; name?: string; origin?: string; destination?: string; stops?: number; distanceKm?: number; durationMinutes?: number; frequency?: string; }

export default function RoutePatternDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RoutePattern>('/api/transport/route-patterns/0');
  const d = (data && !Array.isArray(data)) ? data as RoutePattern : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['الاسم', d.name ?? '-'],
    ['من', d.origin ?? '-'],
    ['إلى', d.destination ?? '-'],
    ['عدد المحطات', String(d.stops ?? 0)],
    ['المسافة', (d.distanceKm ?? 0) + ' كم'],
    ['المدة', (d.durationMinutes ?? 0) + ' دقيقة'],
    ['التكرار', d.frequency ?? '-'],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: d.name ?? 'نمط المسار' }} />
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
