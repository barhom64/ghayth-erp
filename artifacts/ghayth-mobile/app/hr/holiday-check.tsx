import React, { useState } from 'react';
import { Text, View, TextInput, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface HolidayCheck { isHoliday?: boolean; name?: string; date?: string; }

export default function HolidayCheck() {
  const c = useColors();
  const [date, setDate] = useState('');
  const [query, setQuery] = useState('');
  const { data, isLoading } = useList<HolidayCheck>(query ? `/api/hr/public-holidays/check?date=${query}` : null as unknown as string);
  const result = (data && !Array.isArray(data)) ? data as HolidayCheck : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: 16 }}>
      <Stack.Screen options={{ title: 'فحص العطلة الرسمية' }} />
      <Text style={{ color: c.textMuted, fontSize: 13, marginBottom: 8 }}>أدخل التاريخ (YYYY-MM-DD)</Text>
      <TextInput value={date} onChangeText={setDate} placeholder="2025-01-01"
        style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 12, color: c.text, fontSize: 14, marginBottom: 12 }} />
      <TouchableOpacity onPress={() => setQuery(date)}
        style={{ backgroundColor: c.brand, borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 24 }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>فحص</Text>
      </TouchableOpacity>
      {isLoading && <GLoadingState text="جارٍ الفحص…" />}
      {result && (
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
          <Text style={{ color: result.isHoliday ? c.brand : c.text, fontSize: 16, fontWeight: '700' }}>
            {result.isHoliday ? `عطلة رسمية — ${result.name ?? ''}` : 'يوم عمل عادي'}
          </Text>
        </View>
      )}
    </View>
  );
}
