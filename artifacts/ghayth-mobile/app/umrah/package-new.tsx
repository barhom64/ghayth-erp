/**
 * باقة عمرة جديدة
 * POST /api/umrah/packages
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const STATUS_OPTIONS = [
  { label: 'مسودة', value: 'draft' },
  { label: 'نشطة', value: 'active' },
  { label: 'مغلقة', value: 'closed' },
];

const TYPE_OPTIONS = [
  { label: 'اقتصادية', value: 'economy' },
  { label: 'عادية', value: 'standard' },
  { label: 'مميزة', value: 'premium' },
  { label: 'VIP', value: 'vip' },
];

export default function PackageNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [season, setSeason] = useState('');
  const [packageType, setPackageType] = useState('standard');
  const [departureCity, setDepartureCity] = useState('');
  const [duration, setDuration] = useState('');
  const [pricePerPerson, setPricePerPerson] = useState('');
  const [capacity, setCapacity] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [status, setStatus] = useState('draft');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/umrah/packages', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name) e['name'] = 'اسم الباقة مطلوب';
    if (!pricePerPerson) e['pricePerPerson'] = 'السعر للفرد مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name || undefined,
        season: season || undefined,
        packageType: packageType || undefined,
        departureCity: departureCity || undefined,
        duration: duration ? Number(duration) : undefined,
        pricePerPerson: pricePerPerson ? Number(pricePerPerson) : undefined,
        capacity: capacity ? Number(capacity) : undefined,
        departureDate: departureDate || undefined,
        returnDate: returnDate || undefined,
        status: status || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'باقة عمرة جديدة' }} />
      <GCard style={{ gap: 12 }}>
        <GInput label="اسم الباقة *" value={name} onChangeText={setName} placeholder="اسم الباقة" error={errors["name"]} />
        <GInput label="الموسم" value={season} onChangeText={setSeason} placeholder="مثال: 1446" />
        <GSelect label="نوع الباقة" value={packageType} onChange={setPackageType} options={TYPE_OPTIONS} />
        <GInput label="مدينة المغادرة" value={departureCity} onChangeText={setDepartureCity} placeholder="المدينة" />
        <GInput label="المدة (أيام)" value={duration} onChangeText={setDuration} placeholder="عدد الأيام" />
        <GInput label="السعر للفرد *" value={pricePerPerson} onChangeText={setPricePerPerson} placeholder="السعر" error={errors["pricePerPerson"]} />
        <GInput label="الطاقة الاستيعابية" value={capacity} onChangeText={setCapacity} placeholder="عدد الأشخاص" />
        <DateInput label="تاريخ المغادرة" value={departureDate} onChange={setDepartureDate} />
        <DateInput label="تاريخ العودة" value={returnDate} onChange={setReturnDate} />
        <GSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
      </GCard>
      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}
