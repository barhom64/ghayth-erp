import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface PortalInvoice { id?: number; number?: string; amount?: number; status?: string; dueDate?: string; issueDate?: string; items?: { description?: string; qty?: number; unitPrice?: number }[]; }

export default function PortalInvoiceDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<PortalInvoice>('/api/portal/invoices/0');
  const d = (data && !Array.isArray(data)) ? data as PortalInvoice : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'فاتورة #' + (d.number ?? '') }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>فاتورة #{d.number}</Text>
        <GStatusBadge status={d.status ?? 'pending'} />
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '700', marginTop: 8 }}>{(d.amount ?? 0).toLocaleString('ar-SA')} ر.س</Text>
      </View>
      {(d.items ?? []).map((item, i) => (
        <View key={i} style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
          <Text style={{ color: c.text, fontSize: 13 }}>{item.description} × {item.qty}</Text>
          <Text style={{ color: c.textMuted, fontSize: 12 }}>{(item.unitPrice ?? 0).toLocaleString('ar-SA')} ر.س/وحدة</Text>
        </View>
      ))}
    </ScrollView>
  );
}
