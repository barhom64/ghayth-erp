/**
 * تفاصيل قالب المستند
 * GET /api/documents/templates/:id
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { GCard, GText, GLoadingState, GEmptyState, GStatusBadge , GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList } from '@/hooks/useApi';
import { statusBadge } from '@/lib/moduleSections';

interface DocumentTemplate {
  id: number;
  name?: string;
  type?: string;
  category?: string;
  module?: string;
  status?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  description?: string;
  usageCount?: number;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return val; }
}

export default function DocumentTemplateDetailScreen() {
  const c = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: tmpl, isLoading } = useList<DocumentTemplate>(`/api/documents/templates/${id}`);

  if (isLoading) return <GLoadingState text="جارٍ تحميل بيانات القالب…" />;
  if (!tmpl) return <GEmptyState icon="document-outline" title="قالب غير موجود" description="تعذّر العثور على بيانات القالب" />;

  const st = statusBadge(tmpl.status ?? '');
  const active = tmpl.status === 'active';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <Stack.Screen options={{ title: tmpl.name ?? 'قالب مستند' }} />

      <View style={[styles.header, { backgroundColor: active ? '#0284C7' : '#6B7280' }]}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: '#FFF', textAlign: 'right' }}>{tmpl.name ?? '—'}</Text>
          {tmpl.category ? <Text style={{ fontSize: 13, color: '#FFFFFFCC', textAlign: 'right' }}>{tmpl.category}</Text> : null}
          {tmpl.module ? <Text style={{ fontSize: 12, color: '#FFFFFFAA', textAlign: 'right' }}>{tmpl.module}</Text> : null}
          {st ? <View style={{ marginTop: 6, alignSelf: 'flex-end' }}><GStatusBadge status={st.label} size="sm" /></View> : null}
        </View>
        <View style={{ alignItems: 'center' }}>
          <Ionicons name="document-outline" size={36} color="#FFF" />
          {tmpl.usageCount !== undefined && (
            <Text style={{ fontSize: 12, color: '#FFFFFFCC', marginTop: 4 }}>{tmpl.usageCount} استخدام</Text>
          )}
        </View>
      </View>

      <View style={{ padding: 16, gap: 12 }}>
        <GCard style={{ gap: 0, padding: 0 }}>
          {[
            { label: 'النوع', value: tmpl.type },
            { label: 'التصنيف', value: tmpl.category },
            { label: 'الوحدة', value: tmpl.module },
            { label: 'أنشئ بواسطة', value: tmpl.createdBy },
            { label: 'تاريخ الإنشاء', value: tmpl.createdAt ? fmtDate(tmpl.createdAt) : undefined },
            { label: 'آخر تحديث', value: tmpl.updatedAt ? fmtDate(tmpl.updatedAt) : undefined },
          ].filter(r => r.value).map((row, i, arr) => (
            <View key={row.label} style={[styles.infoRow, { borderBottomColor: c.border }, i < arr.length - 1 && { borderBottomWidth: 1 }]}>
              <Text style={{ fontSize: 14, color: c.text, textAlign: 'right', flex: 1 }}>{row.value}</Text>
              <Text style={{ fontSize: 12, color: c.textMuted, minWidth: 130, textAlign: 'right' }}>{row.label}</Text>
            </View>
          ))}
        </GCard>

        {tmpl.description ? (
          <GCard>
            <GText variant="caption" color="muted">الوصف</GText>
            <Text style={{ fontSize: 13, color: c.text, textAlign: 'right' }}>{tmpl.description}</Text>
          </GCard>
        ) : null}

        <GButton title="قالب جديد" icon="copy-outline" variant="secondary" onPress={() => router.push('/documents/template-new' as never)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row-reverse', alignItems: 'flex-start', padding: 20, gap: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
});
