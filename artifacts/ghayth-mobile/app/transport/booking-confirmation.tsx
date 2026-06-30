import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Confirmation { id?: number; status?: string; notes?: string; confirmedAt?: string; }

export default function BookingConfirmationScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<Confirmation>('/api/transport/bookings/0/confirmation');
  const d = (data && !Array.isArray(data)) ? data as Confirmation : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'تأكيد الحجز' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {!d ? (
          <GEmptyState icon="checkmark-circle-outline" title="لا توجد بيانات" description="" />
        ) : (
          <>
            <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>الحالة</Text>
              <Text style={{ color: c.text, fontSize: 14 }}>{d.status ?? '—'}</Text>
            </View>
            <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>تاريخ التأكيد</Text>
              <Text style={{ color: c.text, fontSize: 14 }}>{d.confirmedAt ?? '—'}</Text>
            </View>
            <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 4 }}>ملاحظات</Text>
              <Text style={{ color: c.text, fontSize: 14 }}>{d.notes ?? '—'}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}
