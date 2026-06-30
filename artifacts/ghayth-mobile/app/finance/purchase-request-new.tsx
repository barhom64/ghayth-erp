/**
 * طلب شراء جديد — POST /api/finance/purchase-requests
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const PRIORITIES = [
  { value: 'urgent', label: 'عاجل' },
  { value: 'high', label: 'عالية' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'low', label: 'منخفضة' },
];

interface Vendor { id: number; name?: string }
interface ListResp<T> { data?: T[] }

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
}

export default function PurchaseRequestNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [vendorId, setVendorId] = useState('');
  const [requiredDate, setRequiredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([{ description: '', quantity: '1', unitPrice: '' }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: vendorsResp } = useList<ListResp<Vendor>>('/api/finance/vendors', { pageSize: 100 });
  const vendorOptions = (vendorsResp?.data ?? []).map(v => ({
    value: String(v.id),
    label: v.name ?? `مورد #${v.id}`,
  }));

  const mutation = useMutation('/api/finance/purchase-requests', 'POST');

  const addLine = () => setLines(prev => [...prev, { description: '', quantity: '1', unitPrice: '' }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof LineItem, value: string) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const total = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'أدخل عنوان طلب الشراء';
    if (lines.some(l => !l.description.trim())) errs.lines = 'أدخل وصف لكل بند';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        priority,
        lines: lines.map(l => ({
          description: l.description,
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || 0,
          total: (Number(l.quantity) || 1) * (Number(l.unitPrice) || 0),
        })),
      };
      if (vendorId) body.vendorId = Number(vendorId);
      if (requiredDate) body.requiredDate = requiredDate;
      if (notes) body.notes = notes;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/finance/purchase-requests'] });
      Alert.alert('تم', 'تم إرسال طلب الشراء للاعتماد', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إرسال الطلب');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'طلب شراء جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GInput
            label="عنوان الطلب *"
            value={title}
            onChangeText={setTitle}
            placeholder="ما الذي نريد شراءه؟"
            error={errors.title}
          />

          <GSelect
            label="الأولوية"
            value={priority}
            onChange={setPriority}
            options={PRIORITIES}
          />

          <GSelect
            label="المورد المقترح"
            value={vendorId}
            onChange={setVendorId}
            options={vendorOptions}
            placeholder="اختر المورد (اختياري)..."
          />

          <DateInput
            label="التاريخ المطلوب"
            value={requiredDate}
            onChange={setRequiredDate}
          />
        </GCard>

        {/* بنود الطلب */}
        <GText variant="subheading" style={{ fontWeight: '700', marginTop: 4 }}>بنود الطلب</GText>
        {errors.lines ? <Text style={{ color: c.danger, fontSize: 12, textAlign: 'right' }}>{errors.lines}</Text> : null}

        {lines.map((line, i) => (
          <GCard key={i} style={{ gap: 8 }}>
            <View style={styles.lineHeader}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text }}>بند {i + 1}</Text>
              {lines.length > 1 && (
                <Pressable onPress={() => removeLine(i)}>
                  <Ionicons name="trash-outline" size={18} color={c.danger} />
                </Pressable>
              )}
            </View>
            <GInput
              label="الوصف *"
              value={line.description}
              onChangeText={v => updateLine(i, 'description', v)}
              placeholder="اسم / وصف الصنف أو الخدمة"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <GInput
                  label="الكمية"
                  value={line.quantity}
                  onChangeText={v => updateLine(i, 'quantity', v)}
                  keyboardType="numeric"
                  placeholder="1"
                />
              </View>
              <View style={{ flex: 1 }}>
                <GInput
                  label="سعر الوحدة"
                  value={line.unitPrice}
                  onChangeText={v => updateLine(i, 'unitPrice', v)}
                  keyboardType="numeric"
                  placeholder="0.00"
                />
              </View>
            </View>
            {line.quantity && line.unitPrice ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                الإجمالي: {((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0)).toLocaleString('ar-SA')} ر.س
              </Text>
            ) : null}
          </GCard>
        ))}

        <GButton
          title="إضافة بند"
          icon="add-circle-outline"
          variant="secondary"
          onPress={addLine}
        />

        {total > 0 && (
          <GCard>
            <Text style={{ fontSize: 16, fontWeight: '700', color: c.text, textAlign: 'right' }}>
              الإجمالي الكلي: {total.toLocaleString('ar-SA')} ر.س
            </Text>
          </GCard>
        )}

        <GCard>
          <GInput
            label="ملاحظات"
            value={notes}
            onChangeText={setNotes}
            placeholder="أي معلومات إضافية..."
            multiline
          />

          <GButton
            title="إرسال طلب الشراء"
            icon="cart-outline"
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
  container: { padding: 16, gap: 12 },
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', gap: 12 },
});
