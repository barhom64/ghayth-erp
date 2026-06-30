import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface RentalContract { id?: number; contractNumber?: string; vehicleId?: number; vehiclePlate?: string; tenantName?: string; startDate?: string; endDate?: string; monthlyRate?: number; status?: string; depositAmount?: number; }

export default function RentalContractDetailScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<RentalContract>('/api/fleet/rental-contracts/0');
  const d = (data && !Array.isArray(data)) ? data as RentalContract : null;
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError || !d) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );
  const rows: [string, string][] = [
    ['رقم العقد', d.contractNumber ?? '-'],
    ['المركبة', d.vehiclePlate ?? String(d.vehicleId ?? '-')],
    ['المستأجر', d.tenantName ?? '-'],
    ['تاريخ البدء', d.startDate ? new Date(d.startDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'],
    ['تاريخ الانتهاء', d.endDate ? new Date(d.endDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'],
    ['الإيجار الشهري', (d.monthlyRate ?? 0).toLocaleString('ar-SA') + ' ر.س'],
    ['التأمين', (d.depositAmount ?? 0).toLocaleString('ar-SA') + ' ر.س'],
  ];
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'عقد إيجار #' + (d.contractNumber ?? '') }} />
      <View style={{ backgroundColor: c.surface, padding: 16, borderBottomWidth: 1, borderBottomColor: c.border }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{d.contractNumber ?? '-'}</Text>
        <GStatusBadge status={d.status ?? 'active'} />
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
