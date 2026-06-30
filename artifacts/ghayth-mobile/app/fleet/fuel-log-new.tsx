/**
 * تسجيل مصروف وقود جديد
 * POST /api/fleet/fuel-logs
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const FUEL_TYPES = [
  { label: 'بنزين 91', value: 'petrol_91' },
  { label: 'بنزين 95', value: 'petrol_95' },
  { label: 'ديزل', value: 'diesel' },
  { label: 'غاز', value: 'gas' },
];

interface Vehicle { id: number; plateNumber?: string; name?: string; }

export default function FuelLogNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();

  const [selectedVehicle, setSelectedVehicle] = useState(vehicleId ?? '');
  const [fuelDate, setFuelDate] = useState('');
  const [fuelType, setFuelType] = useState('petrol_91');
  const [liters, setLiters] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [odometer, setOdometer] = useState('');
  const [station, setStation] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: vehicles } = useList<Vehicle[]>('/api/fleet/vehicles', { pageSize: 100 });
  const mutation = useMutation('/api/fleet/fuel-logs', 'POST');

  const vehOptions = (Array.isArray(vehicles) ? vehicles : []).map((v: Vehicle) => ({
    label: v.plateNumber ?? v.name ?? String(v.id),
    value: String(v.id),
  }));

  const total = liters && pricePerLiter ? (Number(liters) * Number(pricePerLiter)).toFixed(2) : '—';

  const validate = () => {
    const e: Record<string, string> = {};
    if (!selectedVehicle) e.vehicleId = 'المركبة مطلوبة';
    if (!fuelDate) e.fuelDate = 'التاريخ مطلوب';
    if (!liters || isNaN(Number(liters)) || Number(liters) <= 0) e.liters = 'أدخل كمية صحيحة';
    if (!pricePerLiter || isNaN(Number(pricePerLiter)) || Number(pricePerLiter) <= 0) e.pricePerLiter = 'أدخل السعر';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        vehicleId: Number(selectedVehicle),
        fuelDate,
        fuelType,
        liters: Number(liters),
        pricePerLiter: Number(pricePerLiter),
        totalCost: Number(liters) * Number(pricePerLiter),
        odometer: odometer ? Number(odometer) : undefined,
        station: station || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم تسجيل مصروف الوقود', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر التسجيل');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'تسجيل مصروف وقود' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>تفاصيل التزود بالوقود</Text>
        {!vehicleId && vehOptions.length > 0 && (
          <GSelect label="المركبة *" value={selectedVehicle} onChange={setSelectedVehicle} options={vehOptions} placeholder="اختر المركبة" error={errors.vehicleId} />
        )}
        <DateInput label="التاريخ *" value={fuelDate} onChange={setFuelDate} error={errors.fuelDate} />
        <GSelect label="نوع الوقود" value={fuelType} onChange={setFuelType} options={FUEL_TYPES} />
        <GInput label="الكمية (لتر) *" value={liters} onChangeText={setLiters} placeholder="0.00" keyboardType="numeric" error={errors.liters} />
        <GInput label="السعر لكل لتر (ر.س) *" value={pricePerLiter} onChangeText={setPricePerLiter} placeholder="0.00" keyboardType="numeric" error={errors.pricePerLiter} />
        {total !== '—' && (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 10 }}>
            <Text style={{ fontSize: 14, color: c.textMuted, textAlign: 'right' }}>الإجمالي: <Text style={{ color: c.text, fontWeight: '700' }}>{total} ر.س</Text></Text>
          </View>
        )}
        <GInput label="عداد الكيلومترات" value={odometer} onChangeText={setOdometer} placeholder="القراءة الحالية للعداد" keyboardType="numeric" />
        <GInput label="المحطة" value={station} onChangeText={setStation} placeholder="اسم محطة الوقود" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات…" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 50, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
        </View>
      </GCard>

      <GButton title="تسجيل الوقود" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
