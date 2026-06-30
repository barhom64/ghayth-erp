/**
 * طلب صيانة عقارية — POST /api/properties/maintenance-requests
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { takePhoto } from '@/hooks/useNative';
import type { PhotoResult } from '@/hooks/useNative';

const CATEGORIES = [
  { value: 'plumbing', label: 'سباكة' },
  { value: 'electrical', label: 'كهرباء' },
  { value: 'hvac', label: 'تكييف' },
  { value: 'painting', label: 'دهانات' },
  { value: 'carpentry', label: 'نجارة' },
  { value: 'cleaning', label: 'تنظيف' },
  { value: 'security', label: 'أمن وسلامة' },
  { value: 'structural', label: 'هيكل المبنى' },
  { value: 'elevator', label: 'مصعد' },
  { value: 'other', label: 'أخرى' },
];

const PRIORITIES = [
  { value: 'urgent', label: 'عاجل (خطر فوري)' },
  { value: 'high', label: 'عالية' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'low', label: 'منخفضة' },
];

interface Unit { id: number; unitNumber?: string; name?: string; buildingName?: string }
interface UnitsResp { data?: Unit[] }

export default function MaintenanceNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState('medium');
  const [unitId, setUnitId] = useState('');
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<PhotoResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: unitsResp } = useList<UnitsResp>('/api/properties/units', { pageSize: 100 });
  const unitOptions = (unitsResp?.data ?? []).map(u => ({
    value: String(u.id),
    label: `${u.unitNumber ?? u.name ?? `وحدة #${u.id}`}${u.buildingName ? ` — ${u.buildingName}` : ''}`,
  }));

  const mutation = useMutation('/api/properties/maintenance-requests', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!category) errs.category = 'اختر تصنيف العطل';
    if (!description.trim() || description.trim().length < 10) errs.description = 'أدخل وصفًا للمشكلة (10 أحرف على الأقل)';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        category,
        priority,
        description,
      };
      if (unitId) body.unitId = Number(unitId);
      if (photo) body.photoBase64 = photo.base64;
      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/properties/maintenance-requests'] });
      Alert.alert('تم', 'تم إرسال طلب الصيانة وسيتم التواصل معك قريبًا', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب صيانة جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="تصنيف العطل *"
            value={category}
            onChange={setCategory}
            options={CATEGORIES}
            placeholder="اختر نوع المشكلة..."
            error={errors.category}
          />

          <GSelect
            label="الأولوية"
            value={priority}
            onChange={setPriority}
            options={PRIORITIES}
          />

          {unitOptions.length > 0 && (
            <GSelect
              label="الوحدة العقارية"
              value={unitId}
              onChange={setUnitId}
              options={unitOptions}
              placeholder="اختر الوحدة (اختياري)..."
            />
          )}

          <GInput
            label="وصف المشكلة *"
            value={description}
            onChangeText={setDescription}
            placeholder="اشرح المشكلة بالتفصيل: ماذا حدث؟ أين بالضبط؟"
            multiline
            error={errors.description}
          />

          <GButton
            title={photo ? 'تم إرفاق الصورة ✓' : 'التقط صورة للعطل'}
            icon="camera-outline"
            variant="secondary"
            onPress={async () => {
              const p = await takePhoto();
              if (p) setPhoto(p);
            }}
          />

          <GButton
            title="إرسال طلب الصيانة"
            icon="build-outline"
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
