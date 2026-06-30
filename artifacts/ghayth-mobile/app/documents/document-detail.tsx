/**
 * تفاصيل المستند
 * GET /api/documents/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface Document {
  id: number;
  ref?: string;
  title?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  category?: string;
  folderName?: string;
  tags?: string[];
  status?: string;
  uploadedBy?: string;
  createdAt?: string;
  expiresAt?: string;
  description?: string;
  entityType?: string;
  entityName?: string;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

function fmtFileSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(fileType?: string): string {
  if (!fileType) return 'document-outline';
  const t = fileType.toLowerCase();
  if (t.includes('pdf')) return 'document-text-outline';
  if (t.includes('image') || t.includes('jpg') || t.includes('png')) return 'image-outline';
  if (t.includes('excel') || t.includes('sheet')) return 'grid-outline';
  if (t.includes('word') || t.includes('doc')) return 'document-outline';
  return 'document-attach-outline';
}

export default function DocumentDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: doc, isLoading } = useList<Document>(`/api/documents/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات المستند…" />;
  if (!doc) return <GEmptyState icon="document-text-outline" title="مستند غير موجود" description="تعذّر العثور على بيانات المستند" />;

  const st = statusBadge(doc.status ?? '');
  const expiry = doc.expiresAt ? new Date(doc.expiresAt) : null;
  const daysLeft = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : null;
  const expiring = daysLeft !== null && daysLeft <= 30 && daysLeft >= 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: doc.title ?? 'المستند' }} />

      <View style={[styles.header, { backgroundColor: '#475569' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{doc.title ?? doc.fileName ?? '—'}</Text>
          {doc.category ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{doc.category}</Text> : null}
          {doc.folderName ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{doc.folderName}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <Ionicons name={getFileIcon(doc.fileType) as never} size={40} color="#FFFFFF80" />
      </View>

      {expiring && (
        <View style={{ backgroundColor: '#FFFBEB', borderBottomColor: '#FCD34D', borderBottomWidth: 1, padding: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
          <Ionicons name="warning-outline" size={18} color="#F59E0B" />
          <Text style={{ fontSize: 13, color: '#B45309', fontWeight: '600' }}>ينتهي المستند خلال {daysLeft} يوم</Text>
        </View>
      )}

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'اسم الملف', value: doc.fileName },
            { label: 'نوع الملف', value: doc.fileType },
            { label: 'الحجم', value: fmtFileSize(doc.fileSize) },
            { label: 'المجلد', value: doc.folderName },
            { label: 'الكيان المرتبط', value: doc.entityName },
            { label: 'رُفع بواسطة', value: doc.uploadedBy },
            { label: 'تاريخ الرفع', value: doc.createdAt ? fmtDate(doc.createdAt) : undefined },
            { label: 'تاريخ الانتهاء', value: doc.expiresAt ? fmtDate(doc.expiresAt) : undefined },
          ].filter(r => r.value && r.value !== '—').map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {doc.tags && doc.tags.length > 0 && (
          <GCard>
            <GText variant="caption" color="muted">الوسوم</GText>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {doc.tags.map((tag, i) => (
                <View key={i} style={{ backgroundColor: c.brand + '20', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <Text style={{ fontSize: 12, color: c.brand }}>{tag}</Text>
                </View>
              ))}
            </View>
          </GCard>
        )}

        {doc.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{doc.description}</Text>
          </GCard>
        ) : null}

        <GButton title="إضافة وثيقة جديدة" icon="document-outline" variant="secondary" onPress={() => router.push('/documents/document-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'center', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
