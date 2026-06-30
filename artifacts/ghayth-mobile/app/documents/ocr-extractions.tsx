import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface OcrExtraction {
  id?: number;
  documentId?: number;
  docType?: string;
  confidence?: number;
  status?: string;
  docTitle?: string;
  fileName?: string;
  createdAt?: string;
}

interface OcrResponse {
  data?: OcrExtraction[];
  extractions?: OcrExtraction[];
  [key: string]: unknown;
}

export default function OcrExtractionsScreen() {
  const c = useColors();
  const { data, isLoading, isError, refetch } = useList<OcrResponse>('/api/documents/ocr/extractions');
  const resp = (data && !Array.isArray(data)) ? data as OcrResponse : null;
  const list = resp?.data ?? resp?.extractions ?? (Array.isArray(data) ? data as OcrExtraction[] : []);

  if (isLoading) return <GLoadingState text="جارٍ تحميل مستخلصات OCR…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مستخلصات OCR' }} />
      <FlatList
        data={list}
        keyExtractor={(item, i) => String(item.id ?? i)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="scan-outline" title="لا توجد مستخلصات" description="" />}
        renderItem={({ item }) => {
          const conf = item.confidence ?? 0;
          const confColor = conf >= 0.9 ? '#22C55E' : conf >= 0.7 ? '#F59E0B' : '#EF4444';
          return (
            <Pressable style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }}>
                  {item.docTitle ?? item.fileName ?? `مستخلص #${item.id}`}
                </Text>
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.docType ? <Text style={{ fontSize: 11, color: c.brand }}>{item.docType}</Text> : null}
                <Text style={{ fontSize: 11, color: confColor, fontWeight: '700' }}>دقة: {Math.round(conf * 100)}%</Text>
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
