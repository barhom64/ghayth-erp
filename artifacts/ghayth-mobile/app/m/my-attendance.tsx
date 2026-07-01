import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface AttendanceRecord { id?: number; date?: string; checkIn?: string; checkOut?: string; status?: string; hours?: number; }

export default function MyAttendance() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<AttendanceRecord[]>('/api/my-space/attendance');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حضوري' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="time-outline" title="لا توجد سجلات حضور" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 14, fontWeight: '600' }}>{item.date ? new Date(item.date).toLocaleDateString('ar-SA', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}</Text>
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {!!item.checkIn && <Text style={{ color: c.textMuted, fontSize: 12 }}>دخول: {item.checkIn}</Text>}
              {!!item.checkOut && <Text style={{ color: c.textMuted, fontSize: 12 }}>خروج: {item.checkOut}</Text>}
              {!!item.status && <Text style={{ color: c.brand, fontSize: 12 }}>{item.status}</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
