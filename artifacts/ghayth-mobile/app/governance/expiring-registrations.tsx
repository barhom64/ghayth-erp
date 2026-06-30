import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExpiringReg {
  id?: number;
  entityName?: string;
  registrationType?: string;
  registrationNumber?: string;
  expiryDate?: string;
  daysLeft?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ExpiringRegistrationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExpiringReg[]>('/api/gov-integrations/expiring/registration');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل التراخيص المنتهية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التراخيص المنتهية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="shield-checkmark-outline" title="لا توجد تراخيص منتهية" description="" />}
        renderItem={({ item }) => {
          const urgent = (item.daysLeft ?? 999) <= 30;
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, borderRightWidth: urgent ? 3 : 0, borderRightColor: '#EF4444', padding: 14 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right', marginBottom: 4 }}>{item.entityName ?? '—'}</Text>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {item.registrationType ? <Text style={{ fontSize: 11, color: c.brand }}>{item.registrationType}</Text> : null}
                {item.registrationNumber ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.registrationNumber}</Text> : null}
                {item.daysLeft != null ? <Text style={{ fontSize: 11, color: urgent ? '#EF4444' : c.textFaint }}>{item.daysLeft} يوم</Text> : null}
                {item.expiryDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.expiryDate)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
