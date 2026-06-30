/**
 * طلب إنهاء الخدمة / الاستقالة — POST /api/hr/exit-requests
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const EXIT_TYPES = [
  { value: 'resignation', label: 'استقالة' },
  { value: 'retirement', label: 'تقاعد' },
  { value: 'end_of_contract', label: 'انتهاء العقد' },
  { value: 'termination', label: 'إنهاء من قِبل الشركة' },
  { value: 'transfer', label: 'نقل لشركة أخرى' },
  { value: 'death', label: 'وفاة' },
];

export default function ExitRequestNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [exitType, setExitType] = useState('resignation');
  const [lastWorkDay, setLastWorkDay] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/hr/exit-requests', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!lastWorkDay.match(/^\d{4}-\d{2}-\d{2}$/)) errs.lastWorkDay = 'اختر آخر يوم عمل';
    if (!confirmed) errs.confirm = 'يجب تأكيد الطلب قبل الإرسال';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    Alert.alert(
      'تأكيد نهائي',
      'هذا الطلب لا يمكن التراجع عنه بعد الإرسال. هل أنت متأكد؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'إرسال',
          style: 'destructive',
          onPress: async () => {
            try {
              await mutation.mutateAsync({ exitType, lastWorkDay, reason: reason || undefined } as never);
              qc.invalidateQueries({ queryKey: ['/api/hr/exit-requests'] });
              Alert.alert('تم', 'تم إرسال طلب إنهاء الخدمة وسيتم مراجعته من قِبل الإدارة', [
                { text: 'حسنًا', onPress: () => router.back() },
              ]);
            } catch (e: unknown) {
              Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب إنهاء الخدمة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.warningBox, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
          <Ionicons name="warning-outline" size={20} color="#D97706" />
          <Text style={{ flex: 1, fontSize: 13, color: '#92400E', textAlign: 'right', marginRight: 8 }}>
            هذا الطلب سيُحوَّل للموارد البشرية وسيبدأ إجراءات تسوية المستحقات والمغادرة الرسمية.
          </Text>
        </View>

        <GCard>
          <GSelect
            label="نوع إنهاء الخدمة"
            value={exitType}
            onChange={setExitType}
            options={EXIT_TYPES}
          />

          <DateInput
            label="آخر يوم عمل *"
            value={lastWorkDay}
            onChange={setLastWorkDay}
            error={errors.lastWorkDay}
          />

          <GInput
            label="سبب الإنهاء"
            value={reason}
            onChangeText={setReason}
            placeholder="اشرح سبب الإنهاء..."
            multiline
          />
        </GCard>

        {/* تأكيد */}
        <GCard>
          <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', marginBottom: 12, lineHeight: 22 }}>
            أقر بأن هذا الطلب مقدَّم بمحض إرادتي، وأنني مدرك لتداعياته المهنية والمالية وفق نظام العمل السعودي.
          </Text>
          <GButton
            title={confirmed ? 'تم التأكيد ✓' : 'أؤكد وأوافق على ما سبق'}
            icon={confirmed ? 'checkmark-circle' : 'checkmark-circle-outline'}
            variant={confirmed ? 'primary' : 'secondary'}
            onPress={() => setConfirmed(!confirmed)}
          />
          {errors.confirm ? <Text style={{ color: c.danger, fontSize: 12, textAlign: 'right', marginTop: 4 }}>{errors.confirm}</Text> : null}
        </GCard>

        <GButton
          title="إرسال طلب إنهاء الخدمة"
          icon="exit-outline"
          onPress={onSubmit}
          loading={mutation.isPending}
          style={{ backgroundColor: c.danger }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  warningBox: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 12, borderRadius: 8, borderWidth: 1, gap: 8 },
});
