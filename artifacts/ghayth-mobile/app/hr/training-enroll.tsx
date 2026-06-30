/**
 * التسجيل في برنامج تدريبي — POST /api/hr/training-enrollments
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';

interface Training {
  id: number;
  title?: string;
  name?: string;
  startDate?: string;
  endDate?: string;
  venue?: string;
  cost?: number;
  availableSeats?: number;
}
interface ListResp<T> { data?: T[] }

function fmtDate(val?: string): string {
  if (!val) return '';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function TrainingEnrollScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { trainingId: trainingIdParam } = useLocalSearchParams<{ trainingId?: string }>();

  const [trainingId, setTrainingId] = useState(trainingIdParam ?? '');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: trainingsResp } = useList<ListResp<Training>>('/api/hr/trainings', { pageSize: 50, status: 'upcoming' });

  const trainingOptions = (trainingsResp?.data ?? []).map(t => ({
    value: String(t.id),
    label: t.title ?? t.name ?? `برنامج #${t.id}`,
  }));

  const selectedTraining = (trainingsResp?.data ?? []).find(t => String(t.id) === trainingId);

  const mutation = useMutation('/api/hr/training-enrollments', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!trainingId) errs.trainingId = 'اختر البرنامج التدريبي';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({ trainingId: Number(trainingId), notes: notes || undefined } as never);
      qc.invalidateQueries({ queryKey: ['/api/hr/training-enrollments'] });
      Alert.alert('تم', 'تم تسجيلك في البرنامج التدريبي بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر التسجيل');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'التسجيل في برنامج تدريبي' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="البرنامج التدريبي *"
            value={trainingId}
            onChange={setTrainingId}
            options={trainingOptions}
            placeholder="اختر البرنامج..."
            error={errors.trainingId}
          />

          {selectedTraining && (
            <View style={[styles.infoBox, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <GText variant="caption" color="muted">تفاصيل البرنامج</GText>
              {selectedTraining.startDate ? (
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>
                  التاريخ: {fmtDate(selectedTraining.startDate)} — {fmtDate(selectedTraining.endDate)}
                </Text>
              ) : null}
              {selectedTraining.venue ? (
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>
                  المكان: {selectedTraining.venue}
                </Text>
              ) : null}
              {selectedTraining.cost !== undefined ? (
                <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>
                  التكلفة: {Number(selectedTraining.cost).toLocaleString('ar-SA')} ر.س
                </Text>
              ) : null}
              {selectedTraining.availableSeats !== undefined ? (
                <Text style={{ fontSize: 13, color: selectedTraining.availableSeats > 0 ? '#22C55E' : c.danger, textAlign: 'right', fontWeight: '600' }}>
                  المقاعد المتاحة: {selectedTraining.availableSeats}
                </Text>
              ) : null}
            </View>
          )}

          <GInput
            label="ملاحظات"
            value={notes}
            onChangeText={setNotes}
            placeholder="أسباب التسجيل أو أي ملاحظات..."
            multiline
          />

          <GButton
            title="تسجيل في البرنامج"
            icon="school-outline"
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
  infoBox: { padding: 12, borderRadius: 8, borderWidth: 1, gap: 4 },
});
