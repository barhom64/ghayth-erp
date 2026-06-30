/**
 * طلب مهمة عمل / انتداب — يُرسل إلى POST /api/hr/missions
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const MISSION_TYPES = [
  { value: 'internal', label: 'مهمة داخلية' },
  { value: 'external', label: 'مهمة خارجية' },
  { value: 'training', label: 'تدريب خارجي' },
  { value: 'conference', label: 'مؤتمر أو ملتقى' },
];

const TRANSPORT_TYPES = [
  { value: 'car', label: 'سيارة' },
  { value: 'plane', label: 'طائرة' },
  { value: 'train', label: 'قطار' },
  { value: 'bus', label: 'حافلة' },
  { value: 'own_vehicle', label: 'مركبة خاصة' },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function MissionNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [missionType, setMissionType] = useState('');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [transportType, setTransportType] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/hr/missions', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!missionType) errs.missionType = 'اختر نوع المهمة';
    if (!destination.trim()) errs.destination = 'أدخل وجهة المهمة';
    if (!purpose.trim()) errs.purpose = 'أدخل هدف المهمة';
    if (!DATE_RE.test(startDate)) errs.startDate = 'اختر تاريخ البداية';
    if (!DATE_RE.test(endDate)) errs.endDate = 'اختر تاريخ العودة';
    if (startDate > endDate) errs.endDate = 'تاريخ العودة يجب أن يكون بعد البداية';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        missionType,
        destination,
        purpose,
        startDate,
        endDate,
        transportType: transportType || undefined,
        estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
        notes: notes || undefined,
      } as never);
      qc.invalidateQueries({ queryKey: ['/api/hr/missions'] });
      qc.invalidateQueries({ queryKey: ['/api/my-space'] });
      Alert.alert('تم', 'تم إرسال طلب الانتداب للاعتماد', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب مهمة عمل' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="نوع المهمة *"
            value={missionType}
            onChange={setMissionType}
            options={MISSION_TYPES}
            placeholder="اختر نوع المهمة..."
            error={errors.missionType}
          />

          <GInput
            label="الوجهة / الجهة *"
            value={destination}
            onChangeText={setDestination}
            placeholder="مثال: الرياض — شركة الأمل"
            error={errors.destination}
          />

          <GInput
            label="هدف المهمة *"
            value={purpose}
            onChangeText={setPurpose}
            placeholder="اكتب هدف المهمة والأعمال المطلوبة"
            multiline

            error={errors.purpose}
          />

          <DateInput
            label="تاريخ المغادرة *"
            value={startDate}
            onChange={setStartDate}
            error={errors.startDate}
          />
          <DateInput
            label="تاريخ العودة *"
            value={endDate}
            onChange={setEndDate}
            error={errors.endDate}
            minDate={startDate || undefined}
          />

          <GSelect
            label="وسيلة التنقل"
            value={transportType}
            onChange={setTransportType}
            options={TRANSPORT_TYPES}
            placeholder="اختر وسيلة التنقل..."
          />

          <GInput
            label="التكلفة التقديرية (ريال)"
            value={estimatedCost}
            onChangeText={setEstimatedCost}
            keyboardType="numeric"
            placeholder="0.00"
          />

          <GInput
            label="ملاحظات إضافية"
            value={notes}
            onChangeText={setNotes}
            placeholder="أي تفاصيل إضافية..."
            multiline
          />

          <GButton
            title="إرسال الطلب"
            icon="send-outline"
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
