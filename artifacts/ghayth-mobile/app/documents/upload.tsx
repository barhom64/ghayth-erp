/**
 * رفع مستند — POST /api/documents
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { takePhoto } from '@/hooks/useNative';
import type { PhotoResult } from '@/hooks/useNative';
import { DateInput } from '@/components/DateInput';

const DOC_CATEGORIES = [
  { value: 'contract', label: 'عقد' },
  { value: 'invoice', label: 'فاتورة' },
  { value: 'certificate', label: 'شهادة / ترخيص' },
  { value: 'id', label: 'هوية / جواز' },
  { value: 'report', label: 'تقرير' },
  { value: 'policy', label: 'سياسة / لائحة' },
  { value: 'letter', label: 'خطاب رسمي' },
  { value: 'other', label: 'أخرى' },
];

const ENTITY_TYPES = [
  { value: 'employee', label: 'موظف' },
  { value: 'client', label: 'عميل' },
  { value: 'vendor', label: 'مورد' },
  { value: 'project', label: 'مشروع' },
  { value: 'vehicle', label: 'مركبة' },
  { value: 'property', label: 'عقار' },
  { value: 'legal_case', label: 'قضية' },
  { value: 'general', label: 'عام' },
];

export default function DocumentUploadScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { entityType: entityTypeParam, entityId: entityIdParam } = useLocalSearchParams<{
    entityType?: string;
    entityId?: string;
  }>();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('other');
  const [entityType, setEntityType] = useState(entityTypeParam ?? 'general');
  const [entityId, setEntityId] = useState(entityIdParam ?? '');
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [photo, setPhoto] = useState<PhotoResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/documents', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'أدخل عنوان المستند';
    if (!photo) errs.photo = 'يجب التقاط صورة المستند أو ملف PDF';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        category,
        entityType,
        fileBase64: photo!.base64,
        mimeType: photo!.mimeType,
      };
      if (entityId) body.entityId = Number(entityId);
      if (expiryDate) body.expiryDate = expiryDate;
      if (notes) body.notes = notes;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/documents'] });
      Alert.alert('تم', 'تم رفع المستند بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر رفع المستند');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'رفع مستند' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput
            label="عنوان المستند *"
            value={title}
            onChangeText={setTitle}
            placeholder="اسم أو وصف المستند"
            error={errors.title}
          />

          <GSelect
            label="التصنيف"
            value={category}
            onChange={setCategory}
            options={DOC_CATEGORIES}
          />

          <GSelect
            label="نوع الكيان المرتبط"
            value={entityType}
            onChange={setEntityType}
            options={ENTITY_TYPES}
          />

          {entityType !== 'general' && (
            <GInput
              label="رقم الكيان"
              value={entityId}
              onChangeText={setEntityId}
              keyboardType="numeric"
              placeholder="معرّف السجل المرتبط"
            />
          )}

          <DateInput
            label="تاريخ انتهاء الصلاحية"
            value={expiryDate}
            onChange={setExpiryDate}
          />

          <GInput
            label="ملاحظات"
            value={notes}
            onChangeText={setNotes}
            placeholder="أي ملاحظات إضافية..."
            multiline
          />

          <GButton
            title={photo ? `تم اختيار الملف ✓` : 'التقاط / اختيار الملف *'}
            icon="document-attach-outline"
            variant={photo ? 'primary' : 'secondary'}
            onPress={async () => {
              const p = await takePhoto();
              if (p) setPhoto(p);
            }}
          />
          {errors.photo ? (
            <Text style={{ color: c.danger, fontSize: 12, textAlign: 'right' }}>{errors.photo}</Text>
          ) : null}

          {photo && (
            <View style={[styles.fileInfo, { backgroundColor: c.surfaceAlt, borderColor: c.border }]}>
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                تم التقاط الملف بنجاح ({photo.mimeType})
              </Text>
            </View>
          )}

          <GButton
            title="رفع المستند"
            icon="cloud-upload-outline"
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
  fileInfo: { padding: 10, borderRadius: 8, borderWidth: 1 },
});
