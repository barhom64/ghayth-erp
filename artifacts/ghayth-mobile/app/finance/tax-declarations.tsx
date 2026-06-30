/**
 * إقرارات الضريبة
 * GET /api/finance/tax/declarations
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface TaxDeclaration {
  id: number;
  period?: string;
  outputVat?: number;
  inputVat?: number;
  netVat?: number;
  currency?: string;
  status?: string;
  submittedAt?: string;
}

export default function TaxDeclarationsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<TaxDeclaration[]>('/api/finance/tax/declarations');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل إقرارات الضريبة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'إقرارات الضريبة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="receipt-outline" title="لا توجد إقرارات ضريبية" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.period ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
              {item.outputVat != null ? <Text style={{ fontSize: 12, color: c.textMuted }}>ضريبة مخرجات: {item.outputVat.toLocaleString('ar-SA')}</Text> : null}
              {item.inputVat != null ? <Text style={{ fontSize: 12, color: '#22C55E' }}>ضريبة مدخلات: {item.inputVat.toLocaleString('ar-SA')}</Text> : null}
            </View>
            {item.netVat != null ? (
              <Text style={{ fontSize: 13, fontWeight: '700', color: item.netVat > 0 ? '#EF4444' : '#22C55E', textAlign: 'right', marginTop: 4 }}>
                صافي الضريبة: {item.netVat.toLocaleString('ar-SA')} {item.currency ?? 'ر.س'}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
