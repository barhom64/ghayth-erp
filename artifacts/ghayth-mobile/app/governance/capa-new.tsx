/**
 * إجراء تصحيحي / وقائي جديد (CAPA)
 * POST /api/governance/capas
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const TYPE_OPTIONS = [
  { label: 'تصحيحي', value: 'corrective' },
  { label: 'وقائي', value: 'preventive' },
];

const PRIORITY_OPTIONS = [
  { label: 'منخفضة', value: 'low' },
  { label: 'متوسطة', value: 'medium' },
  { label: 'عالية', value: 'high' },
  { label: 'حرجة', value: 'critical' },
];

const SOURCE_OPTIONS = [
  { label: 'تدقيق داخلي', value: 'internal_audit' },
  { label: 'تدقيق خارجي', value: 'external_audit' },
  { label: 'شكوى عميل', value: 'customer_complaint' },
  { label: 'مخاطرة', value: 'risk' },
  { label: 'عدم مطابقة', value: 'non_conformance' },
  { label: 'أخرى', value: 'other' },
];

export default function CapaNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { riskId, auditId } = useLocalSearchParams<{ riskId?: string; auditId?: string }>();

  const [title, setTitle] = useState('');
  const [type, setType] = useState('corrective');
  const [priority, setPriority] = useState('medium');
  const [source, setSource] = useState('other');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [action, setAction] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/governance/capas', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'عنوان الإجراء مطلوب';
    if (!action.trim()) e.action = 'الإجراء المقترح مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        title: title.trim(),
        type,
        priority,
        source,
        assignee: assignee || undefined,
        dueDate: dueDate || undefined,
        rootCause: rootCause || undefined,
        action: action.trim(),
        riskId: riskId ? Number(riskId) : undefined,
        auditId: auditId ? Number(auditId) : undefined,
      } as never);
      Alert.alert('تم', 'تم إنشاء الإجراء بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إنشاء الإجراء');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'إجراء تصحيحي / وقائي' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>معلومات الإجراء</Text>
        <GInput label="العنوان *" value={title} onChangeText={setTitle} placeholder="أدخل عنوان الإجراء" error={errors.title} />
        <GSelect label="النوع" value={type} onChange={setType} options={TYPE_OPTIONS} />
        <GSelect label="الأولوية" value={priority} onChange={setPriority} options={PRIORITY_OPTIONS} />
        <GSelect label="المصدر" value={source} onChange={setSource} options={SOURCE_OPTIONS} />
        <GInput label="المسؤول" value={assignee} onChangeText={setAssignee} placeholder="اسم المسؤول عن التنفيذ" />
        <DateInput label="تاريخ الاستحقاق" value={dueDate} onChange={setDueDate} />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>التحليل والإجراء</Text>
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={rootCause}
            onChangeText={setRootCause}
            placeholder="السبب الجذري…"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 70, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={action}
            onChangeText={setAction}
            placeholder="الإجراء المقترح *"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
        {errors.action ? <Text style={{ color: '#EF4444', textAlign: 'right', fontSize: 12 }}>{errors.action}</Text> : null}
      </GCard>

      <GButton title="إنشاء الإجراء" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
