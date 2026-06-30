/**
 * حساب بنكي جديد
 * POST /api/finance/bank-accounts
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const CURRENCY_OPTIONS = [
  { label: 'ريال سعودي (SAR)', value: 'SAR' },
  { label: 'دولار أمريكي (USD)', value: 'USD' },
  { label: 'يورو (EUR)', value: 'EUR' },
];

export default function BankAccountNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [currency, setCurrency] = useState('SAR');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/finance/bank-accounts', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!bankName) e['bankName'] = 'اسم البنك مطلوب';
    if (!accountNumber && !iban) e['accountNumber'] = 'رقم الحساب أو IBAN مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        bankName: bankName || undefined,
        accountName: accountName || undefined,
        accountNumber: accountNumber || undefined,
        iban: iban || undefined,
        currency: currency || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'حساب بنكي جديد' }} />
      <GCard style={{ gap: 12 }}>
        <GInput label="اسم البنك *" value={bankName} onChangeText={setBankName} placeholder="اسم البنك" error={errors["bankName"]} />
        <GInput label="اسم الحساب" value={accountName} onChangeText={setAccountName} placeholder="اسم الحساب" />
        <GInput label="رقم الحساب" value={accountNumber} onChangeText={setAccountNumber} placeholder="رقم الحساب" error={errors["accountNumber"]} />
        <GInput label="IBAN" value={iban} onChangeText={setIban} placeholder="SA00 0000 0000 0000 0000 0000" />
        <GSelect label="العملة" value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} />
      </GCard>
      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}
