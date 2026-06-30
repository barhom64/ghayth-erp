import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface SerialItem { id?: number; serialNumber?: string; productName?: string; status?: string; warehouseName?: string; location?: string; receivedDate?: string; soldDate?: string; }

export default function WarehouseSerialDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<SerialItem>('/api/warehouse/serials/0');
  const d = (data && !Array.isArray(data)) ? data as SerialItem : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['الرقم التسلسلي', d.serialNumber ?? '-'],
    ['المنتج', d.productName ?? '-'],
    ['المستودع', d.warehouseName ?? '-'],
    ['الموقع', d.location ?? '-'],
    ['تاريخ الاستلام', d.receivedDate ? new Date(d.receivedDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'],
    ['تاريخ البيع', d.soldDate ? new Date(d.soldDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'SN: ' + (d.serialNumber ?? '') }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{d.serialNumber ?? '-'}</Text>
        <GStatusBadge status={d.status ?? 'available'} />
      </View>
      {rows.map(([label, value]) => (
        <View key={label} style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>{label}</Text>
          <Text style={{ color: c.text, fontSize: 14 }}>{value}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
