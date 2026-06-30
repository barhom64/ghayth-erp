/**
 * إنشاء حملة تسويقية جديدة
 * POST /api/marketing/campaigns
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';
import { useQueryClient } from '@tanstack/react-query';

const TYPE_OPTIONS = [
  { value: 'digital', label: 'رقمي' },
  { value: 'print', label: 'مطبوع' },
  { value: 'outdoor', label: 'خارجي' },
  { value: 'social', label: 'تواصل اجتماعي' },
  { value: 'email', label: 'بريد إلكتروني' },
  { value: 'sms', label: 'رسائل نصية' },
  { value: 'event', label: 'فعالية' },
];

const CHANNEL_OPTIONS = [
  { value: 'social', label: 'تواصل اجتماعي' },
  { value: 'email', label: 'بريد إلكتروني' },
  { value: 'sms', label: 'رسائل نصية' },
  { value: 'digital', label: 'رقمي' },
  { value: 'print', label: 'مطبوع' },
  { value: 'outdoor', label: 'خارجي' },
  { value: 'event', label: 'فعالية' },
];

export default function CampaignNewScreen() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const mutation = useMutation('/api/marketing/campaigns', 'POST');

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [channel, setChannel] = useState('');
  const [budget, setBudget] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('خطأ', 'اسم الحملة مطلوب'); return; }
    setLoading(true);
    try {
      await (mutation.mutateAsync as (v: Record<string, unknown>) => Promise<unknown>)({
        name: name.trim(),
        type: type || undefined,
        channel: channel || undefined,
        budget: budget ? Number(budget) : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        targetAudience: targetAudience || undefined,
        description: description || undefined,
      });
      await qc.invalidateQueries({ queryKey: ['/api/marketing/campaigns'] });
      router.back();
    } catch {
      Alert.alert('خطأ', 'تعذّر إنشاء الحملة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'حملة جديدة' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }}>
        <GCard style={{ gap: 12 }}>
          <GInput label="اسم الحملة *" value={name} onChangeText={setName} placeholder="اسم الحملة التسويقية" />
          <GSelect label="النوع" value={type} onChange={setType} options={TYPE_OPTIONS} placeholder="اختر النوع" />
          <GSelect label="القناة" value={channel} onChange={setChannel} options={CHANNEL_OPTIONS} placeholder="اختر القناة" />
          <GInput label="الميزانية (ر.س)" value={budget} onChangeText={setBudget} placeholder="0.00" keyboardType="numeric" />
          <DateInput label="تاريخ البداية" value={startDate} onChange={setStartDate} />
          <DateInput label="تاريخ النهاية" value={endDate} onChange={setEndDate} />
          <GInput label="الجمهور المستهدف" value={targetAudience} onChangeText={setTargetAudience} placeholder="وصف الجمهور المستهدف" />
          <GInput label="الوصف" value={description} onChangeText={setDescription} placeholder="وصف الحملة" multiline />
        </GCard>
        <GButton title="إنشاء الحملة" onPress={handleSave} loading={loading} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({});
