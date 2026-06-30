/**
 * إنشاء خط سير نقل جديد
 * POST /api/transport/itineraries
 */
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GCard, GInput, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation } from '@/hooks/useApi';

export default function ItineraryNewScreen() {
  const c = useColors();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [totalDistanceKm, setTotalDistanceKm] = useState('');
  const [estimatedDurationMin, setEstimatedDurationMin] = useState('');

  const mutation = useMutation<unknown, Record<string, unknown>>('/api/transport/itineraries', 'POST');

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('خطأ', 'يرجى إدخال عنوان خط السير'); return; }
    try {
      await (mutation.mutateAsync as (v: Record<string, unknown>) => Promise<unknown>)({
        title: title.trim(),
        description: description || undefined,
        totalDistanceKm: totalDistanceKm ? Number(totalDistanceKm) : undefined,
        estimatedDurationMin: estimatedDurationMin ? Number(estimatedDurationMin) : undefined,
      });
      router.back();
    } catch {
      Alert.alert('خطأ', 'تعذّر حفظ خط السير');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'خط سير جديد' }} />
      <GCard style={{ gap: 12 }}>
        <GInput label="عنوان خط السير *" value={title} onChangeText={setTitle} placeholder="مثال: مكة ← مدينة" />
        <GInput label="الوصف" value={description} onChangeText={setDescription} multiline />
        <GInput label="إجمالي المسافة (كم)" value={totalDistanceKm} onChangeText={setTotalDistanceKm} keyboardType="decimal-pad" />
        <GInput label="المدة التقديرية (دقيقة)" value={estimatedDurationMin} onChangeText={setEstimatedDurationMin} keyboardType="number-pad" />
      </GCard>
      <GButton title="حفظ خط السير" onPress={handleSave} loading={mutation.isPending} />
    </ScrollView>
  );
}
