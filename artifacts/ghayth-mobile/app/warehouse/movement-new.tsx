/**
 * حركة مخزون جديدة (إضافة / سحب / تحويل) — POST /api/warehouse/movements
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const MOVEMENT_TYPES = [
  { value: 'in', label: 'إضافة / استلام' },
  { value: 'out', label: 'سحب / صرف' },
  { value: 'transfer', label: 'تحويل بين مستودعين' },
  { value: 'adjustment', label: 'تسوية جرد' },
  { value: 'return_in', label: 'إرجاع من العميل' },
  { value: 'return_out', label: 'إرجاع للمورد' },
];

interface Product { id: number; name?: string; sku?: string }
interface Warehouse { id: number; name?: string }
interface ListResp<T> { data?: T[] }

export default function MovementNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();

  const [movementType, setMovementType] = useState('out');
  const [productId, setProductId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [movementDate, setMovementDate] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: productsResp } = useList<ListResp<Product>>('/api/warehouse/products', { pageSize: 100 });
  const { data: warehousesResp } = useList<ListResp<Warehouse>>('/api/warehouse/warehouses', { pageSize: 50 });

  const productOptions = (productsResp?.data ?? []).map(p => ({
    value: String(p.id),
    label: `${p.name ?? `صنف #${p.id}`}${p.sku ? ` (${p.sku})` : ''}`,
  }));
  const warehouseOptions = (warehousesResp?.data ?? []).map(w => ({
    value: String(w.id),
    label: w.name ?? `مستودع #${w.id}`,
  }));

  const mutation = useMutation('/api/warehouse/movements', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!movementType) errs.movementType = 'اختر نوع الحركة';
    if (!productId) errs.productId = 'اختر الصنف';
    if (!warehouseId) errs.warehouseId = 'اختر المستودع';
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) errs.quantity = 'أدخل الكمية';
    if (movementType === 'transfer' && !toWarehouseId) errs.toWarehouseId = 'اختر المستودع المستهدف';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        movementType,
        productId: Number(productId),
        warehouseId: Number(warehouseId),
        quantity: Number(quantity),
      };
      if (toWarehouseId) body.toWarehouseId = Number(toWarehouseId);
      if (unitCost) body.unitCost = Number(unitCost);
      if (movementDate) body.movementDate = movementDate;
      if (reference) body.reference = reference;
      if (notes) body.notes = notes;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/warehouse/movements'] });
      qc.invalidateQueries({ queryKey: ['/api/warehouse/products'] });
      Alert.alert('تم', 'تم تسجيل حركة المخزون بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر تسجيل الحركة');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'حركة مخزون جديدة' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect
            label="نوع الحركة *"
            value={movementType}
            onChange={setMovementType}
            options={MOVEMENT_TYPES}
            error={errors.movementType}
          />

          <GSelect
            label="الصنف *"
            value={productId}
            onChange={setProductId}
            options={productOptions}
            placeholder="اختر الصنف..."
            error={errors.productId}
          />

          <GSelect
            label="المستودع *"
            value={warehouseId}
            onChange={setWarehouseId}
            options={warehouseOptions}
            placeholder="اختر المستودع..."
            error={errors.warehouseId}
          />

          {movementType === 'transfer' && (
            <GSelect
              label="المستودع المستهدف *"
              value={toWarehouseId}
              onChange={setToWarehouseId}
              options={warehouseOptions}
              placeholder="اختر المستودع المستهدف..."
              error={errors.toWarehouseId}
            />
          )}

          <GInput
            label="الكمية *"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="numeric"
            placeholder="0"
            error={errors.quantity}
          />

          <GInput
            label="سعر الوحدة"
            value={unitCost}
            onChangeText={setUnitCost}
            keyboardType="numeric"
            placeholder="0.00"
          />

          <DateInput
            label="تاريخ الحركة"
            value={movementDate}
            onChange={setMovementDate}
          />

          <GInput
            label="رقم المرجع"
            value={reference}
            onChangeText={setReference}
            placeholder="رقم أمر الشراء / الطلب / السند..."
          />

          <GInput
            label="ملاحظات"
            value={notes}
            onChangeText={setNotes}
            placeholder="أي تفاصيل إضافية..."
            multiline
          />

          <GButton
            title="تسجيل الحركة"
            icon="swap-horizontal-outline"
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
