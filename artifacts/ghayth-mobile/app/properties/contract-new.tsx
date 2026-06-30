/**
 * إنشاء عقد إيجار جديد — POST /api/properties/contracts
 */
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { GCard, GButton, GInput, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

const PAYMENT_FREQUENCIES = [
  { value: 'monthly', label: 'شهري' },
  { value: 'quarterly', label: 'ربع سنوي' },
  { value: 'semi_annual', label: 'نصف سنوي' },
  { value: 'annual', label: 'سنوي' },
];

const CONTRACT_TYPES = [
  { value: 'residential', label: 'سكني' },
  { value: 'commercial', label: 'تجاري' },
  { value: 'industrial', label: 'صناعي' },
  { value: 'mixed', label: 'مختلط' },
];

interface Unit { id: number; unitNumber?: string; name?: string; buildingName?: string }
interface Tenant { id: number; name?: string; companyName?: string }
interface ListResp<T> { data?: T[] }

export default function ContractNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { unitId: unitIdParam, tenantId: tenantIdParam } = useLocalSearchParams<{ unitId?: string; tenantId?: string }>();

  const [unitId, setUnitId] = useState(unitIdParam ?? '');
  const [tenantId, setTenantId] = useState(tenantIdParam ?? '');
  const [contractType, setContractType] = useState('residential');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState('monthly');
  const [securityDeposit, setSecurityDeposit] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: unitsResp } = useList<ListResp<Unit>>('/api/properties/units', { pageSize: 200, status: 'available' });
  const { data: tenantsResp } = useList<ListResp<Tenant>>('/api/properties/tenants', { pageSize: 100 });

  const unitOptions = (unitsResp?.data ?? []).map(u => ({
    value: String(u.id),
    label: `${u.unitNumber ?? u.name ?? `وحدة #${u.id}`}${u.buildingName ? ` — ${u.buildingName}` : ''}`,
  }));
  const tenantOptions = (tenantsResp?.data ?? []).map(t => ({
    value: String(t.id),
    label: t.name ?? t.companyName ?? `مستأجر #${t.id}`,
  }));

  const mutation = useMutation('/api/properties/contracts', 'POST');

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!unitId) errs.unitId = 'اختر الوحدة العقارية';
    if (!tenantId) errs.tenantId = 'اختر المستأجر';
    if (!startDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.startDate = 'اختر تاريخ بداية العقد';
    if (!endDate.match(/^\d{4}-\d{2}-\d{2}$/)) errs.endDate = 'اختر تاريخ نهاية العقد';
    if (!rentAmount || isNaN(Number(rentAmount))) errs.rentAmount = 'أدخل قيمة الإيجار';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const onSubmit = async () => {
    if (!validate()) return;
    try {
      const body: Record<string, unknown> = {
        unitId: Number(unitId),
        tenantId: Number(tenantId),
        contractType,
        startDate,
        endDate,
        rentAmount: Number(rentAmount),
        paymentFrequency,
      };
      if (securityDeposit) body.securityDeposit = Number(securityDeposit);
      if (notes) body.notes = notes;

      await mutation.mutateAsync(body as never);
      qc.invalidateQueries({ queryKey: ['/api/properties/contracts'] });
      if (unitId) qc.invalidateQueries({ queryKey: [`/api/properties/units/${unitId}`] });
      Alert.alert('تم', 'تم إنشاء عقد الإيجار بنجاح', [
        { text: 'حسنًا', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('خطأ', e instanceof Error ? e.message : 'تعذّر إنشاء العقد');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'عقد إيجار جديد' }} />
      <ScrollView contentContainerStyle={styles.container}>
        <GCard>
          <GSelect label="الوحدة العقارية *" value={unitId} onChange={setUnitId} options={unitOptions} placeholder="اختر الوحدة..." error={errors.unitId} />
          <GSelect label="المستأجر *" value={tenantId} onChange={setTenantId} options={tenantOptions} placeholder="اختر المستأجر..." error={errors.tenantId} />
          <GSelect label="نوع العقد" value={contractType} onChange={setContractType} options={CONTRACT_TYPES} />
          <DateInput label="تاريخ البداية *" value={startDate} onChange={setStartDate} error={errors.startDate} />
          <DateInput label="تاريخ الانتهاء *" value={endDate} onChange={setEndDate} minDate={startDate} error={errors.endDate} />
          <GInput label="قيمة الإيجار (ر.س) *" value={rentAmount} onChangeText={setRentAmount} keyboardType="numeric" placeholder="0.00" error={errors.rentAmount} />
          <GSelect label="دورية الدفع" value={paymentFrequency} onChange={setPaymentFrequency} options={PAYMENT_FREQUENCIES} />
          <GInput label="التأمين (ر.س)" value={securityDeposit} onChangeText={setSecurityDeposit} keyboardType="numeric" placeholder="0.00" />
          <GInput label="ملاحظات" value={notes} onChangeText={setNotes} placeholder="شروط خاصة أو ملاحظات..." multiline />
          <GButton title="إنشاء العقد" icon="document-text-outline" onPress={onSubmit} loading={mutation.isPending} style={{ marginTop: 8 }} />
        </GCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
});
