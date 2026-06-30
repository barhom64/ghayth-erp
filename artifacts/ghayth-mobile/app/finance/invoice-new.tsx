/**
 * إنشاء فاتورة عميل جديدة — POST /api/finance/invoices
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect, GText } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

interface Client { id: number; name?: string; companyName?: string }
interface ListResp<T> { data?: T[] }

interface LineItem {
  description: string;
  quantity: string;
  unitPrice: string;
  vatRate: string;
}

const VAT_RATES = [
  { value: '0', label: '0%' },
  { value: '5', label: '5%' },
  { value: '15', label: '15%' },
];

export default function InvoiceNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [clientId, setClientId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([{ description: '', quantity: '1', unitPrice: '', vatRate: '15' }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: clientsResp } = useList<ListResp<Client>>('/api/clients', { pageSize: 100 });
  const clientOptions = (clientsResp?.data ?? []).map(cl => ({
    value: String(cl.id),
    label: cl.name ?? cl.companyName ?? `عميل #${cl.id}`,
  }));

  const mutation = useMutation('/api/finance/invoices', 'POST');

  const addLine = () => setLines(prev => [...prev, { description: '', quantity: '1', unitPrice: '', vatRate: '15' }]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof LineItem, value: string) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const calcLine = (line: LineItem) => {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const vatRate = Number(line.vatRate) || 0;
    const subtotal = qty * price;
    const vat = subtotal * (vatRate / 100);
    return { subtotal, vat, total: subtotal + vat };
  };

  const totals = lines.reduce(
    (acc, l) => {
      const t = calcLine(l);
      return { subtotal: acc.subtotal + t.subtotal, vat: acc.vat + t.vat, total: acc.total + t.total };
    },
    { subtotal: 0, vat: 0, total: 0 }
  );

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!clientId) errs.clientId = 'اختر العميل';
    if (lines.some(l => !l.description.trim())) errs.lines = 'أدخل وصف لكل بند';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        clientId: Number(clientId),
        lines: lines.map(l => {
          const t = calcLine(l);
          return {
            description: l.description,
            quantity: Number(l.quantity) || 1,
            unitPrice: Number(l.unitPrice) || 0,
            vatRate: Number(l.vatRate) || 0,
            subtotal: t.subtotal,
            vatAmount: t.vat,
            total: t.total,
          };
        }),
        subtotal: totals.subtotal,
        vatAmount: totals.vat,
        total: totals.total,
      };
      if (issueDate) body.issueDate = issueDate;
      if (dueDate) body.dueDate = dueDate;
      if (notes) body.notes = notes;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/finance/invoices'] });
      Alert.alert('تم', 'تم إنشاء الفاتورة بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إنشاء الفاتورة');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'فاتورة جديدة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="العميل *"
            value={clientId}
            onChange={setClientId}
            options={clientOptions}
            placeholder="اختر العميل..."
            error={errors.clientId}
          />
          <DateInput label="تاريخ الإصدار" value={issueDate} onChange={setIssueDate} />
          <DateInput label="تاريخ الاستحقاق" value={dueDate} onChange={setDueDate} />
        </GCard>

        <GText variant="subheading" style={{ fontWeight: '700', marginTop: 4 }}>البنود</GText>
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
              placeholder="اسم الخدمة أو المنتج"
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <GInput label="الكمية" value={line.quantity} onChangeText={v => updateLine(i, 'quantity', v)} keyboardType="numeric" placeholder="1" />
              </View>
              <View style={{ flex: 2 }}>
                <GInput label="سعر الوحدة" value={line.unitPrice} onChangeText={v => updateLine(i, 'unitPrice', v)} keyboardType="numeric" placeholder="0.00" />
              </View>
            </View>
            <GSelect label="نسبة الضريبة" value={line.vatRate} onChange={v => updateLine(i, 'vatRate', v)} options={VAT_RATES} />
            {line.unitPrice ? (
              <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right' }}>
                الإجمالي: {calcLine(line).total.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س
                (ضريبة: {calcLine(line).vat.toLocaleString('ar-SA', { maximumFractionDigits: 2 })})
              </Text>
            ) : null}
          </GCard>
        ))}

        <GButton title="إضافة بند" icon="add-circle-outline" variant="secondary" onPress={addLine} />

        {totals.total > 0 && (
          <GCard style={{ gap: 0, padding: 0 }}>
            {[
              { label: 'المجموع الفرعي', value: totals.subtotal },
              { label: 'ضريبة القيمة المضافة', value: totals.vat },
              { label: 'الإجمالي', value: totals.total, bold: true },
            ].map((row, i, arr) => (
              <View key={row.label} style={[styles.totalRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
                <Text style={{ fontSize: row.bold ? 16 : 14, fontWeight: row.bold ? '700' : '400', color: c.text }}>
                  {row.value.toLocaleString('ar-SA', { maximumFractionDigits: 2 })} ر.س
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted }}>{row.label}</Text>
              </View>
            ))}
          </GCard>
        )}

        <GCard>
          <GInput label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="شروط الدفع أو ملاحظات إضافية..." multiline />
          <GButton title="إنشاء الفاتورة" icon="receipt-outline" onPress={onSubmit} loading={mutation.isPending} style={{ marginTop: 8 }} />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  lineHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 },
});
