/**
 * أمر شراء جديد
 * POST /api/finance/purchase-orders
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';


export default function أمرشراءجديدScreen() {
  const c = useColors();
  const router = useRouter();

  const [vendorName, setVendorName] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation('/api/finance/purchase-orders', 'POST');

  const validate = () => {
    const e: Record<string, string> = {};
    if (!vendorName) e['vendorName'] = 'اسم المورد مطلوب';
    if (!totalAmount) e['totalAmount'] = 'المبلغ الإجمالي مطلوب';
    if (!orderDate) e['orderDate'] = 'تاريخ الطلب مطلوب';
    setErrors(e); return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        vendorName: vendorName || undefined,
        totalAmount: totalAmount || undefined,
        orderDate: orderDate || undefined,
        expectedDelivery: expectedDelivery || undefined,
        notes: notes || undefined,
      } as never);
      Alert.alert('تم', 'تم الحفظ بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر الحفظ');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'أمر شراء جديد' }} />
      <GCard style={styles.card}>
        <GInput label="اسم المورد *" value={vendorName} onChangeText={setVendorName} placeholder="اسم المورد" error={errors["vendorName"]} />
        <GInput label="المبلغ الإجمالي *" value={totalAmount} onChangeText={setTotalAmount} placeholder="المبلغ" error={errors["totalAmount"]} />
        <DateInput label="تاريخ الطلب *" value={orderDate} onChange={setOrderDate} error={errors["orderDate"]} />
        <DateInput label="تاريخ التسليم المتوقع" value={expectedDelivery} onChange={setExpectedDelivery} error={errors["expectedDelivery"]} />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput value={notes} onChangeText={setNotes} placeholder="ملاحظات" placeholderTextColor={c.textFaint} multiline style={{ minHeight: 80, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }} />
        </View>
      </GCard>
      <GButton title="حفظ" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
