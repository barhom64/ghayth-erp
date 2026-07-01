import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface NextCode { nextCode?: string; parentCode?: string; }

export default function AccountsNextCodeScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<NextCode>('/api/finance/accounts/next-code');
  const info = (data && !Array.isArray(data)) ? data as NextCode : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الرمز التالي للحساب' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 20 }}>
          <Text style={{ color: c.textMuted, fontSize: 12, marginBottom: 8 }}>الرمز التالي المقترح</Text>
          <Text style={{ color: c.brand, fontSize: 32, fontWeight: 'bold' }}>{info?.nextCode ?? '-'}</Text>
          {info?.parentCode ? <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 8 }}>الحساب الأب: {info.parentCode}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}
