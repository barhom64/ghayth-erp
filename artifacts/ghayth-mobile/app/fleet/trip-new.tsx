/**
 * حجز رحلة جديدة (طلب نقل) — POST /api/fleet/transport-bookings
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const TRIP_TYPES = [
  { value: 'employee_transport', label: 'نقل موظفين' },
  { value: 'cargo', label: 'شحن بضائع' },
  { value: 'client_pickup', label: 'استقبال عميل' },
  { value: 'official_errand', label: 'مهمة رسمية' },
  { value: 'maintenance_trip', label: 'رحلة صيانة' },
  { value: 'airport_transfer', label: 'نقل مطار' },
];

interface Driver { id: number; name?: string; driverName?: string }
interface Vehicle { id: number; name?: string; plateNumber?: string }
interface DriversResp { data?: Driver[] }
interface VehiclesResp { data?: Vehicle[] }

export default function TripNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [tripType, setTripType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tripDate, setTripDate] = useState('');
  const [driverId, setDriverId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [passengersCount, setPassengersCount] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: driversResp } = useList<DriversResp>('/api/fleet/drivers', { pageSize: 50 });
  const { data: vehiclesResp } = useList<VehiclesResp>('/api/fleet/vehicles', { pageSize: 50, status: 'available' });

  const driverOptions = (driversResp?.data ?? []).map(d => ({
    value: String(d.id),
    label: d.name ?? d.driverName ?? `سائق #${d.id}`,
  }));
  const vehicleOptions = (vehiclesResp?.data ?? []).map(v => ({
    value: String(v.id),
    label: v.name ?? v.plateNumber ?? `مركبة #${v.id}`,
  }));

  const mutation = useMutation('/api/fleet/transport-bookings', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!tripType) errs.tripType = 'اختر نوع الرحلة';
    if (!from.trim()) errs.from = 'أدخل نقطة الانطلاق';
    if (!to.trim()) errs.to = 'أدخل الوجهة';
    if (!tripDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.tripDate = 'اختر تاريخ الرحلة';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        tripType,
        from,
        to,
        tripDate,
        driverId: driverId ? Number(driverId) : undefined,
        vehicleId: vehicleId ? Number(vehicleId) : undefined,
        passengersCount: passengersCount ? Number(passengersCount) : undefined,
        notes: notes || undefined,
      } as never);
      qc.invalidateQueries({ queryKey: ['/api/fleet/transport-bookings'] });
      Alert.alert('تم', 'تم إرسال طلب الرحلة', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب رحلة جديدة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="نوع الرحلة *"
            value={tripType}
            onChange={setTripType}
            options={TRIP_TYPES}
            placeholder="اختر نوع الرحلة..."
            error={errors.tripType}
          />

          <GInput
            label="من *"
            value={from}
            onChangeText={setFrom}
            placeholder="نقطة الانطلاق"
            error={errors.from}
          />

          <GInput
            label="إلى *"
            value={to}
            onChangeText={setTo}
            placeholder="الوجهة"
            error={errors.to}
          />

          <DateInput
            label="تاريخ الرحلة *"
            value={tripDate}
            onChange={setTripDate}
            error={errors.tripDate}
          />

          <GSelect
            label="السائق"
            value={driverId}
            onChange={setDriverId}
            options={driverOptions}
            placeholder="اختر السائق (اختياري)..."
          />

          <GSelect
            label="المركبة"
            value={vehicleId}
            onChange={setVehicleId}
            options={vehicleOptions}
            placeholder="اختر المركبة (اختياري)..."
          />

          <GInput
            label="عدد الركاب"
            value={passengersCount}
            onChangeText={setPassengersCount}
            keyboardType="numeric"
            placeholder="1"
          />

          <GInput
            label="ملاحظات"
            value={notes}
            onChangeText={setNotes}
            placeholder="أي تفاصيل إضافية..."
            multiline
          />

          <GButton
            title="إرسال طلب الرحلة"
            icon="car-outline"
            onPress={onSubmit}
            loading={mutation.isPending}
            style={{ marginTop: 8 }}
          />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
