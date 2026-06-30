/**
 * إنشاء تدقيق جديد
 * POST /api/governance/audits
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const AUDIT_TYPES = [
  { label: 'داخلي', value: 'internal' },
  { label: 'خارجي', value: 'external' },
  { label: 'جودة', value: 'quality' },
  { label: 'مالي', value: 'financial' },
  { label: 'امتثال', value: 'compliance' },
  { label: 'أمن المعلومات', value: 'security' },
];

const STATUS_OPTIONS = [
  { label: 'مخطط', value: 'planned' },
  { label: 'جارٍ', value: 'in_progress' },
  { label: 'مكتمل', value: 'completed' },
];

export default function AuditNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [type, setType] = useState('internal');
  const [status, setStatus] = useState('planned');
  const [auditor, setAuditor] = useState('');
  const [department, setDepartment] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [scope, setScope] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/governance/audits', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'عنوان التدقيق مطلوب';
    if (!startDate) e.startDate = 'تاريخ البدء مطلوب';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        title: title.trim(),
        type,
        status,
        auditor: auditor || undefined,
        department: department || undefined,
        startDate,
        endDate: endDate || undefined,
        scope: scope || undefined,
      } as never);
      Alert.alert('تم', 'تم إنشاء التدقيق بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إنشاء التدقيق');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'تدقيق جديد' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>تفاصيل التدقيق</Text>
        <GInput label="عنوان التدقيق *" value={title} onChangeText={setTitle} placeholder="أدخل عنوان التدقيق" error={errors.title} />
        <GSelect label="النوع" value={type} onChange={setType} options={AUDIT_TYPES} />
        <GSelect label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <GInput label="المدقق" value={auditor} onChangeText={setAuditor} placeholder="اسم المدقق" />
        <GInput label="القسم / الجهة" value={department} onChangeText={setDepartment} placeholder="القسم المستهدف" />
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>الجدول الزمني</Text>
        <DateInput label="تاريخ البدء *" value={startDate} onChange={setStartDate} error={errors.startDate} />
        <DateInput label="تاريخ الانتهاء" value={endDate} onChange={setEndDate} minDate={startDate || undefined} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={scope}
            onChangeText={setScope}
            placeholder="نطاق التدقيق…"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
      </GCard>

      <GButton title="إنشاء التدقيق" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
