/**
 * تسجيل معتمر جديد — POST /api/umrah/pilgrims
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const NATIONALITIES = [
  { value: 'SA', label: 'سعودي' },
  { value: 'EG', label: 'مصري' },
  { value: 'PK', label: 'باكستاني' },
  { value: 'IN', label: 'هندي' },
  { value: 'ID', label: 'إندونيسي' },
  { value: 'MY', label: 'ماليزي' },
  { value: 'TR', label: 'تركي' },
  { value: 'MA', label: 'مغربي' },
  { value: 'other', label: 'أخرى' },
];

const GENDERS = [
  { value: 'male', label: 'ذكر' },
  { value: 'female', label: 'أنثى' },
];

interface UmrahGroup { id: number; name?: string; title?: string; departureDate?: string }
interface ListResp<T> { data?: T[] }

export default function PilgrimNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { groupId: groupIdParam } = useLocalSearchParams<{ groupId?: string }>();

  const [groupId, setGroupId] = useState(groupIdParam ?? '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('male');
  const [nationality, setNationality] = useState('');
  const [passportNumber, setPassportNumber] = useState('');
  const [passportExpiry, setPassportExpiry] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: groupsResp } = useList<ListResp<UmrahGroup>>('/api/umrah/groups', { pageSize: 50, status: 'upcoming' });
  const groupOptions = (groupsResp?.data ?? []).map(g => ({
    value: String(g.id),
    label: g.name ?? g.title ?? `مجموعة #${g.id}`,
  }));

  const mutation = useMutation('/api/umrah/pilgrims', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!firstName.trim()) errs.firstName = 'أدخل الاسم الأول';
    if (!lastName.trim()) errs.lastName = 'أدخل اسم العائلة';
    if (!passportNumber.trim()) errs.passportNumber = 'أدخل رقم جواز السفر';
    if (!nationality) errs.nationality = 'اختر الجنسية';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        gender,
        nationality,
        passportNumber: passportNumber.trim(),
      };
      if (groupId) body.groupId = Number(groupId);
      if (passportExpiry) body.passportExpiry = passportExpiry;
      if (dateOfBirth) body.dateOfBirth = dateOfBirth;
      if (phone) body.phone = phone;
      if (email) body.email = email;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/umrah/pilgrims'] });
      if (groupId) qc.invalidateQueries({ queryKey: [`/api/umrah/groups/${groupId}/pilgrims`] });
      Alert.alert('تم', 'تم تسجيل المعتمر بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تسجيل المعتمر');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'تسجيل معتمر جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          {groupOptions.length > 0 && (
            <GSelect
              label="المجموعة"
              value={groupId}
              onChange={setGroupId}
              options={groupOptions}
              placeholder="اختر المجموعة (اختياري)..."
            />
          )}

          <GInput
            label="الاسم الأول *"
            value={firstName}
            onChangeText={setFirstName}
            placeholder="كما في جواز السفر"
            error={errors.firstName}
          />

          <GInput
            label="اسم العائلة *"
            value={lastName}
            onChangeText={setLastName}
            placeholder="كما في جواز السفر"
            error={errors.lastName}
          />

          <GSelect
            label="الجنس"
            value={gender}
            onChange={setGender}
            options={GENDERS}
          />

          <GSelect
            label="الجنسية *"
            value={nationality}
            onChange={setNationality}
            options={NATIONALITIES}
            placeholder="اختر الجنسية..."
            error={errors.nationality}
          />

          <GInput
            label="رقم جواز السفر *"
            value={passportNumber}
            onChangeText={setPassportNumber}
            placeholder="A12345678"
            error={errors.passportNumber}
          />

          <DateInput
            label="تاريخ انتهاء الجواز"
            value={passportExpiry}
            onChange={setPassportExpiry}
          />

          <DateInput
            label="تاريخ الميلاد"
            value={dateOfBirth}
            onChange={setDateOfBirth}
          />

          <GInput
            label="رقم الجوال"
            value={phone}
            onChangeText={setPhone}
            placeholder="+966XXXXXXXXX"
            keyboardType="phone-pad"
          />

          <GInput
            label="البريد الإلكتروني"
            value={email}
            onChangeText={setEmail}
            placeholder="example@email.com"
            keyboardType="email-address"
          />

          <GButton
            title="تسجيل المعتمر"
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
