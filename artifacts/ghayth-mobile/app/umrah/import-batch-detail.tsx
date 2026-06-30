/**
 * تفاصيل دُفعة الاستيراد — عرض التغييرات وغير المُطابَقين
 * GET /api/umrah/import/batches/:id/changes
 * GET /api/umrah/import/batches/:id/unlinked
 */
import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { GLoadingState, GEmptyState, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { useList, apiFetch } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';

type DetailTab = 'changes' | 'unlinked';

interface ChangeRecord {
  id?: number;
  pilrimName?: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  status?: string;
}

interface UnlinkedRecord {
  id?: number;
  name?: string;
  passport?: string;
  nationality?: string;
  reason?: string;
}

export default function ImportBatchDetailScreen() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<DetailTab>('changes');
  const [linking, setLinking] = useState<number | null>(null);

  const { data: changes, isLoading: loadC } = useList<ChangeRecord[]>(`/api/umrah/import/batches/${id}/changes`);
  const { data: unlinked, isLoading: loadU, refetch: refetchU } = useList<UnlinkedRecord[]>(`/api/umrah/import/batches/${id}/unlinked`);

  const changeList = Array.isArray(changes) ? changes : [];
  const unlinkedList = Array.isArray(unlinked) ? unlinked : [];
  const isLoading = tab === 'changes' ? loadC : loadU;

  const handleLink = async (recordId: number) => {
    Alert.alert('ربط السجل', 'هل تريد ربط هذا السجل بمعتمر موجود؟', [
      { text: 'إلغاء', style: 'cancel' },
      {
        text: 'ربط', onPress: async () => {
          setLinking(recordId);
          try {
            await apiFetch(`/api/umrah/import/batches/${id}/unlinked/link`, {
              method: 'POST',
              body: JSON.stringify({ recordId }),
            });
            await qc.invalidateQueries({ queryKey: [`/api/umrah/import/batches/${id}/unlinked`] });
          } catch {
            Alert.alert('خطأ', 'تعذّر ربط السجل');
          } finally {
            setLinking(null);
          }
        }
      },
    ]);
  };

  const TABS: { key: DetailTab; label: string }[] = [
    { key: 'changes', label: 'التغييرات' },
    { key: 'unlinked', label: 'غير المُطابَقين' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: `دُفعة #${id}` }} />

      <View style={[styles.tabs, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[styles.tab, tab === t.key && { borderBottomColor: c.brand, borderBottomWidth: 2 }]}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: tab === t.key ? c.brand : c.textMuted }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : tab === 'changes' ? (
        <FlatList
          data={changeList}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          ListEmptyComponent={<GEmptyState icon="checkmark-circle-outline" title="لا توجد تغييرات" description="لا توجد تغييرات في هذه الدُّفعة" />}
          renderItem={({ item }) => (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.pilrimName ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>{item.fieldName ?? '—'}</Text>
                <View style={{ flexDirection: 'row-reverse', gap: 6, marginTop: 4 }}>
                  <Text style={{ fontSize: 11, color: '#EF4444' }}>{item.oldValue ?? '—'}</Text>
                  <Text style={{ fontSize: 11, color: c.textFaint }}>←</Text>
                  <Text style={{ fontSize: 11, color: '#22C55E' }}>{item.newValue ?? '—'}</Text>
                </View>
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={unlinkedList}
          keyExtractor={(item, i) => String(item.id ?? i)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          ListEmptyComponent={<GEmptyState icon="link-outline" title="لا يوجد غير مُطابَقين" description="تم ربط جميع سجلات الدُّفعة" />}
          renderItem={({ item, index }) => (
            <View style={[styles.row, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: c.text, textAlign: 'right' }}>{item.name ?? '—'}</Text>
                <Text style={{ fontSize: 12, color: c.textMuted, textAlign: 'right', marginTop: 2 }}>
                  {item.passport ?? '—'} · {item.nationality ?? '—'}
                </Text>
                {item.reason ? (
                  <Text style={{ fontSize: 11, color: '#EF4444', textAlign: 'right', marginTop: 2 }}>{item.reason}</Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => handleLink(item.id ?? index)}
                disabled={linking === (item.id ?? index)}
                style={({ pressed }) => [styles.linkBtn, { backgroundColor: pressed ? c.brand + 'CC' : c.brand, opacity: linking === (item.id ?? index) ? 0.5 : 1 }]}
              >
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>ربط</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomColor: 'transparent', borderBottomWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, gap: 10 },
  linkBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6 },
});
