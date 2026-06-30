/**
 * جرد مخزون جديد — POST /api/warehouse/cycle-counts
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const COUNT_TYPES = [
  { value: 'full', label: 'جرد شامل' },
  { value: 'cycle', label: 'جرد دوري' },
  { value: 'spot', label: 'جرد عينة' },
  { value: 'abc', label: 'جرد ABC' },
];

interface Warehouse { id: number; name?: string }
interface ListResp<T> { data?: T[] }

export default function CycleCountNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [warehouseId, setWarehouseId] = useState('');
  const [countType, setCountType] = useState('cycle');
  const [scheduledDate, setScheduledDate] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: warehousesResp } = useList<ListResp<Warehouse>>('/api/warehouse/warehouses', { pageSize: 100 });
  const warehouseOptions = (warehousesResp?.data ?? []).map(w => ({
    value: String(w.id),
    label: w.name ?? `مستودع #${w.id}`,
  }));

  const mutation = useMutation('/api/warehouse/cycle-counts', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!warehouseId) errs.warehouseId = 'اختر المستودع';
    if (!scheduledDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.scheduledDate = 'اختر تاريخ الجرد';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        warehouseId: Number(warehouseId),
        countType,
        scheduledDate,
      };
      if (notes) body.notes = notes;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/warehouse/cycle-counts'] });
      Alert.alert('تم', 'تم إنشاء عملية الجرد. يمكنك الآن إضافة الأصناف المراد جردها.', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إنشاء الجرد');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'جرد مخزون جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect label="المستودع *" value={warehouseId} onChange={setWarehouseId} options={warehouseOptions} placeholder="اختر المستودع..." error={errors.warehouseId} />
          <GSelect label="نوع الجرد" value={countType} onChange={setCountType} options={COUNT_TYPES} />
          <DateInput label="تاريخ الجرد المجدول *" value={scheduledDate} onChange={setScheduledDate} error={errors.scheduledDate} />
          <GInput label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="تعليمات الجرد أو ملاحظات..." multiline />
          <GButton title="إنشاء عملية الجرد" icon="list-outline" onPress={onSubmit} loading={mutation.isPending} style={{ marginTop: 8 }} />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
