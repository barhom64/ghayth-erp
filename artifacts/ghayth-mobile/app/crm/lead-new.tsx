/**
 * عميل محتمل جديد — POST /api/crm/leads
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const SOURCES = [
  { value: 'website', label: 'الموقع الإلكتروني' },
  { value: 'referral', label: 'إحالة' },
  { value: 'social_media', label: 'وسائل التواصل الاجتماعي' },
  { value: 'cold_call', label: 'مكالمة مباشرة' },
  { value: 'exhibition', label: 'معرض أو فعالية' },
  { value: 'email', label: 'بريد إلكتروني' },
  { value: 'other', label: 'أخرى' },
];

const RATINGS = [
  { value: 'hot', label: 'ساخن 🔥' },
  { value: 'warm', label: 'دافئ' },
  { value: 'cold', label: 'بارد' },
];

export default function LeadNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [source, setSource] = useState('');
  const [rating, setRating] = useState('warm');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/crm/leads', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'أدخل اسم العميل المحتمل';
    if (!phone.trim() && !email.trim()) errs.phone = 'أدخل رقم الجوال أو البريد الإلكتروني';
    if (!source) errs.source = 'اختر مصدر العميل';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name,
        phone: phone || undefined,
        email: email || undefined,
        company: company || undefined,
        source,
        rating,
        notes: notes || undefined,
      } as never);
      qc.invalidateQueries({ queryKey: ['/api/crm/leads'] });
      Alert.alert('تم', 'تم إضافة العميل المحتمل', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الإضافة');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'عميل محتمل جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput
            label="الاسم *"
            value={name}
            onChangeText={setName}
            placeholder="اسم العميل أو جهة التواصل"
            error={errors.name}
          />

          <GInput
            label="رقم الجوال"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            placeholder="05XXXXXXXX"
            error={errors.phone}
          />

          <GInput
            label="البريد الإلكتروني"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholder="example@company.com"
          />

          <GInput
            label="الشركة / الجهة"
            value={company}
            onChangeText={setCompany}
            placeholder="اسم الشركة (اختياري)"
          />

          <GSelect
            label="مصدر العميل *"
            value={source}
            onChange={setSource}
            options={SOURCES}
            placeholder="اختر كيف وصلت إليك..."
            error={errors.source}
          />

          <GSelect
            label="تصنيف العميل"
            value={rating}
            onChange={setRating}
            options={RATINGS}
          />

          <GInput
            label="ملاحظات"
            value={notes}
            onChangeText={setNotes}
            placeholder="اكتب أي ملاحظات عن هذا العميل..."
            multiline
          />

          <GButton
            title="إضافة العميل المحتمل"
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
