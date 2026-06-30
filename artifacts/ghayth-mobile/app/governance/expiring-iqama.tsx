import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface IqamaExpiry { id?: number; employeeName?: string; iqamaNumber?: string; expiryDate?: string; daysLeft?: number; nationality?: string; }

export default function ExpiringIqama() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<IqamaExpiry[]>('/api/gov-integrations/expiring/iqama');
  const list = Array.isArray(data) ? data : [];
  if (isLoading) return <GLoadingState text="جارٍ تحميل…" />;
  if (isError) return <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال" actionLabel="إعادة المحاولة" onAction={refetch} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إقامات منتهية الصلاحية' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="id-card-outline" title="لا توجد إقامات منتهية" description="" />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
            <Text style={{ color: c.text, fontSize: 15, fontWeight: '600' }}>{item.employeeName ?? ''}</Text>
            {!!item.iqamaNumber && <Text style={{ color: c.textMuted, fontSize: 13, marginTop: 2 }}>رقم الإقامة: {item.iqamaNumber}</Text>}
            <View style={{ flexDirection: 'row-reverse', justifyContent: 'space-between', marginTop: 4 }}>
              {!!item.expiryDate && <Text style={{ color: '#ef4444', fontSize: 12 }}>تنتهي: {new Date(item.expiryDate).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>}
              {item.daysLeft !== undefined && <Text style={{ color: item.daysLeft <= 30 ? '#ef4444' : '#f59e0b', fontSize: 12 }}>{item.daysLeft} يوم متبقٍّ</Text>}
            </View>
          </View>
        )}
      />
    </View>
  );
}
