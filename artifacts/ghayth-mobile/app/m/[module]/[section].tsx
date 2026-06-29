/**
 * قائمة سجلات قسم معين — generic list screen مع ترقيم الصفحات
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { GLoadingState, GEmptyState, GListItem, GStatusBadge, GButton } from '@workspace/ui-native';
import { useColors } from '@/hooks/useColors';
import { apiFetch } from '@/hooks/useApi';
import { getSection, pickField, statusBadge } from '@/lib/moduleSections';
import { setRecord } from '@/lib/recordStore';

type Row = Record<string, unknown>;
const PAGE_SIZE = 30;

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

function getTotal(data: unknown): number | null {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    for (const k of ['total', 'count', 'totalCount', 'pagination']) {
      if (typeof d[k] === 'number') return d[k] as number;
      if (d[k] && typeof d[k] === 'object') {
        const p = d[k] as Record<string, unknown>;
        if (typeof p.total === 'number') return p.total;
      }
    }
  }
  return null;
}

export default function SectionListScreen() {
  const c = useColors();
  const router = useRouter();
  const { module, section } = useLocalSearchParams<{ module: string; section: string }>();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [allRows, setAllRows] = useState<Row[]>([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isError, setIsError] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(true);

  const def = getSection(module, section);

  const fetchPage = useCallback(async (p: number, reset = false) => {
    if (!def) return;
    if (p === 1) setIsLoading(true);
    else setIsLoadingMore(true);
    setIsError(false);
    try {
      const data = await apiFetch(def.endpoint, {
        params: search
          ? { page: p, limit: PAGE_SIZE, search }
          : { page: p, limit: PAGE_SIZE },
      });
      if (!isMounted.current) return;
      const rows = asList<Row>(data);
      const total = getTotal(data);
      if (reset || p === 1) {
        setAllRows(rows);
      } else {
        setAllRows(prev => [...prev, ...rows]);
      }
      const loaded = (p - 1) * PAGE_SIZE + rows.length;
      setHasMore(total !== null ? loaded < total : rows.length === PAGE_SIZE);
    } catch (e: unknown) {
      if (!isMounted.current) return;
      setIsError(true);
      setErrorMsg(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      if (!isMounted.current) return;
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [def, search]);

  // reset on focus or search change
  useFocusEffect(useCallback(() => {
    setPage(1);
    fetchPage(1, true);
  }, [fetchPage]));

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // search debounce
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      fetchPage(1, true);
    }, 400);
  };

  const loadMore = () => {
    if (isLoadingMore || !hasMore) return;
    const next = page + 1;
    setPage(next);
    fetchPage(next);
  };

  if (!def) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack.Screen options={{ title: 'قسم غير معروف' }} />
        <GEmptyState icon="help-circle-outline" title="قسم غير معروف" description="تعذّر العثور على هذا القسم." />
      </View>
    );
  }

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
          headerRight: def.write?.createEndpoint ? () => (
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
          onChangeText={onSearchChange}
          placeholder="بحث…"
          placeholderTextColor={c.textFaint}
          style={[styles.searchInput, { backgroundColor: c.inputBg, borderColor: c.inputBorder, color: c.text }]}
        />
        <Ionicons name="search-outline" size={18} color={c.textFaint} />
      </View>

      {isLoading ? (
        <GLoadingState text="جارٍ التحميل…" />
      ) : isError ? (
        <GEmptyState
          icon="alert-circle-outline"
          title="حدث خطأ"
          description={errorMsg}
          actionLabel="إعادة المحاولة"
          onAction={() => { setPage(1); fetchPage(1, true); }}
        />
      ) : (
        <FlatList
          data={allRows}
          keyExtractor={(r, i) => String(r.id ?? i)}
          contentContainerStyle={{ paddingBottom: 40, flexGrow: 1 }}
          refreshing={isLoading}
          onRefresh={() => { setPage(1); fetchPage(1, true); }}
          ListEmptyComponent={
            <GEmptyState
              icon={def.icon as never ?? 'list-outline'}
              title="لا توجد بيانات"
              description={`لا توجد سجلات في ${def.label} بعد.`}
            />
          }
          ListFooterComponent={
            hasMore && allRows.length > 0 ? (
              <View style={{ padding: 16 }}>
                <GButton
                  title="تحميل المزيد"
                  variant="secondary"
                  loading={isLoadingMore}
                  onPress={loadMore}
                />
              </View>
            ) : allRows.length > 0 ? (
              <Text style={{ textAlign: 'center', color: c.textFaint, fontSize: 12, padding: 16 }}>
                {allRows.length} سجل
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const rowTitle = String(pickField(item, def.titleFields) ?? `#${item.id ?? ''}`);
            const st = def.statusField ? statusBadge(pickField(item, [def.statusField])) : null;
            const noDetail = def.write?.noDetail;
            return (
              <GListItem
                title={rowTitle}
                subtitle={buildSubtitle(item)}
                leading={def.icon as never}
                trailing={st ? <GStatusBadge status={st.label} size="sm" /> : undefined}
                onPress={noDetail ? undefined : () => {
                  setRecord({ title: rowTitle, row: item, module, section });
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
