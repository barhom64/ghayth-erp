/**
 * أمر تشغيل جديد
 * POST /api/transport/dispatch-orders
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const STATUS_OPTIONS = [
  { label: 'قيد المراجعة', value: 'pending' },
  { label: 'مجدول', value: 'scheduled' },
  { label: 'جارٍ', value: 'in_progress' },
  { label: 'مكتمل', value: 'completed' },
];

export default function TransportDispatchNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [bookingId, setBookingId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [scheduledStartAt, setScheduledStartAt] = useState('');
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/transport/dispatch-orders', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!scheduledStartAt) e['scheduledStartAt'] = 'تاريخ التشغيل مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        bookingId: bookingId || undefined,
        vehicleId: vehicleId || undefined,
        driverId: driverId || undefined,
        scheduledStartAt: scheduledStartAt || undefined,
        status: status || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'أمر تشغيل جديد' }} />
      <GCard style={{ gap: 12 }}>
        <GInput label="رقم الحجز" value={bookingId} onChangeText={setBookingId} placeholder="رقم الحجز" />
        <GInput label="المركبة" value={vehicleId} onChangeText={setVehicleId} placeholder="رقم المركبة" />
        <GInput label="السائق" value={driverId} onChangeText={setDriverId} placeholder="رقم السائق" />
        <DateInput label="تاريخ التشغيل *" value={scheduledStartAt} onChange={setScheduledStartAt} error={errors["scheduledStartAt"]} />
        <GSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <GInput label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="ملاحظات" />
      </GCard>
      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}
