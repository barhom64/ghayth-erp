import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Appointment { id?: number; title?: string; startTime?: string; endTime?: string; location?: string; attendeeName?: string; }

export default function UmrahAppointmentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Appointment[]>('/api/umrah/appointments');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المواعيد — العمرة' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد مواعيد" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14 }}>{item.title ?? ''}</Text>
            {!!item.attendeeName && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.attendeeName}</Text>}
            {!!item.location && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{item.location}</Text>}
            {!!item.startTime && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 2 }}>{new Date(item.startTime).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        )}
      />
    </View>
  );
}
