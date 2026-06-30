/**
 * إضافة كتلة غرف فندقية لمجموعة عمرة
 * POST /api/umrah/room-blocks
 */
import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GInput, GButton, GSelect } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useMutation, useList } from '@/hooks/useApi';
import { DateInput } from '@/components/DateInput';

interface Hotel { id: number; name?: string; city?: string; }

export default function RoomBlockNewScreen() {
  const c = useColors();
  const router = useRouter();
  const { groupId } = useLocalSearchParams<{ groupId?: string }>();

  const { data: hotels } = useList<Hotel[]>('/api/umrah/hotels');
  const hotelList = Array.isArray(hotels) ? hotels : [];

  const [hotelId, setHotelId] = useState('');
  const [roomType, setRoomType] = useState('');
  const [totalRooms, setTotalRooms] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [pricePerNight, setPricePerNight] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useMutation<unknown, Record<string, unknown>>('/api/umrah/room-blocks', 'POST');

  const handleSave = async () => {
    if (!hotelId) { Alert.alert('خطأ', 'يرجى اختيار الفندق'); return; }
    if (!totalRooms) { Alert.alert('خطأ', 'يرجى إدخال عدد الغرف'); return; }
    if (!checkIn || !checkOut) { Alert.alert('خطأ', 'يرجى إدخال تواريخ الإقامة'); return; }
    try {
      await (mutation.mutateAsync as (v: Record<string, unknown>) => Promise<unknown>)({
        hotelId: Number(hotelId),
        groupId: groupId ? Number(groupId) : undefined,
        roomType: roomType || undefined,
        totalRooms: Number(totalRooms),
        checkIn,
        checkOut,
        pricePerNight: pricePerNight ? Number(pricePerNight) : undefined,
        notes: notes || undefined,
      });
      router.back();
    } catch {
      Alert.alert('خطأ', 'تعذّر حفظ كتلة الغرف');
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'كتلة غرف جديدة' }} />

      <GCard style={{ gap: 12 }}>
        <GSelect
          label="الفندق *"
          value={hotelId}
          onChange={setHotelId}
          options={hotelList.map(h => ({ value: String(h.id), label: h.name ?? `#${h.id}` }))}
          placeholder="اختر الفندق"
        />
        <GSelect
          label="نوع الغرفة"
          value={roomType}
          onChange={setRoomType}
          options={[
            { value: 'single', label: 'فردية' },
            { value: 'double', label: 'مزدوجة' },
            { value: 'triple', label: 'ثلاثية' },
            { value: 'quad', label: 'رباعية' },
            { value: 'suite', label: 'جناح' },
          ]}
          placeholder="اختر النوع"
        />
        <GInput label="عدد الغرف *" value={totalRooms} onChangeText={setTotalRooms} keyboardType="number-pad" placeholder="20" />
        <DateInput label="تاريخ الوصول *" value={checkIn} onChange={setCheckIn} />
        <DateInput label="تاريخ المغادرة *" value={checkOut} onChange={setCheckOut} />
        <GInput label="السعر لليلة" value={pricePerNight} onChangeText={setPricePerNight} keyboardType="decimal-pad" placeholder="500" />
        <GInput label="ملاحظات" value={notes} onChangeText={setNotes} multiline />
      </GCard>

      <GButton title="حفظ كتلة الغرف" onPress={handleSave} loading={mutation.isPending} />
    </ScrollView>
  );
}
