/**
 * إضافة صنف جديد للمخزون
 * POST /api/warehouse/products
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GSelect, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';

const UNIT_OPTIONS = [
  { label: 'قطعة', value: 'pcs' },
  { label: 'كيلوغرام', value: 'kg' },
  { label: 'غرام', value: 'g' },
  { label: 'لتر', value: 'ltr' },
  { label: 'متر', value: 'm' },
  { label: 'صندوق', value: 'box' },
  { label: 'علبة', value: 'can' },
  { label: 'دزينة', value: 'doz' },
];

const TYPE_OPTIONS = [
  { label: 'بضاعة', value: 'goods' },
  { label: 'مواد خام', value: 'raw_material' },
  { label: 'منتج نهائي', value: 'finished_good' },
  { label: 'مستهلكات', value: 'consumable' },
  { label: 'قطع غيار', value: 'spare_part' },
  { label: 'أصول', value: 'asset' },
];

interface Category { id: number; name?: string; }
interface Warehouse { id: number; name?: string; }

export default function ProductNewScreen() {
  const c = useColors();
  const router = useRouter();

  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [type, setType] = useState('goods');
  const [unit, setUnit] = useState('pcs');
  const [categoryId, setCategoryId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [minStock, setMinStock] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: categories } = useList<Category[]>('/api/warehouse/categories', { pageSize: 100 });
  const { data: warehouses } = useList<Warehouse[]>('/api/warehouse/warehouses', { pageSize: 50 });

  const mutation = useMutation('/api/warehouse/products', 'POST');

  const catOptions = (Array.isArray(categories) ? categories : []).map((c: Category) => ({ label: c.name ?? String(c.id), value: String(c.id) }));
  const whOptions = (Array.isArray(warehouses) ? warehouses : []).map((w: Warehouse) => ({ label: w.name ?? String(w.id), value: String(w.id) }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'اسم الصنف مطلوب';
    if (!unit) e.unit = 'وحدة القياس مطلوبة';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await mutation.mutateAsync({
        name: name.trim(),
        sku: sku || undefined,
        barcode: barcode || undefined,
        type,
        unit,
        categoryId: categoryId ? Number(categoryId) : undefined,
        warehouseId: warehouseId ? Number(warehouseId) : undefined,
        costPrice: costPrice ? Number(costPrice) : undefined,
        sellPrice: sellPrice ? Number(sellPrice) : undefined,
        minStock: minStock ? Number(minStock) : undefined,
        description: description || undefined,
      } as never);
      Alert.alert('تم', 'تم إضافة الصنف بنجاح', [{ text: 'حسنًا', onPress: () => router.back() }]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إضافة الصنف');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'إضافة صنف جديد' }} />

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>معلومات الصنف</Text>
        <GInput label="اسم الصنف *" value={name} onChangeText={setName} placeholder="أدخل اسم الصنف" error={errors.name} />
        <GInput label="رمز الصنف (SKU)" value={sku} onChangeText={setSku} placeholder="مثال: PROD-001" />
        <GInput label="الباركود" value={barcode} onChangeText={setBarcode} placeholder="رمز الباركود" keyboardType="numeric" />
        <GSelect label="نوع الصنف" value={type} onChange={setType} options={TYPE_OPTIONS} />
        <GSelect label="وحدة القياس *" value={unit} onChange={setUnit} options={UNIT_OPTIONS} error={errors.unit} />
        {catOptions.length > 0 && (
          <GSelect label="الفئة" value={categoryId} onChange={setCategoryId} options={catOptions} placeholder="اختر الفئة" />
        )}
        {whOptions.length > 0 && (
          <GSelect label="المستودع الافتراضي" value={warehouseId} onChange={setWarehouseId} options={whOptions} placeholder="اختر المستودع" />
        )}
      </GCard>

      <GCard style={styles.card}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>التسعير والمخزون</Text>
        <GInput label="سعر التكلفة (ر.س)" value={costPrice} onChangeText={setCostPrice} placeholder="0.00" keyboardType="numeric" />
        <GInput label="سعر البيع (ر.س)" value={sellPrice} onChangeText={setSellPrice} placeholder="0.00" keyboardType="numeric" />
        <GInput label="الحد الأدنى للمخزون" value={minStock} onChangeText={setMinStock} placeholder="0" keyboardType="numeric" />
        <View style={[styles.textArea, { backgroundColor: c.inputBg, borderColor: c.inputBorder }]}>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="وصف الصنف…"
            placeholderTextColor={c.textFaint}
            multiline
            style={{ minHeight: 60, color: c.text, textAlign: 'right', textAlignVertical: 'top', fontSize: 14 }}
          />
        </View>
      </GCard>

      <GButton title="إضافة الصنف" onPress={handleSubmit} loading={mutation.isPending} style={{ marginTop: 4 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  textArea: { borderWidth: 1, borderRadius: 8, padding: 10 },
});
