/**
 * مكتبة الوثائق
 * GET /api/documents
 */
import React, { useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';

interface Document {
  id: number;
  title?: string;
  documentType?: string;
  entityType?: string;
  entityName?: string;
  fileType?: string;
  fileSize?: number;
  uploadedBy?: string;
  uploadedAt?: string;
  expiryDate?: string;
  status?: string;
  isConfidential?: boolean;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILE_ICON: Record<string, string> = {
  pdf: 'document-text-outline',
  image: 'image-outline',
  excel: 'grid-outline',
  word: 'document-outline',
  video: 'videocam-outline',
};

export default function DocumentsListScreen() {
  const c = useColors();
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useList<Document[]>('/api/documents');
  const list = Array.isArray(data) ? data : [];

  if (isLoading) return <GLoadingState text="جارٍ تحميل الوثائق…" />;
  if (isError) return (
    <GEmptyState icon="alert-circle-outline" title="تعذّر التحميل" description="تحقق من الاتصال"
      actionLabel="إعادة المحاولة" onAction={refetch} />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'مكتبة الوثائق' }} />
      <FlatList
        data={list}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={<GEmptyState icon="folder-open-outline" title="لا توجد وثائق" description="" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/documents/document-detail' as never, params: { id: item.id } })}
            style={{ backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, padding: 14, flexDirection: 'row-reverse', gap: 10 }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: c.brand + '20', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={(FILE_ICON[item.fileType ?? ''] ?? 'document-outline') as never} size={18} color={c.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, flex: 1, textAlign: 'right' }} numberOfLines={1}>{item.title ?? '—'}</Text>
                {item.isConfidential ? (
                  <Ionicons name="lock-closed-outline" size={14} color="#EF4444" />
                ) : null}
                <GStatusBadge status={item.status ?? ''} />
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 8, marginBottom: 2 }}>
                {item.documentType ? <Text style={{ fontSize: 11, color: c.brand }}>{item.documentType}</Text> : null}
                {item.entityName ? <Text style={{ fontSize: 11, color: c.textMuted }}>{item.entityName}</Text> : null}
              </View>
              <View style={{ flexDirection: 'row-reverse', gap: 12 }}>
                {item.fileSize ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtSize(item.fileSize)}</Text> : null}
                {item.expiryDate ? <Text style={{ fontSize: 11, color: '#F59E0B' }}>تنتهي: {fmtDate(item.expiryDate)}</Text> : null}
                {item.uploadedAt ? <Text style={{ fontSize: 11, color: c.textFaint }}>{fmtDate(item.uploadedAt)}</Text> : null}
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}
