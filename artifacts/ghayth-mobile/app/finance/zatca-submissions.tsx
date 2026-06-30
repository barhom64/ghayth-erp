import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ZatcaSubmission { id?: number; invoiceId?: number; status?: string; submittedAt?: string; response?: string; }

export default function ZatcaSubmissions() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ZatcaSubmission[]>('/api/finance/zatca/submissions');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إرسالات ZATCA' }} />
      <FlatList data={list} keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch} refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="cloud-upload-outline" title="لا توجد إرسالات" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: c.text, fontSize: 14 }}>فاتورة #{item.invoiceId ?? '—'}</Text>
              {item.submittedAt && <Text style={{ color: c.textMuted, fontSize: 12, marginTop: 2 }}>{new Date(item.submittedAt).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
            </View>
            <Text style={{ color: item.status === 'accepted' ? '#22c55e' : item.status === 'rejected' ? '#ef4444' : c.textMuted, fontSize: 12 }}>{item.status === 'accepted' ? 'مقبول' : item.status === 'rejected' ? 'مرفوض' : item.status ?? ''}</Text>
          </View>
        )}
      />
    </View>
  );
}
