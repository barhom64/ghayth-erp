/**
 * إضافة وثيقة تأمين جديدة
 * POST /api/finance/insurance
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

export default function InsuranceNewScreen() {
  const c = useColors();
  const router = useRouter();
  const [type, setType] = useState('');
  const [provider, setProvider] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [insuredName, setInsuredName] = useState('');
  const [premium, setPremium] = useState('');
  const [coverageAmount, setCoverageAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation<unknown, Record<string, unknown>>('/api/finance/insurance', 'POST');

  const handleSave = async () => {
    if (!provider.trim()) { Alert.alert('خطأ', 'يرجى إدخال اسم شركة التأمين'); return; }
    if (!premium) { Alert.alert('خطأ', 'يرجى إدخال قسط التأمين'); return; }
    if (!startDate || !endDate) { Alert.alert('خطأ', 'يرجى إدخال تواريخ الوثيقة'); return; }
    try {
      await (mutation.mutateAsync as (v: Record<string, unknown>) => Promise<unknown>)({
        type: type || undefined,
        provider: provider.trim(),
        policyNumber: policyNumber || undefined,
        insuredName: insuredName || undefined,
        premium: Number(premium),
        coverageAmount: coverageAmount ? Number(coverageAmount) : undefined,
        startDate,
        endDate,
        notes: notes || undefined,
      });
      router.back();
    } catch {
      Alert.alert('خطأ', 'تعذّر حفظ وثيقة التأمين');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'وثيقة تأمين جديدة' }} />
      <GCard style={{ gap: 12 }}>
        <GSelect
          label="نوع التأمين"
          value={type}
          onChange={setType}
          options={[
            { value: 'property', label: 'تأمين عقاري' },
            { value: 'medical', label: 'تأمين طبي' },
            { value: 'vehicle', label: 'تأمين مركبة' },
            { value: 'life', label: 'تأمين على الحياة' },
            { value: 'general', label: 'تأمين عام' },
          ]}
          placeholder="اختر النوع"
        />
        <GInput label="شركة التأمين *" value={provider} onChangeText={setProvider} placeholder="أسماء الشرق" />
        <GInput label="رقم الوثيقة" value={policyNumber} onChangeText={setPolicyNumber} placeholder="INS-2024-001" />
        <GInput label="المؤمَّن عليه" value={insuredName} onChangeText={setInsuredName} />
        <GInput label="قسط التأمين (ر.س) *" value={premium} onChangeText={setPremium} keyboardType="decimal-pad" />
        <GInput label="مبلغ التغطية (ر.س)" value={coverageAmount} onChangeText={setCoverageAmount} keyboardType="decimal-pad" />
        <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} />
        <DateInput label="تاريخ الانتهاء *" value={endDate} onChange={setEndDate} />
        <GInput label="ملاحظات" value={notes} onChangeText={setNotes} multiline />
      </GCard>
      <GButton title="حفظ وثيقة التأمين" onPress={handleSave} loading={mutation.isPending} />
    </ScrollView>
  );
}
