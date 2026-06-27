/**
 * قائمة سجلات قسم معين — generic list screen
 */
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { GLoadingState, GEmptyState, GListItem, GStatusBadge } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/hooks/useApi';
import { getSection, pickField, statusBadge } from '@/lib/moduleSections';
import { setRecord } from '@/lib/recordStore';

type Row = Record<string, unknown>;

function formatCurrency(val: unknown): string {
  const n = Number(val);
  if (isNaN(n)) return String(val ?? '');
  return n.toLocaleString('ar-SA') + ' ر.س';
}

function formatDateAr(val: unknown): string {
  if (!val) return '';
  try { return new Date(String(val)).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return String(val); }
}

function asList<T>(data: unknown): T[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as T[];
  if (typeof data === 'object' && data !== null) {
    const d = data as Record<string, unknown>;
    const keys = ['data', 'items', 'rows', 'results', 'list'];
    for (const k of keys) { if (Array.isArray(d[k])) return d[k] as T[]; }
  }
  return [];
}

export default function SectionListScreen() {
  const c = useColors();
  const router = useRouter();
  const { module, section } = useLocalSearchParams<{ module: string; section: string }>();
  const [search, setSearch] = useState('');

  const def = getSection(module, section);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['section', module, section],
    queryFn: () => apiFetch(def!.endpoint, { params: { page: 1, limit: 30 } }),
    enabled: !!def,
  });

  useFocusEffect(useCallback(() => { if (def) refetch(); }, [def, refetch]));

  if (!def) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: 'قسم غير معروف' }} />
        <GEmptyState icon="help-circle-outline" title="قسم غير معروف" description="تعذّر العثور على هذا القسم." />
      </View>
    );
  }

  const rows = asList<Row>(data);
  const filtered = search
    ? rows.filter(r => JSON.stringify(r).includes(search))
    : rows;

  const buildSubtitle = (item: Row): string | undefined => {
    const parts: string[] = [];
    const amount = pickField(item, def.amountFields ?? []);
    if (amount !== null && amount !== undefined) parts.push(formatCurrency(amount));
    for (const f of def.subtitleFields ?? []) {
      const v = item[f];
      if (v !== null && v !== undefined && v !== '') parts.push(String(v));
    }
    const date = pickField(item, def.dateFields ?? []);
    if (date !== null && date !== undefined) parts.push(formatDateAr(date));
    return parts.length ? parts.join(' · ') : undefined;
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen
        options={{
          title: def.label,
          headerRight: def.createEndpoint ? () => (
            <Pressable
              onPress={() => router.push({ pathname: '/m/[module]/[section]/form', params: { module, section } })}
              style={{ marginLeft: 12 }}
            >
              <Ionicons name="add-circle-outline" size={26} color={c.brand} />
            </Pressable>
          ) : undefined,
        }}
      />

      {/* بحث */}
      <View style={[styles.searchBox, { backgroundColor: c.surface, borderBottomColor: c.border }]}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="بحث…"
          placeholderTextColor={c.textFaint}
          style={[styles.searchInput, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
        />
        <Ionicons name="search-outline" size={18} color={c.textFaint} />
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : isError ? (
        <GEmptyState icon="alert-circle-outline" title="حدث خطأ" description={String((error as Error)?.message ?? '')} actionLabel="إعادة المحاولة" onAction={refetch} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(r, i) => String(r.id ?? i)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          refreshing={isFetching}
          onRefresh={refetch}
          ListEmptyComponent={
            <GEmptyState icon={def.icon as never ?? 'list-outline'} title="لا توجد بيانات" description={`لا توجد سجلات في ${def.label} بعد.`} />
          }
          renderItem={({ item }) => {
            const title = String(pickField(item, def.titleFields) ?? `#${item.id ?? ''}`);
            const st = def.statusField ? statusBadge(pickField(item, [def.statusField])) : null;
            return (
              <GListItem
                title={title}
                subtitle={buildSubtitle(item)}
                leading={def.icon as never}
                trailing={st ? <GStatusBadge status={st.label} size="sm" /> : undefined}
                onPress={() => {
                  setRecord({ title, row: item });
                  router.push('/record');
                }}
              />
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1 },
  searchInput: { flex: 1, height: 38, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 14, textAlign: 'right' },
});
