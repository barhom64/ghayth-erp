/**
 * بيان شحن جديد
 * POST /api/fleet/cargo-manifests
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

export default function بيانشحنجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [manifestNumber, setManifestNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [shipmentDate, setShipmentDate] = useState('');
  const [cargoType, setCargoType] = useState('');
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/fleet/cargo-manifests', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!manifestNumber) e['manifestNumber'] = 'رقم البيان مطلوب';
    if (!vehicleNumber) e['vehicleNumber'] = 'رقم المركبة مطلوب';
    if (!shipmentDate) e['shipmentDate'] = 'تاريخ الشحن مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        manifestNumber: manifestNumber || undefined,
        vehicleNumber: vehicleNumber || undefined,
        shipmentDate: shipmentDate || undefined,
        cargoType: cargoType || undefined,
        weight: weight || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'بيان شحن جديد' }} />

      <GCard style={styles.card}>
        <GInput label="رقم البيان *" value={manifestNumber} onChangeText={setManifestNumber} placeholder="رقم البيان" error={errors["manifestNumber"]} />
        <GInput label="رقم المركبة *" value={vehicleNumber} onChangeText={setVehicleNumber} placeholder="رقم لوحة المركبة" error={errors["vehicleNumber"]} />
        <DateInput label="تاريخ الشحن *" value={shipmentDate} onChange={setShipmentDate} error={errors["shipmentDate"]} />
        <GInput label="نوع البضاعة" value={cargoType} onChangeText={setCargoType} placeholder="نوع البضاعة" />
        <GInput label="الوزن (كغ)" value={weight} onChangeText={setWeight} placeholder="الوزن" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
        </View>
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
