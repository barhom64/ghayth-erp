/**
 * مخالفة مرورية جديدة
 * POST /api/fleet/violations
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const VIOLATION_TYPES = [
  { label: 'تجاوز السرعة', value: 'speeding' },
  { label: 'تجاوز الإشارة', value: 'red_light' },
  { label: 'قيادة بتهور', value: 'reckless_driving' },
  { label: 'استخدام الهاتف', value: 'phone_use' },
  { label: 'عدم ربط الحزام', value: 'seatbelt' },
  { label: 'وقوف ممنوع', value: 'illegal_parking' },
  { label: 'أخرى', value: 'other' },
];

interface Vehicle { id: number; plateNumber?: string; plate?: string; }

export default function ViolationNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();

  const [selectedVehicle, setSelectedVehicle] = useState(vehicleId ?? '');
  const [violationType, setViolationType] = useState('speeding');
  const [violationDate, setViolationDate] = useState('');
  const [fine, setFine] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: vehicles } = useList<Vehicle[]>('/api/fleet/vehicles', { pageSize: 200 });
  const mutation = useMutation('/api/fleet/violations', 'POST');

  const vehicleOptions = (Array.isArray(vehicles) ? vehicles : []).map((v: Vehicle) => ({
    label: v.plateNumber ?? v.plate ?? String(v.id),
    value: String(v.id),
  }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!selectedVehicle) e.vehicleId = 'يجب اختيار المركبة';
    if (!violationDate) e.violationDate = 'تاريخ المخالفة مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        vehicleId: Number(selectedVehicle),
        type: violationType,
        date: violationDate,
        fine: fine ? Number(fine) : undefined,
        description: description || undefined,
      } as never);
      Alert.alert('تم', 'تم تسجيل المخالفة المرورية', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر التسجيل');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'مخالفة مرورية جديدة' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>تفاصيل المخالفة</Text>
        {!vehicleId && vehicleOptions.length > 0 && (
          <GSelect label="المركبة *" value={selectedVehicle} onChange={setSelectedVehicle} options={vehicleOptions} placeholder="اختر المركبة" error={errors.vehicleId} />
        )}
        <DateInput label="تاريخ المخالفة *" value={violationDate} onChange={setViolationDate} error={errors.violationDate} />
        <GSelect label="نوع المخالفة" value={violationType} onChange={setViolationType} options={VIOLATION_TYPES} />
        <GInput label="مبلغ الغرامة (ر.س)" value={fine} onChangeText={setFine} placeholder="0" keyboardType="numeric" />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>الوصف</Text>
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="تفاصيل المخالفة…"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
      </GCard>

      <GButton title="تسجيل المخالفة" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
