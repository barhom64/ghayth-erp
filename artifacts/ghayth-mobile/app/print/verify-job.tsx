import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PrintJobVerification { jobId?: string; status?: string; documentType?: string; issuedAt?: string; }

export default function PrintVerifyJobScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PrintJobVerification>('/api/print/verify/latest');
  const info = (data && !Array.isArray(data)) ? data as PrintJobVerification : null;
  if (isLoading) return <GLoadingState text="جارٍ التحقق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحقق" description="تحقق من رمز QR"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التحقق من المستند' }} />
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {info ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 8, padding: 16 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>معلومات المستند</Text>
            {!!info.documentType && <Text style={{ color: c.textMuted, fontSize: 14 }}>النوع: {info.documentType}</Text>}
            {!!info.status && <Text style={{ color: c.textMuted, fontSize: 14, marginTop: 6 }}>الحالة: {info.status}</Text>}
            {!!info.issuedAt && <Text style={{ color: c.textFaint, fontSize: 12, marginTop: 6 }}>{new Date(info.issuedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
          </View>
        ) : <GEmptyState icon="qr-code-outline" title="امسح رمز QR للتحقق" description="" />}
      </ScrollView>
    </View>
  );
}
