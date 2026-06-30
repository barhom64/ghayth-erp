/**
 * فرصة بيعية جديدة — POST /api/crm/opportunities
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const STAGES = [
  { value: 'prospecting', label: 'استكشاف' },
  { value: 'qualification', label: 'تأهيل' },
  { value: 'proposal', label: 'تقديم عرض' },
  { value: 'negotiation', label: 'تفاوض' },
  { value: 'closed_won', label: 'فوز' },
  { value: 'closed_lost', label: 'خسارة' },
];

interface Client { id: number; name?: string; clientName?: string }
interface ClientsResp { data?: Client[] }

export default function OpportunityNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [stage, setStage] = useState('prospecting');
  const [value, setValue] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [probability, setProbability] = useState('50');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: clientsResp } = useList<ClientsResp>('/api/clients', { pageSize: 50 });
  const clientOptions = (clientsResp?.data ?? []).map(c => ({
    value: String(c.id),
    label: c.name ?? c.clientName ?? `عميل #${c.id}`,
  }));

  const mutation = useMutation('/api/crm/opportunities', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'أدخل عنوان الفرصة';
    if (!clientId) errs.clientId = 'اختر العميل';
    if (value && (isNaN(Number(value)) || Number(value) < 0)) errs.value = 'أدخل قيمة صحيحة';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        title,
        clientId: Number(clientId),
        stage,
        value: value ? Number(value) : undefined,
        closeDate: closeDate || undefined,
        probability: Number(probability),
        notes: notes || undefined,
      } as never);
      qc.invalidateQueries({ queryKey: ['/api/crm/opportunities'] });
      Alert.alert('تم', 'تم إضافة الفرصة البيعية', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الإضافة');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'فرصة بيعية جديدة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput
            label="عنوان الفرصة *"
            value={title}
            onChangeText={setTitle}
            placeholder="مثال: توريد نظام ERP لشركة الأمل"
            error={errors.title}
          />

          <GSelect
            label="العميل *"
            value={clientId}
            onChange={setClientId}
            options={clientOptions}
            placeholder="اختر العميل..."
            error={errors.clientId}
          />

          <GSelect
            label="مرحلة الفرصة"
            value={stage}
            onChange={setStage}
            options={STAGES}
          />

          <GInput
            label="القيمة المتوقعة (ريال)"
            value={value}
            onChangeText={setValue}
            keyboardType="numeric"
            placeholder="0.00"
            error={errors.value}
          />

          <GInput
            label="احتمالية الفوز (%)"
            value={probability}
            onChangeText={setProbability}
            keyboardType="numeric"
            placeholder="50"
          />

          <DateInput
            label="تاريخ الإغلاق المتوقع"
            value={closeDate}
            onChange={setCloseDate}
          />

          <GInput
            label="ملاحظات"
            value={notes}
            onChangeText={setNotes}
            placeholder="اكتب أي تفاصيل أو ملاحظات..."
            multiline
          />

          <GButton
            title="إضافة الفرصة"
            icon="trending-up-outline"
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
