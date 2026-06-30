/**
 * الوثائق المنتهية الصلاحية
 * GET /api/hr/expiring-documents
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface ExpiringDocument {
  id: number;
  employeeName?: string;
  documentType?: string;
  expiryDate?: string;
  daysLeft?: number;
  documentNumber?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function ExpiringDocumentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<ExpiringDocument[]>('/api/hr/expiring-documents');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الوثائق المنتهية…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'الوثائق المنتهية الصلاحية' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-lock-outline" title="لا توجد وثائق منتهية" description="" />}
        renderItem={({ item }) => {
          const urgent = item.daysLeft != null && item.daysLeft <= 30;
          return (
            <Pressable
              style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: urgent ? '#FEE2E2' : c.border, padding: 14 }}
            >
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: c.text, flex: 1, textAlign: 'right' }}>{item.employeeName ?? '—'}</Text>
                {item.daysLeft != null ? (
                  <Text style={{ fontSize: 13, fontWeight: '700', color: urgent ? '#EF4444' : '#F59E0B' }}>
                    {item.daysLeft} يوم
                  </Text>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
                {item.documentType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.documentType}</Text> : null}
                {item.expiryDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>انتهاء: {fmtDate(item.expiryDate)}</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
