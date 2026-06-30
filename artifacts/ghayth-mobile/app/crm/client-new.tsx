/**
 * إضافة عميل جديد — POST /api/clients
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const CLIENT_TYPES = [
  { value: 'company', label: 'شركة' },
  { value: 'individual', label: 'فرد' },
  { value: 'government', label: 'جهة حكومية' },
  { value: 'non_profit', label: 'غير ربحية' },
];

const SOURCES = [
  { value: 'referral', label: 'إحالة' },
  { value: 'website', label: 'الموقع الإلكتروني' },
  { value: 'social_media', label: 'وسائل التواصل' },
  { value: 'cold_call', label: 'اتصال مباشر' },
  { value: 'exhibition', label: 'معرض / فعالية' },
  { value: 'other', label: 'أخرى' },
];

const RATINGS = [
  { value: 'A', label: 'A — ممتاز' },
  { value: 'B', label: 'B — جيد' },
  { value: 'C', label: 'C — متوسط' },
  { value: 'D', label: 'D — منخفض' },
];

export default function ClientNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [clientType, setClientType] = useState('company');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [source, setSource] = useState('');
  const [rating, setRating] = useState('B');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/clients', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'أدخل اسم العميل';
    if (!phone.trim() && !email.trim()) errs.contact = 'أدخل رقم الجوال أو البريد الإلكتروني';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        clientType,
        rating,
      };
      if (phone) body.phone = phone;
      if (email) body.email = email;
      if (website) body.website = website;
      if (taxNumber) body.taxNumber = taxNumber;
      if (address) body.address = address;
      if (city) body.city = city;
      if (source) body.source = source;
      if (notes) body.notes = notes;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/clients'] });
      Alert.alert('تم', 'تم إضافة العميل بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إضافة العميل');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'عميل جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput
            label="اسم العميل / الشركة *"
            value={name}
            onChangeText={setName}
            placeholder="الاسم الكامل"
            error={errors.name}
          />

          <GSelect
            label="نوع العميل"
            value={clientType}
            onChange={setClientType}
            options={CLIENT_TYPES}
          />

          <GInput
            label="رقم الجوال"
            value={phone}
            onChangeText={setPhone}
            placeholder="+966XXXXXXXXX"
            keyboardType="phone-pad"
            error={errors.contact}
          />

          <GInput
            label="البريد الإلكتروني"
            value={email}
            onChangeText={setEmail}
            placeholder="example@company.com"
            keyboardType="email-address"
          />

          <GInput
            label="الموقع الإلكتروني"
            value={website}
            onChangeText={setWebsite}
            placeholder="www.company.com"
            keyboardType="url"
          />

          <GInput
            label="الرقم الضريبي"
            value={taxNumber}
            onChangeText={setTaxNumber}
            placeholder="3XXXXXXXXXXXXXXXXX"
          />

          <GInput
            label="العنوان"
            value={address}
            onChangeText={setAddress}
            placeholder="العنوان التفصيلي"
          />

          <GInput
            label="المدينة"
            value={city}
            onChangeText={setCity}
            placeholder="الرياض"
          />

          <GSelect
            label="مصدر العميل"
            value={source}
            onChange={setSource}
            options={SOURCES}
            placeholder="كيف وصلنا للعميل؟..."
          />

          <GSelect
            label="التصنيف"
            value={rating}
            onChange={setRating}
            options={RATINGS}
          />

          <GInput
            label="ملاحظات"
            value={notes}
            onChangeText={setNotes}
            placeholder="أي معلومات إضافية..."
            multiline
          />

          <GButton
            title="إضافة العميل"
            icon="person-add-outline"
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
