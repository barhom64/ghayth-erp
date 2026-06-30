/**
 * مركبة جديدة
 * POST /api/fleet/vehicles
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const VEHICLETYPE_OPTIONS = [
  { label: 'شاحنة', value: 'truck' },
  { label: 'سيارة', value: 'car' },
  { label: 'حافلة', value: 'bus' },
  { label: 'دراجة', value: 'motorcycle' },
];
const STATUS_OPTIONS = [
  { label: 'نشطة', value: 'active' },
  { label: 'في الصيانة', value: 'maintenance' },
  { label: 'غير نشطة', value: 'inactive' },
];

export default function مركبةجديدةScreen() {
  const c = useColors();
  const router = useRouter();

  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('truck');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [chassisNumber, setChassisNumber] = useState('');
  const [status, setStatus] = useState('active');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/fleet/vehicles', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!plateNumber) e['plateNumber'] = 'رقم اللوحة مطلوب';
    if (!vehicleType) e['vehicleType'] = 'نوع المركبة مطلوب';
    if (!brand) e['brand'] = 'الماركة مطلوب';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        plateNumber: plateNumber || undefined,
        vehicleType: vehicleType || undefined,
        brand: brand || undefined,
        model: model || undefined,
        year: year || undefined,
        chassisNumber: chassisNumber || undefined,
        status: status || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مركبة جديدة' }} />
      <GCard style={styles.card}>
        <GInput label="رقم اللوحة *" value={plateNumber} onChangeText={setPlateNumber} placeholder="رقم اللوحة" error={errors["plateNumber"]} />
        <GSelect label="نوع المركبة *" value={vehicleType} onChange={setVehicleType} options={VEHICLETYPE_OPTIONS} />
        <GInput label="الماركة *" value={brand} onChangeText={setBrand} placeholder="ماركة المركبة" error={errors["brand"]} />
        <GInput label="الموديل" value={model} onChangeText={setModel} placeholder="موديل المركبة" />
        <GInput label="سنة الصنع" value={year} onChangeText={setYear} placeholder="السنة" />
        <GInput label="رقم الهيكل" value={chassisNumber} onChangeText={setChassisNumber} placeholder="رقم الهيكل" />
        <GSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
      </GCard>
      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
