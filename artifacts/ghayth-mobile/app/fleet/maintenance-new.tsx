/**
 * أمر صيانة مركبة جديد — POST /api/fleet/maintenance-orders
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const MAINTENANCE_TYPES = [
  { value: 'preventive', label: 'صيانة دورية وقائية' },
  { value: 'corrective', label: 'إصلاح عطل' },
  { value: 'inspection', label: 'فحص دوري' },
  { value: 'tires', label: 'إطارات' },
  { value: 'oil_change', label: 'تغيير زيت' },
  { value: 'brakes', label: 'فرامل' },
  { value: 'ac', label: 'تكييف' },
  { value: 'electrical', label: 'كهرباء' },
  { value: 'body', label: 'هيكل / طلاء' },
  { value: 'other', label: 'أخرى' },
];

const PRIORITIES = [
  { value: 'urgent', label: 'عاجل — المركبة متوقفة' },
  { value: 'high', label: 'عالية' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'low', label: 'منخفضة' },
];

interface Vehicle { id: number; name?: string; plateNumber?: string }
interface ListResp<T> { data?: T[] }

export default function FleetMaintenanceNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { vehicleId: vehicleIdParam } = useLocalSearchParams<{ vehicleId?: string }>();

  const [vehicleId, setVehicleId] = useState(vehicleIdParam ?? '');
  const [maintenanceType, setMaintenanceType] = useState('');
  const [priority, setPriority] = useState('medium');
  const [scheduledDate, setScheduledDate] = useState('');
  const [odometer, setOdometer] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: vehiclesResp } = useList<ListResp<Vehicle>>('/api/fleet/vehicles', { pageSize: 100 });
  const vehicleOptions = (vehiclesResp?.data ?? []).map(v => ({
    value: String(v.id),
    label: v.name ?? v.plateNumber ?? `مركبة #${v.id}`,
  }));

  const mutation = useMutation('/api/fleet/maintenance-orders', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!vehicleId) errs.vehicleId = 'اختر المركبة';
    if (!maintenanceType) errs.maintenanceType = 'اختر نوع الصيانة';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        vehicleId: Number(vehicleId),
        maintenanceType,
        priority,
      };
      if (scheduledDate) body.scheduledDate = scheduledDate;
      if (odometer) body.odometer = Number(odometer);
      if (estimatedCost) body.estimatedCost = Number(estimatedCost);
      if (description) body.description = description;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/fleet/maintenance-orders'] });
      if (vehicleId) qc.invalidateQueries({ queryKey: [`/api/fleet/vehicles/${vehicleId}`] });
      Alert.alert('تم', 'تم إنشاء أمر الصيانة بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إنشاء الأمر');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'أمر صيانة جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="المركبة *"
            value={vehicleId}
            onChange={setVehicleId}
            options={vehicleOptions}
            placeholder="اختر المركبة..."
            error={errors.vehicleId}
          />

          <GSelect
            label="نوع الصيانة *"
            value={maintenanceType}
            onChange={setMaintenanceType}
            options={MAINTENANCE_TYPES}
            placeholder="اختر نوع الصيانة..."
            error={errors.maintenanceType}
          />

          <GSelect
            label="الأولوية"
            value={priority}
            onChange={setPriority}
            options={PRIORITIES}
          />

          <DateInput
            label="تاريخ الصيانة المقررة"
            value={scheduledDate}
            onChange={setScheduledDate}
          />

          <GInput
            label="قراءة العداد (كم)"
            value={odometer}
            onChangeText={setOdometer}
            keyboardType="numeric"
            placeholder="0"
          />

          <GInput
            label="التكلفة التقديرية (ر.س)"
            value={estimatedCost}
            onChangeText={setEstimatedCost}
            keyboardType="numeric"
            placeholder="0.00"
          />

          <GInput
            label="وصف العطل أو العمل المطلوب"
            value={description}
            onChangeText={setDescription}
            placeholder="صف المشكلة أو العمل المطلوب بالتفصيل..."
            multiline
          />

          <GButton
            title="إنشاء أمر الصيانة"
            icon="construct-outline"
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
