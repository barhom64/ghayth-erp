/**
 * إنشاء فاتورة متكررة جديدة
 * POST /api/finance/recurring-invoices
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

interface Client { id: number; name?: string; clientName?: string; }

export default function RecurringInvoiceNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { data: clients } = useList<Client[]>('/api/clients');
  const clientList = Array.isArray(clients) ? clients : [];

  const [clientId, setClientId] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [description, setDescription] = useState('');

  const mutation = useMutation<unknown, Record<string, unknown>>('/api/finance/recurring-invoices', 'POST');

  const handleSave = async () => {
    if (!clientId) { Alert.alert('خطأ', 'يرجى اختيار العميل'); return; }
    if (!amount) { Alert.alert('خطأ', 'يرجى إدخال المبلغ'); return; }
    if (!startDate) { Alert.alert('خطأ', 'يرجى إدخال تاريخ البداية'); return; }
    try {
      await (mutation.mutateAsync as (v: Record<string, unknown>) => Promise<unknown>)({
        clientId: Number(clientId),
        frequency,
        amount: Number(amount),
        startDate,
        description: description || undefined,
      });
      router.back();
    } catch {
      Alert.alert('خطأ', 'تعذّر حفظ الفاتورة المتكررة');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'فاتورة متكررة جديدة' }} />
      <GCard style={{ gap: 12 }}>
        <GSelect
          label="العميل *"
          value={clientId}
          onChange={setClientId}
          options={clientList.map(cl => ({ value: String(cl.id), label: cl.name ?? cl.clientName ?? `#${cl.id}` }))}
          placeholder="اختر العميل"
        />
        <GSelect
          label="الدورية *"
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: 'weekly', label: 'أسبوعية' },
            { value: 'monthly', label: 'شهرية' },
            { value: 'quarterly', label: 'ربع سنوية' },
            { value: 'biannual', label: 'نصف سنوية' },
            { value: 'annual', label: 'سنوية' },
          ]}
          placeholder="اختر الدورية"
        />
        <GInput label="المبلغ (ر.س) *" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="1000" />
        <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} />
        <GInput label="الوصف" value={description} onChangeText={setDescription} multiline />
      </GCard>
      <GButton title="حفظ الفاتورة المتكررة" onPress={handleSave} loading={mutation.isPending} />
    </ScrollView>
  );
}
