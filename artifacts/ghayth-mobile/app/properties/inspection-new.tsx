/**
 * فحص عقاري جديد
 * POST /api/properties/inspections
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const INSPECTION_TYPES = [
  { label: 'دوري', value: 'routine' },
  { label: 'ما قبل التأجير', value: 'pre_lease' },
  { label: 'ما بعد الإخلاء', value: 'post_vacancy' },
  { label: 'شكوى', value: 'complaint' },
  { label: 'صيانة', value: 'maintenance' },
];

const RESULT_OPTIONS = [
  { label: 'ممتاز', value: 'excellent' },
  { label: 'جيد', value: 'good' },
  { label: 'يحتاج صيانة', value: 'needs_maintenance' },
  { label: 'خطر', value: 'hazardous' },
];

interface Unit { id: number; unitNumber?: string; propertyName?: string; }

export default function InspectionNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { unitId } = useLocalSearchParams<{ unitId?: string }>();

  const [selectedUnit, setSelectedUnit] = useState(unitId ?? '');
  const [type, setType] = useState('routine');
  const [inspectionDate, setInspectionDate] = useState('');
  const [result, setResult] = useState('good');
  const [inspector, setInspector] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: units } = useList<Unit[]>('/api/properties/units', { pageSize: 200 });
  const mutation = useMutation('/api/properties/inspections', 'POST');

  const unitOptions = (Array.isArray(units) ? units : []).map((u: Unit) => ({
    label: `${u.unitNumber ?? String(u.id)}${u.propertyName ? ` — ${u.propertyName}` : ''}`,
    value: String(u.id),
  }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!selectedUnit) e.unitId = 'يجب اختيار الوحدة';
    if (!inspectionDate) e.inspectionDate = 'تاريخ الفحص مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        unitId: Number(selectedUnit),
        type,
        inspectionDate,
        result,
        inspector: inspector || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم تسجيل عملية الفحص', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'فحص عقاري جديد' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>بيانات الفحص</Text>
        {!unitId && unitOptions.length > 0 && (
          <GSelect label="الوحدة *" value={selectedUnit} onChange={setSelectedUnit} options={unitOptions} placeholder="اختر الوحدة" error={errors.unitId} />
        )}
        <DateInput label="تاريخ الفحص *" value={inspectionDate} onChange={setInspectionDate} error={errors.inspectionDate} />
        <GSelect label="نوع الفحص" value={type} onChange={setType} options={INSPECTION_TYPES} />
        <GSelect label="نتيجة الفحص" value={result} onChange={setResult} options={RESULT_OPTIONS} />
        <GInput label="المفتش" value={inspector} onChangeText={setInspector} placeholder="اسم المفتش" />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>ملاحظات</Text>
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات الفحص…" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
        </View>
      </GCard>

      <GButton title="حفظ الفحص" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
