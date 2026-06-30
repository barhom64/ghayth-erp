/**
 * إضافة وحدة جديدة لعقار
 * POST /api/properties/units
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const UNIT_TYPES = [
  { label: 'شقة', value: 'apartment' },
  { label: 'مكتب', value: 'office' },
  { label: 'محل تجاري', value: 'shop' },
  { label: 'مستودع', value: 'warehouse' },
  { label: 'فيلا', value: 'villa' },
  { label: 'غرفة', value: 'room' },
  { label: 'أرض', value: 'land' },
];

const STATUS_OPTIONS = [
  { label: 'متاحة', value: 'available' },
  { label: 'مؤجّرة', value: 'rented' },
  { label: 'قيد الصيانة', value: 'maintenance' },
  { label: 'محجوزة', value: 'reserved' },
];

const FLOOR_OPTIONS = Array.from({ length: 30 }, (_, i) => ({
  label: i === 0 ? 'الأرضي' : `الطابق ${i}`,
  value: String(i),
}));

export default function UnitNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId?: string }>();

  const [unitNumber, setUnitNumber] = useState('');
  const [type, setType] = useState('apartment');
  const [status, setStatus] = useState('available');
  const [floor, setFloor] = useState('0');
  const [area, setArea] = useState('');
  const [rooms, setRooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [rent, setRent] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/properties/units', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!unitNumber.trim()) e.unitNumber = 'رقم الوحدة مطلوب';
    if (!propertyId) e.propertyId = 'معرف العقار مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        propertyId: Number(propertyId),
        unitNumber: unitNumber.trim(),
        type,
        status,
        floor: Number(floor),
        area: area ? Number(area) : undefined,
        rooms: rooms ? Number(rooms) : undefined,
        bathrooms: bathrooms ? Number(bathrooms) : undefined,
        rent: rent ? Number(rent) : undefined,
      } as never);
      Alert.alert('تم', 'تم إضافة الوحدة بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إضافة الوحدة');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'وحدة جديدة' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>معلومات الوحدة</Text>
        <GInput label="رقم الوحدة *" value={unitNumber} onChangeText={setUnitNumber} placeholder="مثال: A-101" error={errors.unitNumber} />
        <GSelect label="النوع" value={type} onChange={setType} options={UNIT_TYPES} />
        <GSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <GSelect label="الطابق" value={floor} onChange={setFloor} options={FLOOR_OPTIONS} />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>المساحة والمواصفات</Text>
        <GInput label="المساحة (م²)" value={area} onChangeText={setArea} placeholder="0" keyboardType="numeric" />
        <GInput label="عدد الغرف" value={rooms} onChangeText={setRooms} placeholder="0" keyboardType="numeric" />
        <GInput label="عدد الحمامات" value={bathrooms} onChangeText={setBathrooms} placeholder="0" keyboardType="numeric" />
        <GInput label="الإيجار الشهري (ر.س)" value={rent} onChangeText={setRent} placeholder="0.00" keyboardType="numeric" />
      </GCard>

      {errors.propertyId ? (
        <Text style={{ color: '#EF4444', textAlign: 'right', fontSize: 12 }}>{errors.propertyId}</Text>
      ) : null}

      <GButton title="إضافة الوحدة" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
