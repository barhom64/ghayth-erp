/**
 * وثائق الشركة
 * GET /api/hr/company-documents
 */
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface CompanyDocument {
  id: number;
  title?: string;
  documentType?: string;
  issuedBy?: string;
  expiryDate?: string;
  status?: string;
  attachmentUrl?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

export default function CompanyDocumentsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<CompanyDocument[]>('/api/hr/company-documents');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل وثائق الشركة…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'وثائق الشركة' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="document-outline" title="لا توجد وثائق" description="" />}
        renderItem={({ item }) => (
          <Pressable
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}
          >
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>{item.title ?? '—'}</Text>
              <GStatusBadge status={item.status ?? ''} />
            </View>
            <View style={{ flexDirection: 'row-reverse', gap: 8 }}>
              {item.documentType ? <Text style={{ fontSize: 12, color: c.brand }}>{item.documentType}</Text> : null}
              {item.issuedBy ? <Text style={{ fontSize: 12, color: c.textMuted }}>{item.issuedBy}</Text> : null}
              {item.expiryDate ? <Text style={{ fontSize: 11, color: c.textFaint }}>انتهاء: {fmtDate(item.expiryDate)}</Text> : null}
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
