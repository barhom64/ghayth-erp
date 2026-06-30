/**
 * عقار جديد
 * POST /api/properties/properties
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const PROPERTYTYPE_OPTIONS = [
  { label: 'سكني', value: 'residential' },
  { label: 'تجاري', value: 'commercial' },
  { label: 'مخزن', value: 'warehouse' },
  { label: 'مكتب', value: 'office' },
];

export default function عقارجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [propertyType, setPropertyType] = useState('residential');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [totalUnits, setTotalUnits] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/properties/properties', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'اسم العقار مطلوب';
    if (!propertyType) e['propertyType'] = 'نوع العقار مطلوب';
    if (!address) e['address'] = 'العنوان مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name || undefined,
        propertyType: propertyType || undefined,
        address: address || undefined,
        city: city || undefined,
        totalUnits: totalUnits || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'عقار جديد' }} />

      <GCard style={styles.card}>
        <GInput label="اسم العقار *" value={name} onChangeText={setName} placeholder="اسم العقار" error={errors["name"]} />
        <GSelect label="نوع العقار *" value={propertyType} onChange={setPropertyType} options={PROPERTYTYPE_OPTIONS} />
        <GInput label="العنوان *" value={address} onChangeText={setAddress} placeholder="العنوان التفصيلي" error={errors["address"]} />
        <GInput label="المدينة" value={city} onChangeText={setCity} placeholder="المدينة" />
        <GInput label="عدد الوحدات" value={totalUnits} onChangeText={setTotalUnits} placeholder="العدد" />
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
