/**
 * مخاطرة جديدة — POST /api/governance/risks
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

const RISK_CATEGORIES = [
  { value: 'operational', label: 'تشغيلية' },
  { value: 'financial', label: 'مالية' },
  { value: 'strategic', label: 'استراتيجية' },
  { value: 'compliance', label: 'امتثالية' },
  { value: 'reputational', label: 'سمعة' },
  { value: 'technology', label: 'تقنية' },
  { value: 'hr', label: 'موارد بشرية' },
  { value: 'legal', label: 'قانونية' },
];

const LIKELIHOOD_OPTIONS = [
  { value: '1', label: '1 — نادر جدًا' },
  { value: '2', label: '2 — نادر' },
  { value: '3', label: '3 — محتمل' },
  { value: '4', label: '4 — مرجّح' },
  { value: '5', label: '5 — شبه مؤكد' },
];

const IMPACT_OPTIONS = [
  { value: '1', label: '1 — ضئيل' },
  { value: '2', label: '2 — منخفض' },
  { value: '3', label: '3 — متوسط' },
  { value: '4', label: '4 — عالٍ' },
  { value: '5', label: '5 — كارثي' },
];

const RESPONSE_STRATEGIES = [
  { value: 'avoid', label: 'تجنب' },
  { value: 'mitigate', label: 'تخفيف' },
  { value: 'transfer', label: 'نقل' },
  { value: 'accept', label: 'قبول' },
];

export default function RiskNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('operational');
  const [description, setDescription] = useState('');
  const [likelihood, setLikelihood] = useState('3');
  const [impact, setImpact] = useState('3');
  const [responseStrategy, setResponseStrategy] = useState('mitigate');
  const [mitigationPlan, setMitigationPlan] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/governance/risks', 'POST');

  const riskScore = Number(likelihood) * Number(impact);
  const riskLevel = riskScore <= 4 ? { label: 'منخفضة', color: '#22C55E' }
    : riskScore <= 9 ? { label: 'متوسطة', color: '#F59E0B' }
    : riskScore <= 16 ? { label: 'عالية', color: '#EF4444' }
    : { label: 'حرجة', color: '#7C3AED' };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'أدخل عنوان المخاطرة';
    if (!description.trim()) errs.description = 'اشرح المخاطرة بالتفصيل';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        category,
        description: description.trim(),
        likelihood: Number(likelihood),
        impact: Number(impact),
        riskScore,
        responseStrategy,
      };
      if (mitigationPlan) body.mitigationPlan = mitigationPlan;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/governance/risks'] });
      Alert.alert('تم', 'تم تسجيل المخاطرة بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تسجيل المخاطرة');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'مخاطرة جديدة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput label="عنوان المخاطرة *" value={title} onChangeText={setTitle} placeholder="وصف موجز للمخاطرة" error={errors.title} />
          <GSelect label="التصنيف" value={category} onChange={setCategory} options={RISK_CATEGORIES} />
          <GInput label="الوصف التفصيلي *" value={description} onChangeText={setDescription} placeholder="اشرح المخاطرة وأسبابها وآثارها..." multiline error={errors.description} />
        </GCard>

        <GCard>
          <GSelect label="احتمالية الحدوث" value={likelihood} onChange={setLikelihood} options={LIKELIHOOD_OPTIONS} />
          <GSelect label="درجة التأثير" value={impact} onChange={setImpact} options={IMPACT_OPTIONS} />
          <View style={[styles.scoreBox, { backgroundColor: riskLevel.color + '20', borderColor: riskLevel.color, borderRadius: 8, borderWidth: 1, padding: 12 }]}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: riskLevel.color, textAlign: 'center' }}>
              درجة المخاطرة: {riskScore} / 25 — {riskLevel.label}
            </Text>
          </View>
        </GCard>

        <GCard>
          <GSelect label="استراتيجية الاستجابة" value={responseStrategy} onChange={setResponseStrategy} options={RESPONSE_STRATEGIES} />
          <GInput label="خطة التخفيف" value={mitigationPlan} onChangeText={setMitigationPlan} placeholder="الإجراءات المقترحة للتخفيف من المخاطرة..." multiline />
        </GCard>

        <GButton title="تسجيل المخاطرة" icon="shield-outline" onPress={onSubmit} loading={mutation.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  scoreBox: {},
});
