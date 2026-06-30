/**
 * نقل عمرة جديد
 * POST /api/umrah/transports
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const TRANSPORTTYPE_OPTIONS = [
  { label: 'حافلة', value: 'bus' },
  { label: 'سيارة خاصة', value: 'car' },
  { label: 'ليموزين', value: 'limousine' },
];

export default function نقلعمرةجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [transportType, setTransportType] = useState('bus');
  const [provider, setProvider] = useState('');
  const [transportDate, setTransportDate] = useState('');
  const [from_location, setFrom_location] = useState('');
  const [to_location, setTo_location] = useState('');
  const [capacity, setCapacity] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/transports', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!transportType) e['transportType'] = 'نوع النقل مطلوب';
    if (!provider) e['provider'] = 'المزود مطلوب';
    if (!transportDate) e['transportDate'] = 'تاريخ النقل مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        transportType: transportType || undefined,
        provider: provider || undefined,
        transportDate: transportDate || undefined,
        from_location: from_location || undefined,
        to_location: to_location || undefined,
        capacity: capacity || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'نقل عمرة جديد' }} />

      <GCard style={styles.card}>
        <GSelect label="نوع النقل *" value={transportType} onChange={setTransportType} options={TRANSPORTTYPE_OPTIONS} />
        <GInput label="المزود *" value={provider} onChangeText={setProvider} placeholder="اسم المزود" error={errors["provider"]} />
        <DateInput label="تاريخ النقل *" value={transportDate} onChange={setTransportDate} error={errors["transportDate"]} />
        <GInput label="من" value={from_location} onChangeText={setFrom_location} placeholder="نقطة الانطلاق" />
        <GInput label="إلى" value={to_location} onChangeText={setTo_location} placeholder="الوجهة" />
        <GInput label="السعة" value={capacity} onChangeText={setCapacity} placeholder="عدد الركاب" />
      </GCard>

      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
});
