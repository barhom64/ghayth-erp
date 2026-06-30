/**
 * فحص مركبة جديد
 * POST /api/fleet/inspections
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const TYPE_OPTIONS = [
  { label: 'فحص قبل الرحلة', value: 'pre_trip' },
  { label: 'فحص بعد الرحلة', value: 'post_trip' },
  { label: 'فحص يومي', value: 'daily' },
  { label: 'فحص طارئ', value: 'emergency' },
];

const CONDITION_OPTIONS = [
  { label: 'ممتاز', value: 'excellent' },
  { label: 'جيد', value: 'good' },
  { label: 'مقبول', value: 'fair' },
  { label: 'سيء', value: 'poor' },
];

export default function FleetInspectionNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { vehicleId: vehicleIdParam } = useLocalSearchParams<{ vehicleId?: string }>();

  const [vehicleId, setVehicleId] = useState(vehicleIdParam ?? '');
  const [inspectionType, setInspectionType] = useState('pre_trip');
  const [inspectionDate, setInspectionDate] = useState('');
  const [mileage, setMileage] = useState('');
  const [overallCondition, setOverallCondition] = useState('good');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/fleet/inspections', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!vehicleId) e['vehicleId'] = 'المركبة مطلوبة';
    if (!inspectionDate) e['inspectionDate'] = 'التاريخ مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        vehicleId: vehicleId ? Number(vehicleId) : undefined,
        inspectionType: inspectionType || undefined,
        inspectionDate: inspectionDate || undefined,
        mileage: mileage ? Number(mileage) : undefined,
        overallCondition: overallCondition || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم تسجيل الفحص بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'فحص مركبة جديد' }} />
      <GCard style={{ gap: 12 }}>
        <GInput label="رقم المركبة *" value={vehicleId} onChangeText={setVehicleId} placeholder="رقم المركبة" error={errors["vehicleId"]} />
        <GSelect label="نوع الفحص" value={inspectionType} onChange={setInspectionType} options={TYPE_OPTIONS} />
        <DateInput label="تاريخ الفحص *" value={inspectionDate} onChange={setInspectionDate} error={errors["inspectionDate"]} />
        <GInput label="قراءة العداد (كم)" value={mileage} onChangeText={setMileage} placeholder="قراءة عداد المسافة" />
        <GSelect label="الحالة العامة" value={overallCondition} onChange={setOverallCondition} options={CONDITION_OPTIONS} />
        <GInput label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="ملاحظات إضافية" />
      </GCard>
      <GButton title="تسجيل الفحص" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}
