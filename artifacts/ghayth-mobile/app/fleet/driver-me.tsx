import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface DriverProfile { id?: number; name?: string; licenseNumber?: string; phone?: string; status?: string; }

export default function DriverMe() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<DriverProfile>('/api/fleet/me');
  const profile = (data && !Array.isArray(data)) ? data as DriverProfile : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  if (!profile) return <GEmptyState icon="person-outline" title="لا توجد بيانات" description="" />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'ملفي كسائق' }} />
      <View style={{ padding: 16, gap: 12 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الاسم</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{profile.name ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>رقم الرخصة</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{profile.licenseNumber ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الهاتف</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{profile.phone ?? '—'}</Text>
        </View>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 14 }}>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>الحالة</Text>
          <Text style={{ color: c.text, fontSize: 15, marginTop: 4 }}>{profile.status ?? '—'}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
