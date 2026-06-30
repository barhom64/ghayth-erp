/**
 * إدارة التكاملات
 * GET /api/admin/integrations
 */
import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { GLoadingState, GEmptyState, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { statusBadge } from '@/lib/moduleSections';

interface Integration {
  id: number;
  name?: string;
  type?: string;
  status?: string;
  lastTestedAt?: string;
  config?: Record<string, unknown>;
}

function fmtDate(val?: string): string {
  if (!val) return '—';
  try { return new Date(val).toLocaleDateString('ar-SA', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return val; }
}

const TYPE_ICON: Record<string, string> = {
  smtp: 'mail-outline',
  whatsapp: 'logo-whatsapp',
  payment: 'card-outline',
  storage: 'cloud-outline',
  sms: 'chatbubble-outline',
  erp: 'git-branch-outline',
};

export default function AdminIntegrationsScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useList<Integration[]>('/api/admin/integrations');
  const integrations = Array.isArray(data) ? data : [];

  const handleTest = async (id: number) => {
    try {
      await apiFetch(`/api/admin/integrations/${id}/test`, { method: 'POST', body: JSON.stringify({}) });
      await qc.invalidateQueries({ queryKey: ['/api/admin/integrations'] });
      Alert.alert('نجح الاختبار', 'تم التحقق من التكامل بنجاح');
    } catch {
      Alert.alert('فشل الاختبار', 'تعذّر الاتصال بالتكامل');
    }
  };

  if (isLoading) return <GLoadingState text="جارٍ تحميل التكاملات…" />;
  if (isError) return (
    <GEmptyState
      icon="alert-circle-outline"
      title="تعذّر التحميل"
      description="تحقق من الاتصال وأعد المحاولة"
      actionLabel="إعادة المحاولة"
      onAction={refetch}
    />
  );

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: 'التكاملات الخارجية' }} />
      <FlatList
        data={integrations}
        keyExtractor={item => String(item.id)}
        contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <GEmptyState icon="link-outline" title="لا توجد تكاملات" description="لا توجد تكاملات خارجية مُعدَّة بعد" />
        }
        renderItem={({ item }) => {
          const st = statusBadge(item.status ?? '');
          const icon = TYPE_ICON[item.type ?? ''] ?? 'link-outline';
          return (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={[styles.iconBox, { backgroundColor: c.brand + '20' }]}>
                <Ionicons name={icon as never} size={18} color={c.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: c.text, textAlign: 'right' }}>
                  {item.name ?? '—'}
                </Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {item.type ?? '—'} · آخر اختبار: {fmtDate(item.lastTestedAt)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                {st ? <GStatusBadge status={st.label} size="sm" /> : null}
                <Pressable
                  onPress={() => handleTest(item.id)}
                  style={({ pressed }) => [styles.testBtn, { backgroundColor: pressed ? c.brand + 'CC' : c.brand }]}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>اختبار</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  iconBox: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  testBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
});
