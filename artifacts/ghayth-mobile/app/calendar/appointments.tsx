/**
 * المواعيد
 * GET /api/calendar/appointments
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Appointment {
  id: number;
  title?: string;
  appointmentType?: string;
  startAt?: string;
  endAt?: string;
  location?: string;
  attendeeCount?: number;
  status?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return val; }
}

export default function AppointmentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Appointment[]>('/api/calendar/appointments');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل المواعيد…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'المواعيد' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="calendar-outline" title="لا توجد مواعيد" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.appointmentType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.appointmentType}</Text> : null}
              {item.startAt ? <Text style={{ fontSize: 12, color: c.textMuted }}>{fmtDate(item.startAt)}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8, marginTop: 2 }}>
              {item.location ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.location}</Text> : null}
              {item.attendeeCount != null ? <Text style={{ fontSize: 12, color: c.textFaint }}>{item.attendeeCount} حضور</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
